import { DashboardSidebar } from '@/components/dashboard-sidebar';
import { FreeTierBanner } from '@/components/free-tier-banner';
import { SidebarProvider } from '@/components/ui/sidebar';

import type { ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <div className='flex min-h-screen w-full'>
        <DashboardSidebar />
        <main className='flex-1 flex flex-col'>
          <FreeTierBanner />
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
