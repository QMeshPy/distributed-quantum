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
 * Step 1 - User Details Schema
 */
const userDetailsSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  organisation: z.string().min(1, 'Organisation is required'),
  role: z.string().min(1, 'Role is required'),
  city: z.string().min(1, 'City is required'),
  email: z.string().email(),
});

type UserDetailsData = z.infer<typeof userDetailsSchema>;

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
    freeTrialExpiresAt?: string;
    createdAt?: string;
    preferences?: {
      theme?: 'light' | 'dark';
      defaultClusterId?: string;
    };
  };
}

interface ValidationError {
  path: (string | number)[];
  message: string;
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
 * Multi-Step Signup Form Component
 *
 * Step 1: User details (name, organisation, role, city, email)
 * Step 2: OTP verification
 * On Success: Show toast and redirect to dashboard
 */
export function SignupForm() {
  const router = useRouter();

  // Form state
  const [step, setStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState<UserDetailsData>({
    fullName: '',
    organisation: '',
    role: '',
    city: '',
    email: '',
  });
  const [otp, setOtp] = useState('');

  // UI state
  const [errors, setErrors] = useState<
    Partial<Record<keyof UserDetailsData, string>>
  >({});
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
   * Step 1: Submit user details and send OTP
   */
  const handleStep1Submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});
    setGeneralError('');

    // Validate form data
    const validation = userDetailsSchema.safeParse(formData);
    if (!validation.success) {
      const fieldErrors: Partial<Record<keyof UserDetailsData, string>> = {};
      const validationErrors = validation.error.issues as ValidationError[];
      validationErrors.forEach((err) => {
        const pathKey = err.path[0];
        if (typeof pathKey === 'string') {
          fieldErrors[pathKey as keyof UserDetailsData] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsLoading(true);

    try {
      // Call signup API to create user and send OTP
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.fullName,
          organisation: formData.organisation,
          role: formData.role,
          city: formData.city,
          email: formData.email,
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

      // Move to step 2
      setStep(2);
      setResendCooldown(60);
      toast.success('OTP sent to your email');
    } catch (error) {
      setGeneralError(
        error instanceof Error
          ? error.message
          : 'Signup failed. Please try again.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Step 2: Verify OTP and complete signup
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
          email: formData.email,
          otp,
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData = (await response.json()) as ApiErrorResponse;
        const errorMessage =
          errorData.error?.message ?? 'Invalid OTP. Please try again.';
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
        freeTrialExpiresAt: new Date(
          data.user.freeTrialExpiresAt ??
            (data.user.tier === 'free'
              ? Date.now() + 14 * 24 * 60 * 60 * 1000
              : 0),
        ),
        createdAt: new Date(data.user.createdAt ?? Date.now()),
        preferences: {
          theme: (data.user.preferences?.theme ?? 'light') as 'light' | 'dark',
          defaultClusterId: data.user.preferences?.defaultClusterId,
        },
      };

      useAuthStore.getState()._setUser(user);

      // Show success toast
      toast.success('Account created successfully!');

      // Redirect after 2 seconds
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
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
      const response = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
        }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to resend OTP');
      }

      setResendCooldown(60);
      toast.success('OTP sent to your email');
    } catch {
      setGeneralError('Failed to resend OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <StepIndicator currentStep={step} />
        <CardTitle>
          {step === 1 ? 'Create Account' : 'Verify Your Email'}
        </CardTitle>
        <CardDescription>
          {step === 1
            ? 'Enter your details to get started'
            : `We've sent a 6-digit code to ${formData.email}`}
        </CardDescription>
      </CardHeader>

      {step === 1 ? (
        <form onSubmit={handleStep1Submit}>
          <CardContent>
            <div className='space-y-4'>
              {/* Full Name */}
              <div className='space-y-2'>
                <Label htmlFor='fullName'>Full Name</Label>
                <Input
                  id='fullName'
                  type='text'
                  placeholder='John Doe'
                  value={formData.fullName}
                  onChange={(e) =>
                    setFormData({ ...formData, fullName: e.target.value })
                  }
                  disabled={isLoading}
                  aria-invalid={!!errors.fullName}
                  aria-describedby={
                    errors.fullName ? 'fullName-error' : undefined
                  }
                />
                {errors.fullName && (
                  <p id='fullName-error' className='text-sm text-destructive'>
                    {errors.fullName}
                  </p>
                )}
              </div>

              {/* Organisation */}
              <div className='space-y-2'>
                <Label htmlFor='organisation'>Organisation</Label>
                <Input
                  id='organisation'
                  type='text'
                  placeholder='Acme Corp'
                  value={formData.organisation}
                  onChange={(e) =>
                    setFormData({ ...formData, organisation: e.target.value })
                  }
                  disabled={isLoading}
                  aria-invalid={!!errors.organisation}
                  aria-describedby={
                    errors.organisation ? 'organisation-error' : undefined
                  }
                />
                {errors.organisation && (
                  <p
                    id='organisation-error'
                    className='text-sm text-destructive'
                  >
                    {errors.organisation}
                  </p>
                )}
              </div>

              {/* Role */}
              <div className='space-y-2'>
                <Label htmlFor='role'>Role in Organisation</Label>
                <Input
                  id='role'
                  type='text'
                  placeholder='Software Engineer'
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value })
                  }
                  disabled={isLoading}
                  aria-invalid={!!errors.role}
                  aria-describedby={errors.role ? 'role-error' : undefined}
                />
                {errors.role && (
                  <p id='role-error' className='text-sm text-destructive'>
                    {errors.role}
                  </p>
                )}
              </div>

              {/* City */}
              <div className='space-y-2'>
                <Label htmlFor='city'>City</Label>
                <Input
                  id='city'
                  type='text'
                  placeholder='San Francisco'
                  value={formData.city}
                  onChange={(e) =>
                    setFormData({ ...formData, city: e.target.value })
                  }
                  disabled={isLoading}
                  aria-invalid={!!errors.city}
                  aria-describedby={errors.city ? 'city-error' : undefined}
                />
                {errors.city && (
                  <p id='city-error' className='text-sm text-destructive'>
                    {errors.city}
                  </p>
                )}
              </div>

              {/* Email */}
              <div className='space-y-2'>
                <Label htmlFor='email'>Email</Label>
                <Input
                  id='email'
                  type='email'
                  placeholder='you@example.com'
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  disabled={isLoading}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                />
                {errors.email && (
                  <p id='email-error' className='text-sm text-destructive'>
                    {errors.email}
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
              aria-label='Continue to verification'
            >
              {isLoading ? 'Sending code...' : 'Continue'}
            </Button>

            <p className='text-sm text-muted-foreground'>
              Already have an account?{' '}
              <Link
                href='/login'
                className='text-link hover:text-link-active underline-offset-4 hover:underline'
              >
                Sign in
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
              aria-label='Verify and sign up'
            >
              {isLoading ? 'Verifying...' : 'Verify & Sign Up'}
            </Button>

            <button
              type='button'
              onClick={() => setStep(1)}
              disabled={isLoading}
              className='text-sm text-muted-foreground hover:text-foreground disabled:opacity-50'
            >
              Back to details
            </button>
          </CardFooter>
        </form>
      )}
    </Card>
  );
}
