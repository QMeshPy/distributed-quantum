'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';

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

import { useSignup } from '../mutations/use-signup';
import { useVerifyOtp } from '../mutations/use-verify-otp';
import { useResendOtp } from '../mutations/use-resend-otp';
import { useAuthStore } from '../store/auth-store';
import { userDetailsSchema, type UserDetailsData } from '../schemas/auth-schemas';
import type { ValidationError } from '../types';

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

  // Resend OTP cooldown (60 seconds)
  const [resendCooldown, setResendCooldown] = useState(0);

  // Mutations
  const signup = useSignup();
  const verifyOtp = useVerifyOtp();
  const resendOtp = useResendOtp();

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

    try {
      await signup.mutateAsync({
        name: formData.fullName,
        organisation: formData.organisation,
        role: formData.role,
        city: formData.city,
        email: formData.email,
      });
      setStep(2);
      setResendCooldown(60);
      toast.success('OTP sent to your email');
    } catch (error) {
      setGeneralError(
        error instanceof Error
          ? error.message
          : 'Signup failed. Please try again.',
      );
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

    try {
      const user = await verifyOtp.mutateAsync({
        email: formData.email,
        otp,
      });

      // Update auth store with user data
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
    }
  };

  /**
   * Resend OTP
   */
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;

    setGeneralError('');

    try {
      await resendOtp.mutateAsync({ email: formData.email });
      setResendCooldown(60);
      toast.success('OTP sent to your email');
    } catch {
      setGeneralError('Failed to resend OTP. Please try again.');
    }
  };

  const isLoading = signup.isPending || verifyOtp.isPending || resendOtp.isPending;

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
