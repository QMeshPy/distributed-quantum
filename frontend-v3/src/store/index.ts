/**
 * Store Exports and Initialization
 *
 * Central export point for all Zustand stores.
 * Provides convenience hooks and devtools integration.
 *
 * Per ARCHITECTURE.md lines 226-249:
 * - Auth store: user session and authentication
 * - Cluster store: cluster configuration management
 * - NO runs/jobs caching (zero caching policy)
 *
 * @see {@link https://github.com/pmndrs/zustand}
 */

// Import and export all stores
import { useAuthStore } from './auth-store';
import { useClusterStore } from './cluster-store';

export { useAuthStore, useClusterStore };

// Re-export types for convenience
export type { StoredClusterConfig } from './cluster-store';

/**
 * Combined store hook for accessing multiple stores
 *
 * Use this when a component needs state from multiple stores.
 *
 * @example
 * ```typescript
 * const { auth, cluster } = useStore();
 * const user = auth.user;
 * const activeCluster = cluster.getCluster(cluster.activeClusterId);
 * ```
 */
export function useStore() {
  return {
    auth: useAuthStore(),
    cluster: useClusterStore(),
  };
}

/**
 * Initialize all stores
 *
 * Call this once at app startup to:
 * - Restore persisted state from localStorage
 * - Check session validity
 * - Set up devtools in development
 *
 * @example
 * ```typescript
 * // In app layout or root component
 * useEffect(() => {
 *   initializeStores();
 * }, []);
 * ```
 */
export function initializeStores() {
  // Check session validity on app load
  const authStore = useAuthStore.getState();
  void authStore.checkSession();

  // Enable devtools in development
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    // Zustand devtools are enabled automatically when installed
    console.log('[Store] Initialized with devtools enabled');
  }
}

/**
 * Reset all stores
 *
 * Useful for logout or clearing all state.
 * Clears both memory state and localStorage.
 */
export function resetAllStores() {
  // Reset auth store
  const authStore = useAuthStore.getState();
  authStore._setUser(null);

  // Reset cluster store
  const clusterStore = useClusterStore.getState();
  clusterStore.clearAllClusters();

  // Clear localStorage
  if (typeof window !== 'undefined') {
    localStorage.removeItem('auth-storage');
    localStorage.removeItem('cluster-storage');
  }
}

/**
 * Store hydration status hook
 *
 * Returns whether stores have been hydrated from localStorage.
 * Useful for avoiding flashes of unauthenticated state.
 *
 * @returns Object with hydration status for each store
 */
export function useStoreHydration() {
  // Zustand persist adds _hasHydrated flag to stores
  // Default to true if persist is not available (not initialized yet)

  const authHydrated = useAuthStore.persist?.hasHydrated?.() ?? true;

  const clusterHydrated = useClusterStore.persist?.hasHydrated?.() ?? true;

  return {
    auth: authHydrated,
    cluster: clusterHydrated,
    all: authHydrated && clusterHydrated,
  };
}
