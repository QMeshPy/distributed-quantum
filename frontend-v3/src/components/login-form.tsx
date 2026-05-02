'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/store/auth-store';
import type { UserTier } from '@/types/user';

/**
 * Step 1 - Email Schema
 */
const emailSchema = z.object({
  email: z.string().email(),
});

/**
 * API Response types
 */
interface ApiErrorResponse {
  error?: {
    message?: string;
  };
}

interface VerifyOtpResponse {
  user: {
    _id: string;
    email: string;
    name: string;
    organisation?: string;
    roleInOrg?: string;
    city?: string;
    otpExpiry?: string;
    otpVerified?: boolean;
    tier: UserTier;
    freeTrialExpiresAt: string;
    createdAt: string;
    preferences?: {
      theme?: 'light' | 'dark';
      defaultClusterId?: string;
    };
  };
}

/**
 * Step indicators component
 */
function StepIndicator({ currentStep }: { currentStep: 1 | 2 }) {
  return (
    <div className='flex items-center justify-center gap-2 mb-6'>
      <div
        className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
          currentStep === 1
            ? 'bg-primary text-primary-foreground'
            : 'bg-surface-soft text-muted-foreground'
        }`}
      >
        1
      </div>
      <div className='w-12 h-px bg-border' />
      <div
        className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
          currentStep === 2
            ? 'bg-primary text-primary-foreground'
            : 'bg-surface-soft text-muted-foreground'
        }`}
      >
        2
      </div>
    </div>
  );
}

/**
 * OTP Login Form Component
 *
 * Step 1: Email input
 * Step 2: OTP verification
 * On Success: Redirect to dashboard
 */
export function LoginForm() {
  const router = useRouter();

  // Form state
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');

  // UI state
  const [emailError, setEmailError] = useState<string>('');
  const [generalError, setGeneralError] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Resend OTP cooldown (60 seconds)
  const [resendCooldown, setResendCooldown] = useState(0);

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(
        () => setResendCooldown(resendCooldown - 1),
        1000,
      );
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  /**
   * Step 1: Send OTP to email
   */
  const handleStep1Submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEmailError('');
    setGeneralError('');

    // Validate email
    const validation = emailSchema.safeParse({ email });
    if (!validation.success) {
      const firstError = validation.error.issues[0];
      setEmailError(
        firstError && typeof firstError.message === 'string'
          ? firstError.message
          : 'Invalid email address',
      );
      return;
    }

    setIsLoading(true);

    try {
      // Call send-otp API
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

      // Move to step 2
      setStep(2);
      setResendCooldown(60);
      toast.success('Code sent to your email');
    } catch (error) {
      setGeneralError(
        error instanceof Error
          ? error.message
          : 'Failed to send code. Please try again.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Step 2: Verify OTP and login
   */
  const handleStep2Submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setGeneralError('');

    if (otp.length !== 6) {
      setGeneralError('Please enter the complete 6-digit code');
      return;
    }

    setIsLoading(true);

    try {
      // Verify OTP
      const response = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          otp,
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = (await response.json()) as ApiErrorResponse;
        const errorMessage =
          errorData.error?.message ?? 'Invalid code. Please try again.';
        throw new Error(errorMessage);
      }

      const data = (await response.json()) as VerifyOtpResponse;

      // Update auth store with user data
      const user = {
        _id: data.user._id,
        email: data.user.email,
        name: data.user.name,
        organisation: data.user.organisation ?? '',
        roleInOrg: data.user.roleInOrg ?? '',
        city: data.user.city ?? '',
        otpExpiry: data.user.otpExpiry ? new Date(data.user.otpExpiry) : null,
        otpVerified: data.user.otpVerified ?? false,
        tier: data.user.tier,
        freeTrialExpiresAt: new Date(data.user.freeTrialExpiresAt),
        createdAt: new Date(data.user.createdAt),
        preferences: {
          theme: (data.user.preferences?.theme ?? 'light') as 'light' | 'dark',
          defaultClusterId: data.user.preferences?.defaultClusterId,
        },
      };

      useAuthStore.getState()._setUser(user);

      // Show success toast
      toast.success('Logged in successfully!');

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (error) {
      setGeneralError(
        error instanceof Error
          ? error.message
          : 'Verification failed. Please try again.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Resend OTP
   */
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;

    setIsLoading(true);
    setGeneralError('');

    try {
      const response = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to resend code');
      }

      setResendCooldown(60);
      toast.success('Code sent to your email');
    } catch {
      setGeneralError('Failed to resend code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <StepIndicator currentStep={step} />
        <CardTitle>
          {step === 1 ? 'Sign In' : 'Enter Verification Code'}
        </CardTitle>
        <CardDescription>
          {step === 1
            ? 'Enter your email to receive a login code'
            : `Enter the code sent to ${email}`}
        </CardDescription>
      </CardHeader>

      {step === 1 ? (
        <form onSubmit={handleStep1Submit}>
          <CardContent>
            <div className='space-y-4'>
              {/* Email Field */}
              <div className='space-y-2'>
                <Label htmlFor='email'>Email</Label>
                <Input
                  id='email'
                  type='email'
                  placeholder='you@example.com'
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  aria-invalid={emailError.length > 0}
                  aria-describedby={
                    emailError.length > 0 ? 'email-error' : undefined
                  }
                />
                {emailError.length > 0 && (
                  <p id='email-error' className='text-sm text-destructive'>
                    {emailError}
                  </p>
                )}
              </div>

              {/* General Error */}
              {generalError.length > 0 && (
                <div className='rounded-lg bg-destructive/10 p-3 text-sm text-destructive'>
                  {generalError}
                </div>
              )}
            </div>
          </CardContent>

          <CardFooter className='flex-col gap-4'>
            <Button
              type='submit'
              className='w-full'
              disabled={isLoading}
              aria-label='Send verification code'
            >
              {isLoading ? 'Sending code...' : 'Send Code'}
            </Button>

            <p className='text-sm text-muted-foreground'>
              Don&apos;t have an account?{' '}
              <Link
                href='/signup'
                className='text-link hover:text-link-active underline-offset-4 hover:underline'
              >
                Create account
              </Link>
            </p>
          </CardFooter>
        </form>
      ) : (
        <form onSubmit={handleStep2Submit}>
          <CardContent>
            <div className='space-y-6'>
              {/* OTP Input */}
              <div className='space-y-2'>
                <Label htmlFor='otp'>Verification Code</Label>
                <div className='flex justify-center'>
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={setOtp}
                    disabled={isLoading}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
              </div>

              {/* Resend OTP */}
              <div className='text-center'>
                <button
                  type='button'
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || isLoading}
                  className='text-sm text-link hover:text-link-active underline-offset-4 hover:underline disabled:opacity-50 disabled:pointer-events-none'
                >
                  {resendCooldown > 0
                    ? `Resend code in ${resendCooldown}s`
                    : 'Resend code'}
                </button>
              </div>

              {/* General Error */}
              {generalError.length > 0 && (
                <div className='rounded-lg bg-destructive/10 p-3 text-sm text-destructive'>
                  {generalError}
                </div>
              )}
            </div>
          </CardContent>

          <CardFooter className='flex-col gap-4'>
            <Button
              type='submit'
              className='w-full'
              disabled={isLoading || otp.length !== 6}
              aria-label='Verify and login'
            >
              {isLoading ? 'Verifying...' : 'Verify & Login'}
            </Button>

            <button
              type='button'
              onClick={() => {
                setStep(1);
                setOtp('');
              }}
              disabled={isLoading}
              className='text-sm text-muted-foreground hover:text-foreground disabled:opacity-50'
            >
              Back to email
            </button>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}
