"use client";

import { useMutation } from "@tanstack/react-query";
import { authClient } from "./use-auth";

export function useSignupOtp() {
  return useMutation({
    mutationFn: ({ email, otp }: { email: string; otp: string }) =>
      authClient.emailOtp.verifyEmail({ email, otp }),
  });
}

export function useSendSignupOtp() {
  return useMutation({
    mutationFn: (email: string) =>
      authClient.emailOtp.sendVerificationOtp({
        email,
        type: "email-verification",
      }),
  });
}
