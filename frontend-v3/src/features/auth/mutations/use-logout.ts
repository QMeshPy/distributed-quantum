/**
 * Logout Mutation Hook
 *
 * TanStack Query mutation for user logout
 */

import { useMutation } from '@tanstack/react-query';

/**
 * Logout mutation
 * Calls POST /api/auth/logout
 */
export function useLogout() {
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        console.warn('Logout API call failed, but will clear local state anyway');
      }
    },
  });
}
