import { createAuthClient } from "better-auth/react";
import {
  emailOTPClient,
  siweClient,
  inferAdditionalFields,
} from "better-auth/client/plugins";
import { stripeClient } from "@better-auth/stripe/client";

export const authClient = createAuthClient({
  plugins: [
    emailOTPClient(),
    siweClient(),
    stripeClient({ subscription: true }),
    inferAdditionalFields({
      user: {
        hasSubscription: { type: "boolean", required: false },
        stripeConnectedAccountId: { type: "string", required: false },
        stripeConnectPayoutsEnabled: { type: "boolean", required: false },
      },
    }),
  ],
});

export const {
  useSession,
  signIn,
  signUp,
  signOut,
  emailOtp,
  siwe,
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
