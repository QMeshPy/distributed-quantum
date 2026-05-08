"use client";

import { useMutation } from "@tanstack/react-query";
import { authClient } from "./use-auth";

export function useSigninOtp() {
  return useMutation({
    mutationFn: ({ email, otp }: { email: string; otp: string }) =>
      authClient.signIn.emailOtp({ email, otp }),
  });
}

export function useSendSigninOtp() {
  return useMutation({
    mutationFn: (email: string) =>
      authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" }),
  });
}
