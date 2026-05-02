/**
 * Verify OTP Mutation Hook
 *
 * TanStack Query mutation for OTP verification
 */

import { useMutation } from '@tanstack/react-query';

import type { VerifyOtpResponse, ApiErrorResponse } from '../types';
import type { ClientUser } from '@/types/user';

interface VerifyOtpVariables {
  email: string;
  otp: string;
}

/**
 * Verify OTP mutation
 * Calls POST /api/auth/verify-otp
 */
export function useVerifyOtp() {
  return useMutation<ClientUser, Error, VerifyOtpVariables>({
    mutationFn: async ({ email, otp }) => {
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          otp,
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = (await response.json()) as ApiErrorResponse;
        const errorMessage =
          errorData.error?.message ?? 'Invalid code. Please try again.';
        throw new Error(errorMessage);
      }

      const data = (await response.json()) as VerifyOtpResponse;

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
          theme: (data.user.preferences?.theme ?? 'light') as 'light' | 'dark',
          defaultClusterId: data.user.preferences?.defaultClusterId,
        },
      };

      return user;
    },
  });
}
