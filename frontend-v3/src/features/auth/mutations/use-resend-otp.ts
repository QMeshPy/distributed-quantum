/**
 * Resend OTP Mutation Hook
 *
 * TanStack Query mutation for resending OTP
 */

import { useMutation } from '@tanstack/react-query';

import type { SendOtpResponse, ApiErrorResponse } from '../types';

interface ResendOtpVariables {
  email: string;
}

/**
 * Resend OTP mutation
 * Calls POST /api/auth/resend-otp
 */
export function useResendOtp() {
  return useMutation<SendOtpResponse, Error, ResendOtpVariables>({
    mutationFn: async ({ email }) => {
      const response = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = (await response.json()) as ApiErrorResponse;
        const errorMessage =
          errorData.error?.message ?? 'Failed to resend code';
        throw new Error(errorMessage);
      }

      return response.json();
    },
  });
}
