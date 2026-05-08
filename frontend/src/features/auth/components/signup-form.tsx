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

const detailsSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  organization: z.string().min(1, "Organization is required"),
  designation: z.string().min(1, "Designation is required"),
});

type EmailValues = z.infer<typeof emailSchema>;
type DetailsValues = z.infer<typeof detailsSchema>;

async function checkEmailExists(email: string): Promise<boolean> {
  const res = await fetch(API.AUTH.CHECK_EMAIL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = (await res.json()) as { exists: boolean };
  return data.exists;
}

export function SignupForm() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "details" | "otp">("email");
  const [email, setEmail] = useState("");
  const [emailTaken, setEmailTaken] = useState(false);
  const [details, setDetails] = useState<DetailsValues | null>(null);
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const emailForm = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  });

  const detailsForm = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      organization: "",
      designation: "",
    },
  });

  const handleEmailSubmit = async (values: EmailValues) => {
    setLoading(true);
    setEmailTaken(false);

    const exists = await checkEmailExists(values.email);
    setLoading(false);

    if (exists) {
      setEmailTaken(true);
      emailForm.setError("email", { message: UI.ERRORS.EMAIL_EXISTS });
      return;
    }

    setEmail(values.email);
    setStep("details");
  };

  const handleDetailsSubmit = async (values: DetailsValues) => {
    setDetails(values);
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

    toast.success(UI.SUCCESS.OTP_SENT);
    setStep("otp");
  };

  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== AUTH.OTP_LENGTH || !details) return;

    setLoading(true);
    const { error } = await authClient.signIn.emailOtp({
      email,
      otp,
      name: `${details.firstName} ${details.lastName}`,
    });
    setLoading(false);

    if (error) {
      toast.error(error.message || UI.ERRORS.SIGNUP_FAILED);
      return;
    }

    toast.success(UI.SUCCESS.SIGNUP);
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
            Verify your email
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
              setStep("details");
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
            {loading ? "Verifying\u2026" : "Create Account"}
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

  if (step === "details") {
    return (
      <form
        onSubmit={detailsForm.handleSubmit(handleDetailsSubmit)}
        className="flex flex-col gap-6"
      >
        <div className="text-center">
          <h1 className="text-2xl font-medium tracking-tight text-foreground">
            {UI.AUTH.SIGNUP_DETAILS_TITLE}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {UI.AUTH.SIGNUP_DETAILS_SUBTITLE}
          </p>
        </div>

        <FieldGroup>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="signup-first">First Name</FieldLabel>
              <Input
                id="signup-first"
                placeholder="John"
                {...detailsForm.register("firstName")}
              />
              {detailsForm.formState.errors.firstName && (
                <p className="text-sm text-destructive">
                  {detailsForm.formState.errors.firstName.message}
                </p>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="signup-last">Last Name</FieldLabel>
              <Input
                id="signup-last"
                placeholder="Doe"
                {...detailsForm.register("lastName")}
              />
              {detailsForm.formState.errors.lastName && (
                <p className="text-sm text-destructive">
                  {detailsForm.formState.errors.lastName.message}
                </p>
              )}
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="signup-org">Organization</FieldLabel>
            <Input
              id="signup-org"
              placeholder="Company Inc."
              {...detailsForm.register("organization")}
            />
            {detailsForm.formState.errors.organization && (
              <p className="text-sm text-destructive">
                {detailsForm.formState.errors.organization.message}
              </p>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="signup-role">Designation</FieldLabel>
            <Input
              id="signup-role"
              placeholder="Software Engineer"
              {...detailsForm.register("designation")}
            />
            {detailsForm.formState.errors.designation && (
              <p className="text-sm text-destructive">
                {detailsForm.formState.errors.designation.message}
              </p>
            )}
          </Field>
        </FieldGroup>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => setStep("email")}
          >
            <ArrowLeft data-icon="inline-start" />
            Back
          </Button>
          <Button type="submit" className="flex-1" disabled={loading}>
            {loading ? <Spinner data-icon="inline-start" /> : null}
            {loading ? "Sending\u2026" : "Send OTP"}
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
        <h1 className="text-2xl font-medium tracking-tight text-foreground">
          {UI.AUTH.SIGNUP_TITLE}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {UI.AUTH.SIGNUP_SUBTITLE}
        </p>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="signup-email">Email</FieldLabel>
          <Input
            id="signup-email"
            type="email"
            placeholder="you@company.com"
            autoComplete="email"
            disabled={emailTaken}
            {...emailForm.register("email", {
              onChange: () => {
                if (emailTaken) {
                  setEmailTaken(false);
                  emailForm.clearErrors("email");
                }
              },
            })}
          />
          {emailForm.formState.errors.email && (
            <p className="text-sm text-destructive">
              {emailForm.formState.errors.email.message}
            </p>
          )}
        </Field>
      </FieldGroup>

      {emailTaken ? (
        <a
          href={ROUTES.SIGNIN}
          className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Go to Sign In
        </a>
      ) : (
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? <Spinner data-icon="inline-start" /> : null}
          {loading ? "Checking\u2026" : "Continue"}
        </Button>
      )}

      <p className="text-center text-sm text-muted-foreground">
        {UI.AUTH.SIGNIN_LINK_TEXT}{" "}
        <a
          href={ROUTES.SIGNIN}
          className="font-medium text-link transition-colors hover:text-link-active"
        >
          Sign in
        </a>
      </p>
    </form>
  );
}
