'use client';

import { SparklesIcon, CalendarIcon } from 'lucide-react';
import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Compute trial date outside component for purity
const TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

export function WelcomeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [trialExpiresAt] = useState(
    () => new Date(Date.now() + TRIAL_DURATION_MS),
  );

  // TODO: Replace with actual user data from auth context
  const mockUser = {
    tier: 'free' as const,
    freeTrialExpiresAt: trialExpiresAt,
    isNewUser: true,
  };

  const handleClose = () => {
    setIsOpen(false);
    localStorage.setItem('welcome-modal-seen', 'true');
  };

  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem('welcome-modal-seen');

    if (
      (hasSeenWelcome === null || hasSeenWelcome === '') &&
      mockUser.isNewUser
    ) {
      const openTimer = setTimeout(() => {
        setIsOpen(true);
      }, 0);

      const autoCloseTimer = setTimeout(() => {
        handleClose();
      }, 5000);

      return () => {
        clearTimeout(openTimer);
        clearTimeout(autoCloseTimer);
      };
    }
  }, [mockUser.isNewUser]);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <div className='flex items-center justify-center mb-4'>
            <div
              className='flex size-16 items-center justify-center rounded-full'
              style={{ backgroundColor: 'var(--color-signature-yellow)' }}
            >
              <SparklesIcon
                className='size-8'
                style={{ color: 'var(--color-ink)' }}
              />
            </div>
          </div>
          <DialogTitle className='text-center text-2xl'>
            Welcome to Quantum Dashboard!
          </DialogTitle>
          <DialogDescription className='text-center space-y-4 pt-4'>
            <p>
              You&apos;re on a <span className='font-medium'>free trial</span>{' '}
              with full access to all quantum computing features.
            </p>
            <div
              className='flex items-center justify-center gap-2 rounded-lg p-3'
              style={{ backgroundColor: 'var(--color-surface-soft)' }}
            >
              <CalendarIcon className='size-4 text-muted-foreground' />
              <span className='text-sm'>
                Your trial expires on{' '}
                <span className='font-medium'>
                  {formatDate(mockUser.freeTrialExpiresAt)}
                </span>
              </span>
            </div>
            <p className='text-xs text-muted-foreground'>
              This message will auto-close in 5 seconds
            </p>
          </DialogDescription>
        </DialogHeader>
        <div className='flex justify-center gap-3 mt-4'>
          <Button
            onClick={handleClose}
            className='bg-primary text-primary-foreground'
          >
            Get Started
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
