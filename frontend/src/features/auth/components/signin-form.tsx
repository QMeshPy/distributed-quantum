"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@/shared/lib/toast";
import { ArrowLeft, Wallet } from "lucide-react";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { OtpInput } from "@/components/arc/otp-input/otp-input";
import { authClient } from "@/features/auth/hooks/use-auth";
import { signInWithEthereum } from "@/features/auth/lib/siwe";
import { ROUTES, UI, AUTH, API } from "@/constants";

const emailSchema = z.object({
  email: z.email(),
});

type EmailValues = z.infer<typeof emailSchema>;

async function checkEmailExists(email: string): Promise<boolean> {
  const res = await fetch(API.AUTH.CHECK_EMAIL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = (await res.json()) as { exists: boolean };
  return data.exists;
}

export function SigninForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [walletLoading, setWalletLoading] = useState(false);

  const emailForm = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  const handleEmailSubmit = async (values: EmailValues) => {
    setLoading(true);

    const exists = await checkEmailExists(values.email);
    if (!exists) {
      setLoading(false);
      emailForm.setError("email", { message: UI.ERRORS.NO_ACCOUNT });
      return;
    }

    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: values.email,
      type: "sign-in",
    });
    setLoading(false);

    if (error) {
      toast.error(error.message || UI.ERRORS.OTP_SEND_FAILED);
      return;
    }

    setEmail(values.email);
    toast.success(UI.SUCCESS.OTP_SENT);
    setStep("otp");
  };

  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== AUTH.OTP_LENGTH) return;

    setLoading(true);
    const { error } = await authClient.signIn.emailOtp({
      email,
      otp,
    });
    setLoading(false);

    if (error) {
      toast.error(error.message || UI.ERRORS.SIGNIN_FAILED);
      return;
    }

    toast.success(UI.SUCCESS.SIGNIN);
    router.push(ROUTES.DASHBOARD);
  };

  const handleResend = async () => {
    setLoading(true);
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
    });
    setLoading(false);

    if (error) {
      toast.error(error.message || UI.ERRORS.OTP_SEND_FAILED);
      return;
    }
    toast.success(UI.SUCCESS.OTP_RESENT);
  };

  const handleEthereumSignIn = async () => {
    setWalletLoading(true);
    try {
      const res = await signInWithEthereum();
      if (!res.success) {
        toast.error(res.error || UI.ERRORS.SIGNIN_FAILED);
        return;
      }
      toast.success(UI.SUCCESS.SIGNIN);
      router.push(ROUTES.DASHBOARD);
    } catch (err: any) {
      toast.error(err?.message || "Sign-in with Ethereum failed.");
    } finally {
      setWalletLoading(false);
    }
  };

  if (step === "otp") {
    return (
      <form onSubmit={handleOTPSubmit} className="flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-medium text-foreground">
            {UI.AUTH.OTP_TITLE}
          </h1>
          <p className="mt-1.5 text-sm text-subtle">
            {UI.AUTH.otpSubtitle(email)}
          </p>
        </div>

        <div className="flex justify-center py-2">
          <OtpInput label="One-time code" length={AUTH.OTP_LENGTH} value={otp} onChange={setOtp} autoFocus />
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => {
              setStep("email");
              setOtp("");
            }}
          >
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
          <Button
            type="submit"
            className="flex-1" loading={loading}
            disabled={loading || otp.length !== AUTH.OTP_LENGTH}
          >
            {loading ? "Verifying\u2026" : "Sign In"}
          </Button>
        </div>

        <div className="text-center">
          <Button variant="ghost" size="sm"
            type="button"
            onClick={handleResend}
            disabled={loading}>
            {UI.AUTH.OTP_RESEND}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form
      onSubmit={emailForm.handleSubmit(handleEmailSubmit)}
      className="flex flex-col gap-6"
    >
      <div className="text-center">
        <h1 className="text-2xl font-medium text-foreground">
          {UI.AUTH.SIGNIN_TITLE}
        </h1>
        <p className="mt-1.5 text-sm text-subtle">
          {UI.AUTH.SIGNIN_SUBTITLE}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Input label="Email"
            id="signin-email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            {...emailForm.register("email")}
          />
          {emailForm.formState.errors.email && (
            <p className="text-sm text-danger">
              {emailForm.formState.errors.email.message}
            </p>
          )}
        </div>
      </div>

      <Button type="submit" className="w-full" loading={loading} disabled={loading || walletLoading}>
        {loading ? "Sending\u2026" : "Continue"}
      </Button>

      <div className="relative my-1 flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border-subtle" />
        </div>
        <div className="relative bg-background px-3 text-xs text-subtle">
          Or continue with
        </div>
      </div>

      <Button
        type="button"
        variant="secondary"
        onClick={handleEthereumSignIn}
        disabled={loading || walletLoading}
        loading={walletLoading}
        className="w-full gap-2"
      >
        <Wallet className="h-4 w-4" />
        {walletLoading ? "Connecting wallet…" : "Sign in with Ethereum"}
      </Button>

      <p className="text-center text-sm text-subtle">
        {UI.AUTH.SIGNUP_LINK_TEXT}{" "}
        <a
          href={ROUTES.SIGNUP}
          className="font-medium text-accent transition-colors hover:text-accent-strong"
        >
          Sign up
        </a>
      </p>
    </form>
  );
}
