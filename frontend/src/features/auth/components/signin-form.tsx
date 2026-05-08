"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { authClient } from "@/features/auth/hooks/use-auth";
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

  if (step === "otp") {
    return (
      <form onSubmit={handleOTPSubmit} className="flex flex-col gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-medium tracking-tight text-foreground">
            {UI.AUTH.OTP_TITLE}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {UI.AUTH.otpSubtitle(email)}
          </p>
        </div>

        <div className="flex justify-center py-2">
          <InputOTP maxLength={AUTH.OTP_LENGTH} value={otp} onChange={setOtp}>
            <InputOTPGroup>
              {Array.from({ length: AUTH.OTP_LENGTH }, (_, i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
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
            className="flex-1"
            disabled={loading || otp.length !== AUTH.OTP_LENGTH}
          >
            {loading ? <Spinner data-icon="inline-start" /> : null}
            {loading ? "Verifying\u2026" : "Sign In"}
          </Button>
        </div>

        <div className="text-center">
          <button
            type="button"
            onClick={handleResend}
            disabled={loading}
            className="text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            {UI.AUTH.OTP_RESEND}
          </button>
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
        <h1 className="text-2xl font-medium tracking-tight text-foreground">
          {UI.AUTH.SIGNIN_TITLE}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {UI.AUTH.SIGNIN_SUBTITLE}
        </p>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="signin-email">Email</FieldLabel>
          <Input
            id="signin-email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            {...emailForm.register("email")}
          />
          {emailForm.formState.errors.email && (
            <p className="text-sm text-destructive">
              {emailForm.formState.errors.email.message}
            </p>
          )}
        </Field>
      </FieldGroup>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? <Spinner data-icon="inline-start" /> : null}
        {loading ? "Sending\u2026" : "Continue"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {UI.AUTH.SIGNUP_LINK_TEXT}{" "}
        <a
          href={ROUTES.SIGNUP}
          className="font-medium text-link transition-colors hover:text-link-active"
        >
          Sign up
        </a>
      </p>
    </form>
  );
}
