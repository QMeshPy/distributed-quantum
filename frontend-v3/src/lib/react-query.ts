/**
 * TanStack Query configuration for zero-caching policy
 *
 * Per ARCHITECTURE.md lines 145-156:
 * Quantum job data is NEVER cached because job states change rapidly
 * (QUEUED → RUNNING → COMPLETED). Real-time accuracy > performance.
 *
 * @see {@link https://tanstack.com/query/latest/docs/framework/react/reference/QueryClient}
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Creates a QueryClient with zero-caching configuration
 *
 * Configuration rationale:
 * - staleTime: 0 → Data immediately stale, always fetch fresh
 * - gcTime: 0 → Don't cache responses (formerly cacheTime)
 * - refetchOnWindowFocus: true → Refetch on tab switch
 * - refetchOnMount: true → Always fetch on component mount
 * - refetchInterval: 5000 → Poll every 5s for live updates
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // CRITICAL: Zero caching policy for quantum job data
        staleTime: 0, // Data immediately stale
        gcTime: 0, // Don't cache responses (gcTime replaces cacheTime in v5)
        refetchOnMount: true, // Always fetch on component mount
        refetchOnWindowFocus: true, // Refetch on tab switch
        refetchInterval: 5000, // Poll every 5s for updates

        // Retry configuration
        retry: 1, // Retry once on failure
        retryDelay: 1000, // Wait 1s between retries

        // Network mode
        networkMode: 'online', // Only fetch when online
      },
      mutations: {
        // Mutations don't need retry by default
        retry: 0,
        networkMode: 'online',
      },
    },
  });
}

/**
 * Global QueryClient instance
 * Created once and reused across the app
 */
export const queryClient = createQueryClient();

/**
 * React Query Provider export for convenience
 */
export { QueryClientProvider };

/**
 * Hook factory for creating zero-cache queries
 *
 * @example
 * ```typescript
 * const { data, isLoading } = useQuery({
 *   queryKey: ['runs', clusterId],
 *   queryFn: () => fetchRuns(clusterId),
 * });
 * ```
 */
export { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
