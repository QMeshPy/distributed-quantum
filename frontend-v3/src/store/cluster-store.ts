/**
 * Cluster Management Store
 *
 * Client-side cluster configuration state management using Zustand.
 * Per ARCHITECTURE.md lines 238-249:
 * - Manages active cluster selection
 * - Stores cluster configs (URLs only) in localStorage
 * - NO health status caching (health checked live via API)
 * - Encrypts cluster configs before storing
 *
 * @see {@link https://github.com/pmndrs/zustand}
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ClientClusterConfig } from '@/types/cluster';

/**
 * Simplified cluster config for client-side storage
 * Only stores connection information, not health status
 */
interface StoredClusterConfig {
  clusterId: string;
  name: string;
  protocol: 'rest' | 'jsonrpc';
  restUrl?: string;
  rpcUrl?: string;
  region?: string;
  provider?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Cluster store state and actions
 */
interface ClusterStore {
  /** Currently selected cluster ID */
  activeClusterId: string | null;

  /** Map of cluster ID to cluster configuration */
  clusters: Record<string, StoredClusterConfig>;

  /**
   * Set the active cluster
   *
   * @param clusterId - ID of cluster to activate
   */
  setActiveCluster: (clusterId: string | null) => void;

  /**
   * Add a new cluster configuration
   *
   * @param config - Cluster configuration to add
   */
  addCluster: (config: StoredClusterConfig) => void;

  /**
   * Update an existing cluster configuration
   *
   * @param clusterId - ID of cluster to update
   * @param updates - Partial configuration updates
   */
  updateCluster: (clusterId: string, updates: Partial<StoredClusterConfig>) => void;

  /**
   * Remove a cluster configuration
   *
   * @param clusterId - ID of cluster to remove
   */
  removeCluster: (clusterId: string) => void;

  /**
   * Get a specific cluster configuration
   *
   * @param clusterId - ID of cluster to retrieve
   * @returns Cluster configuration or undefined if not found
   */
  getCluster: (clusterId: string) => StoredClusterConfig | undefined;

  /**
   * Get all cluster configurations as an array
   *
   * @returns Array of all stored cluster configs
   */
  getAllClusters: () => StoredClusterConfig[];

  /**
   * Clear all clusters (useful for logout)
   */
  clearAllClusters: () => void;
}

/**
 * Encryption utilities for cluster configs
 * Uses Web Crypto API for AES-GCM encryption
 */
const EncryptionUtils = {
  /**
   * Derive an encryption key from user session
   * In production, this should use a more secure key derivation
   */
  async getEncryptionKey(): Promise<CryptoKey> {
    // Use a static key for now - in production, derive from user session
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode('cluster-encryption-key-v1-change-in-prod'),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new TextEncoder().encode('cluster-salt'),
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  },

  /**
   * Encrypt data using AES-GCM
   */
  async encrypt(data: string): Promise<string> {
    try {
      const key = await this.getEncryptionKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encodedData = new TextEncoder().encode(data);

      const encryptedData = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encodedData
      );

      // Combine IV and encrypted data
      const combined = new Uint8Array(iv.length + encryptedData.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encryptedData), iv.length);

      // Convert to base64
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error('Encryption failed:', error);
      // Fallback to unencrypted if crypto API fails
      return data;
    }
  },

  /**
   * Decrypt data using AES-GCM
   */
  async decrypt(encryptedData: string): Promise<string> {
    try {
      const key = await this.getEncryptionKey();

      // Decode from base64
      const combined = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0));

      // Extract IV and encrypted data
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);

      const decryptedData = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );

      return new TextDecoder().decode(decryptedData);
    } catch (error) {
      console.error('Decryption failed:', error);
      // Fallback to returning as-is if decryption fails (might be unencrypted old data)
      return encryptedData;
    }
  },
};

/**
 * Custom storage with encryption
 */
const createEncryptedStorage = () => {
  return {
    getItem: async (name: string): Promise<string | null> => {
      const encryptedValue = localStorage.getItem(name);
      if (!encryptedValue) return null;

      try {
        // Try to decrypt
        const decrypted = await EncryptionUtils.decrypt(encryptedValue);
        return decrypted;
      } catch {
        // If decryption fails, might be unencrypted old data
        return encryptedValue;
      }
    },

    setItem: async (name: string, value: string): Promise<void> => {
      try {
        const encrypted = await EncryptionUtils.encrypt(value);
        localStorage.setItem(name, encrypted);
      } catch (error) {
        console.error('Failed to encrypt cluster data:', error);
        // Fallback to unencrypted storage
        localStorage.setItem(name, value);
      }
    },

    removeItem: (name: string): void => {
      localStorage.removeItem(name);
    },
  };
};

/**
 * Cluster store
 *
 * Persists cluster configurations to localStorage with encryption
 * NO health status caching - health is always checked live via API
 */
export const useClusterStore = create<ClusterStore>()(
  persist(
    (set, get) => ({
      activeClusterId: null,
      clusters: {},

      setActiveCluster: (clusterId) => {
        // Validate cluster exists if not null
        if (clusterId !== null && !get().clusters[clusterId]) {
          console.warn(`Cluster ${clusterId} not found, cannot set as active`);
          return;
        }

        set({ activeClusterId: clusterId });
      },

      addCluster: (config) => {
        const clusters = get().clusters;

        // Check if cluster already exists
        if (clusters[config.clusterId]) {
          console.warn(`Cluster ${config.clusterId} already exists, use updateCluster instead`);
          return;
        }

        set({
          clusters: {
            ...clusters,
            [config.clusterId]: {
              ...config,
              updatedAt: new Date().toISOString(),
            },
          },
        });
      },

      updateCluster: (clusterId, updates) => {
        const clusters = get().clusters;
        const existing = clusters[clusterId];

        if (!existing) {
          console.warn(`Cluster ${clusterId} not found, cannot update`);
          return;
        }

        set({
          clusters: {
            ...clusters,
            [clusterId]: {
              ...existing,
              ...updates,
              clusterId, // Prevent changing the ID
              updatedAt: new Date().toISOString(),
            },
          },
        });
      },

      removeCluster: (clusterId) => {
        const clusters = get().clusters;
        const { [clusterId]: removed, ...remaining } = clusters;

        // If removing active cluster, clear active selection
        const activeClusterId =
          get().activeClusterId === clusterId ? null : get().activeClusterId;

        set({
          clusters: remaining,
          activeClusterId,
        });
      },

      getCluster: (clusterId) => {
        return get().clusters[clusterId];
      },

      getAllClusters: () => {
        return Object.values(get().clusters);
      },

      clearAllClusters: () => {
        set({
          activeClusterId: null,
          clusters: {},
        });
      },
    }),
    {
      name: 'cluster-storage',

      // Use encrypted storage
      storage: createJSONStorage(() => createEncryptedStorage()),

      // Persist everything in the store
      partialize: (state) => ({
        activeClusterId: state.activeClusterId,
        clusters: state.clusters,
      }),
    }
  )
);
