import {
  NetworkIcon,
  PlayIcon,
  SparklesIcon,
  TrendingUpIcon,
} from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { WelcomeModal } from '@/features/shell';

export default function DashboardPage() {
  return (
    <>
      <SidebarInset>
        <header className='flex h-16 shrink-0 items-center gap-2 border-b px-4'>
          <SidebarTrigger />
          <Separator
            orientation='vertical'
            className='mr-2 data-vertical:h-4 data-vertical:self-auto'
          />
          <h1 className='text-lg font-medium'>Dashboard</h1>
        </header>

        <div className='flex flex-1 flex-col gap-6 p-6'>
          <div className='flex flex-col gap-2'>
            <h2
              className='text-2xl font-normal'
              style={{ color: 'var(--color-ink)' }}
            >
              Welcome back, User
            </h2>
            <p className='text-sm' style={{ color: 'var(--color-body)' }}>
              Here&apos;s what&apos;s happening with your quantum clusters
              today.
            </p>
          </div>

          <div className='grid gap-4 md:grid-cols-3'>
            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>
                  Active Clusters
                </CardTitle>
                <NetworkIcon className='size-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-normal'>0</div>
                <p className='text-xs text-muted-foreground'>
                  No clusters configured
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>
                  Total Runs
                </CardTitle>
                <PlayIcon className='size-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-normal'>0</div>
                <p className='text-xs text-muted-foreground'>
                  No quantum jobs yet
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>
                  Success Rate
                </CardTitle>
                <TrendingUpIcon className='size-4 text-muted-foreground' />
              </CardHeader>
              <CardContent>
                <div className='text-2xl font-normal'>-</div>
                <p className='text-xs text-muted-foreground'>
                  Waiting for data
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <SparklesIcon className='size-5' />
                Getting Started
              </CardTitle>
              <CardDescription>
                Follow these steps to start running quantum circuits
              </CardDescription>
            </CardHeader>
            <CardContent className='grid gap-4'>
              <div className='flex items-start gap-4 rounded-lg border p-4'>
                <div className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground'>
                  1
                </div>
                <div className='flex-1 space-y-1'>
                  <p className='text-sm font-medium leading-none'>
                    Add your first cluster
                  </p>
                  <p className='text-sm text-muted-foreground'>
                    Connect to a quantum computing cluster to start running
                    circuits
                  </p>
                  <Button asChild size='sm' className='mt-2'>
                    <Link href='/dashboard/clusters'>Configure Cluster</Link>
                  </Button>
                </div>
              </div>

              <div className='flex items-start gap-4 rounded-lg border p-4 opacity-50'>
                <div className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground'>
                  2
                </div>
                <div className='flex-1 space-y-1'>
                  <p className='text-sm font-medium leading-none'>
                    Run your first circuit
                  </p>
                  <p className='text-sm text-muted-foreground'>
                    Submit a quantum circuit and watch it execute across the
                    network
                  </p>
                  <Button
                    asChild
                    size='sm'
                    variant='secondary'
                    disabled
                    className='mt-2'
                  >
                    <span>View Runs</span>
                  </Button>
                </div>
              </div>

              <div className='flex items-start gap-4 rounded-lg border p-4 opacity-50'>
                <div className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground'>
                  3
                </div>
                <div className='flex-1 space-y-1'>
                  <p className='text-sm font-medium leading-none'>
                    View financial analysis
                  </p>
                  <p className='text-sm text-muted-foreground'>
                    Explore quantum portfolio optimization and financial
                    modeling
                  </p>
                  <Button
                    asChild
                    size='sm'
                    variant='secondary'
                    disabled
                    className='mt-2'
                  >
                    <span>Open Finance</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </SidebarInset>

      <WelcomeModal />
    </>
  );
}
