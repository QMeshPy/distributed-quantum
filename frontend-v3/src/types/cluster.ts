import { ObjectId } from 'mongodb';
import { z } from 'zod';

/**
 * Protocol type for cluster communication
 * - rest: RESTful HTTP API
 * - jsonrpc: JSON-RPC 2.0 protocol
 */
export type ClusterProtocol = 'rest' | 'jsonrpc';

/**
 * Cluster configuration document stored in MongoDB
 * User-defined cluster connection settings (NO backend capabilities, NO health caching)
 */
export interface ClusterConfig {
  /** MongoDB document ID */
  _id: ObjectId;
  /** Reference to the user who owns this cluster config */
  userId: ObjectId;
  /** Unique identifier for this cluster */
  clusterId: string;
  /** User-friendly name for the cluster */
  name: string;
  /** Communication protocol to use */
  protocol: ClusterProtocol;
  /** REST API endpoint URL (required if protocol is 'rest') */
  restUrl?: string;
  /** JSON-RPC endpoint URL (required if protocol is 'jsonrpc') */
  rpcUrl?: string;
  /** Geographic region (user metadata) */
  region?: string;
  /** Cloud provider or hosting location (user metadata) */
  provider?: string;
  /** User-defined tags for organization */
  tags: string[];
  /** Configuration creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Zod schema for cluster configuration validation
 */
export const clusterConfigSchema = z
  .object({
    _id: z.instanceof(ObjectId),
    userId: z.instanceof(ObjectId),
    clusterId: z.string().min(1),
    name: z.string().min(1),
    protocol: z.enum(['rest', 'jsonrpc']),
    restUrl: z.string().url().optional(),
    rpcUrl: z.string().url().optional(),
    region: z.string().optional(),
    provider: z.string().optional(),
    tags: z.array(z.string()),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .refine(
    (data) => {
      // Ensure appropriate URL is provided based on protocol
      if (data.protocol === 'rest' && !data.restUrl) return false;
      if (data.protocol === 'jsonrpc' && !data.rpcUrl) return false;
      return true;
    },
    {
      message: 'URL must match selected protocol (restUrl for rest, rpcUrl for jsonrpc)',
    }
  );

/**
 * Zod schema for cluster creation input
 */
export const createClusterConfigSchema = z
  .object({
    clusterId: z.string().min(1, 'Cluster ID is required'),
    name: z.string().min(1, 'Cluster name is required'),
    protocol: z.enum(['rest', 'jsonrpc']),
    restUrl: z.string().url().optional(),
    rpcUrl: z.string().url().optional(),
    region: z.string().optional(),
    provider: z.string().optional(),
    tags: z.array(z.string()).default([]),
  })
  .refine(
    (data) => {
      if (data.protocol === 'rest' && !data.restUrl) return false;
      if (data.protocol === 'jsonrpc' && !data.rpcUrl) return false;
      return true;
    },
    {
      message: 'URL must match selected protocol',
    }
  );

/**
 * Zod schema for cluster update input
 */
export const updateClusterConfigSchema = z
  .object({
    name: z.string().min(1).optional(),
    protocol: z.enum(['rest', 'jsonrpc']).optional(),
    restUrl: z.string().url().optional(),
    rpcUrl: z.string().url().optional(),
    region: z.string().optional(),
    provider: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .refine(
    (data) => {
      // If protocol is specified, validate URL accordingly
      if (data.protocol === 'rest' && data.restUrl === undefined) return false;
      if (data.protocol === 'jsonrpc' && data.rpcUrl === undefined) return false;
      return true;
    },
    {
      message: 'When changing protocol, provide corresponding URL',
    }
  );

/**
 * Type for cluster creation input
 */
export type CreateClusterConfigInput = z.infer<typeof createClusterConfigSchema>;

/**
 * Type for cluster update input
 */
export type UpdateClusterConfigInput = z.infer<typeof updateClusterConfigSchema>;

/**
 * Client-side cluster config (same as full config - no sensitive data to hide)
 */
export type ClientClusterConfig = ClusterConfig;
