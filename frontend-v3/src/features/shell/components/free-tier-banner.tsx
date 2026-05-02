'use client';

import { XIcon, SparklesIcon } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function calculateTimeRemaining(expiresAt: Date): TimeRemaining {
  const now = new Date();
  const diff = expiresAt.getTime() - now.getTime();

  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return { days, hours, minutes, seconds };
}

const TRIAL_DURATION_MS =
  13 * 24 * 60 * 60 * 1000 + 5 * 60 * 60 * 1000 + 23 * 60 * 1000;

export function FreeTierBanner() {
  const [trialExpiresAt] = useState(
    () => new Date(Date.now() + TRIAL_DURATION_MS),
  );
  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof window === 'undefined') return true;

    const dismissed = localStorage.getItem('free-tier-banner-dismissed');
    if (dismissed !== null && dismissed !== '') {
      const dismissedDate = new Date(dismissed);
      const now = new Date();
      const daysSinceDismissed =
        (now.getTime() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSinceDismissed < 1) {
        return true;
      }
    }
    return false;
  });
  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  // TODO: Replace with actual user data from auth context
  const mockUser = {
    tier: 'free' as const,
    freeTrialExpiresAt: trialExpiresAt,
  };

  useEffect(() => {
    if (isDismissed) return;

    const updateTimer = () => {
      const remaining = calculateTimeRemaining(mockUser.freeTrialExpiresAt);
      setTimeRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [mockUser.freeTrialExpiresAt, isDismissed]);

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem(
      'free-tier-banner-dismissed',
      new Date().toISOString(),
    );
  };

  if (isDismissed) {
    return null;
  }

  const isWarning = timeRemaining.days < 3;
  const isExpired =
    timeRemaining.days === 0 &&
    timeRemaining.hours === 0 &&
    timeRemaining.minutes === 0;

  return (
    <div
      className='relative flex items-center justify-between px-6 py-3 border-b'
      style={{
        backgroundColor: isExpired
          ? 'var(--color-signature-coral)'
          : isWarning
            ? 'var(--color-signature-mustard)'
            : 'var(--color-signature-yellow)',
        color: 'var(--color-ink)',
      }}
    >
      <div className='flex items-center gap-3'>
        <SparklesIcon className='size-5 shrink-0' />
        <div className='flex items-center gap-2 flex-wrap'>
          <span className='text-sm font-medium'>
            {isExpired ? 'Free trial expired' : 'Free trial ends in:'}
          </span>
          {!isExpired && (
            <span className='text-sm font-mono'>
              {timeRemaining.days}d {timeRemaining.hours}h{' '}
              {timeRemaining.minutes}m {timeRemaining.seconds}s
            </span>
          )}
        </div>
      </div>

      <div className='flex items-center gap-3'>
        <Button
          asChild
          size='sm'
          className='bg-primary text-primary-foreground hover:bg-primary-active'
        >
          <Link href='/upgrade'>Upgrade Now</Link>
        </Button>
        <button
          onClick={handleDismiss}
          className='rounded p-1 hover:bg-black/10 transition-colors'
          aria-label='Dismiss banner'
        >
          <XIcon className='size-4' />
        </button>
      </div>
    </div>
  );
}
