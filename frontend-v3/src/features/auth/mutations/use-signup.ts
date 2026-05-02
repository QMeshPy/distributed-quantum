/**
 * Signup Mutation Hook
 *
 * TanStack Query mutation for user signup
 */

import { useMutation } from '@tanstack/react-query';

import type { SendOtpResponse, ApiErrorResponse } from '../types';

interface SignupVariables {
  name: string;
  organisation: string;
  role: string;
  city: string;
  email: string;
}

/**
 * Signup mutation
 * Calls POST /api/auth/signup
 */
export function useSignup() {
  return useMutation<SendOtpResponse, Error, SignupVariables>({
    mutationFn: async ({ name, organisation, role, city, email }) => {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          organisation,
          role,
          city,
          email,
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = (await response.json()) as ApiErrorResponse;
        const errorMessage =
          errorData.error?.message ??
          `Signup failed: ${response.status} ${response.statusText}`;
        throw new Error(errorMessage);
      }

      return response.json();
    },
  });
}
