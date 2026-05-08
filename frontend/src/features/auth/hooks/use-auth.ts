import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});

export const {
  useSession,
  signIn,
  signUp,
  signOut,
  emailOtp,
} = authClient;

export function useAuth() {
  const session = useSession();
  return {
    user: session.data?.user ?? null,
    session: session.data?.session ?? null,
    loading: session.isPending,
    error: session.error,
    signOut: () => authClient.signOut(),
    refetch: session.refetch,
  };
}
