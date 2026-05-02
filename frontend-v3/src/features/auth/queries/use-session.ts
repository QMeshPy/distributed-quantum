/**
 * Session Query Hook
 *
 * TanStack Query hook for checking session validity
 */

import { useQuery } from '@tanstack/react-query';

import type { SessionResponse } from '../types';
import type { ClientUser } from '@/types/user';

/**
 * Session query
 * Calls GET /api/auth/session
 */
export function useSession() {
  return useQuery<ClientUser | null, Error>({
    queryKey: ['auth', 'session'],
    queryFn: async () => {
      const response = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        // Session invalid or expired
        return null;
      }

      const data = (await response.json()) as SessionResponse;

      // Convert API response to ClientUser format
      const user: ClientUser = {
        _id: data.user._id,
        email: data.user.email,
        name: data.user.name,
        organisation: data.user.organisation ?? '',
        roleInOrg: data.user.roleInOrg ?? '',
        city: data.user.city ?? '',
        otpExpiry: data.user.otpExpiry ? new Date(data.user.otpExpiry) : null,
        otpVerified: data.user.otpVerified ?? false,
        tier: data.user.tier,
        freeTrialExpiresAt: new Date(data.user.freeTrialExpiresAt),
        createdAt: new Date(data.user.createdAt),
        preferences: {
          theme: data.user.preferences?.theme ?? 'light',
          defaultClusterId: data.user.preferences?.defaultClusterId,
        },
      };

      return user;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry failed session checks
  });
}
