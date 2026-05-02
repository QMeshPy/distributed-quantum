'use client';

/**
 * Root Providers Component
 *
 * Wraps the app with all necessary providers:
 * - QueryClientProvider for TanStack Query (zero-caching)
 * - Store initialization for Zustand
 *
 * @module app/providers
 */

import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/lib/react-query';
import { initializeStores } from '@/store';

export function Providers({ children }: { children: React.ReactNode }) {
  // Initialize stores and check session on app startup
  useEffect(() => {
    initializeStores();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
