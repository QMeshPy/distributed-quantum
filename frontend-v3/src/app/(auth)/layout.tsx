import type { ReactNode } from 'react';

/**
 * Auth Layout
 *
 * Provides centered layout for authentication pages (login, signup)
 * Following DESIGN.md:
 * - White canvas background (--color-canvas)
 * - Centered card container
 * - Logo/brand at top
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className='min-h-screen bg-canvas flex flex-col items-center justify-center p-4'>
      {/* Logo/Brand */}
      <div className='mb-8'>
        <h1 className='text-2xl font-medium text-ink'>Quantum Computing</h1>
      </div>

      {/* Card Container */}
      <div className='w-full max-w-md'>{children}</div>

      {/* Footer */}
      <div className='mt-8 text-sm text-muted'>
        © 2026 Quantum Computing. All rights reserved.
      </div>
    </div>
  );
}
