/**
 * Login Mutation Hook
 *
 * TanStack Query mutation for sending login OTP
 */

import { useMutation } from '@tanstack/react-query';

import type { SendOtpResponse, ApiErrorResponse } from '../types';

interface SendLoginOtpVariables {
  email: string;
}

/**
 * Send login OTP mutation
 * Calls POST /api/auth/send-otp
 */
export function useSendLoginOtp() {
  return useMutation<SendOtpResponse, Error, SendLoginOtpVariables>({
    mutationFn: async ({ email }) => {
      const response = await fetch('/api/auth/send-otp', {
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
          errorData.error?.message ?? 'Failed to send code. Please try again.';
        throw new Error(errorMessage);
      }

      return response.json();
    },
  });
}
