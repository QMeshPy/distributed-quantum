'use client';

import {
  HomeIcon,
  LayoutDashboardIcon,
  WalletIcon,
  FlaskConicalIcon,
  SettingsIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarRail,
} from '@/components/ui/sidebar';

interface NavItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  items?: { title: string; url: string }[];
}

const navigation: NavItem[] = [
  {
    title: 'Home',
    url: '/',
    icon: HomeIcon,
  },
  {
    title: 'Dashboard',
    url: '/dashboard',
    icon: LayoutDashboardIcon,
  },
  {
    title: 'Assets',
    url: '#',
    icon: WalletIcon,
    items: [
      { title: 'Cash', url: '/assets/cash' },
      { title: 'Investment', url: '/assets/investment' },
      { title: 'Crypto', url: '/assets/crypto' },
      { title: 'Property', url: '/assets/property' },
      { title: 'Vehicle', url: '/assets/vehicle' },
      { title: 'Other Asset', url: '/assets/other' },
    ],
  },
  {
    title: 'Quantum',
    url: '#',
    icon: FlaskConicalIcon,
    items: [
      { title: 'Clusters', url: '/dashboard/clusters' },
      { title: 'Runs', url: '/dashboard/runs' },
      { title: 'Finance', url: '/dashboard/finance' },
    ],
  },
  {
    title: 'Settings',
    url: '/dashboard/settings',
    icon: SettingsIcon,
  },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => {
      if (typeof window === 'undefined') return {};

      const stored = localStorage.getItem('sidebar-sections');
      if (stored !== null && stored !== '') {
        try {
          const parsed: unknown = JSON.parse(stored);
          if (typeof parsed === 'object' && parsed !== null) {
            return parsed as Record<string, boolean>;
          }
        } catch {
          // Ignore invalid JSON
        }
      }
      return {};
    },
  );

  const toggleSection = (title: string) => {
    const newState = { ...openSections, [title]: !openSections[title] };
    setOpenSections(newState);
    localStorage.setItem('sidebar-sections', JSON.stringify(newState));
  };

  const isActive = (url: string) => {
    if (url === '/dashboard') {
      return pathname === '/dashboard';
    }
    return pathname.startsWith(url);
  };

  return (
    <Sidebar>
      <SidebarHeader>
        <div className='flex items-center gap-3 px-3 py-2'>
          <div className='flex aspect-square size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground'>
            <FlaskConicalIcon className='size-5' />
          </div>
          <div className='flex flex-col gap-0.5'>
            <span className='text-sm font-medium'>Quantum Dashboard</span>
            <span className='text-xs text-muted-foreground'>v3.0.0</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {navigation.map((item) => {
              const Icon = item.icon;
              const hasItems =
                item.items !== undefined && item.items.length > 0;
              const isOpen = openSections[item.title];

              if (!hasItems) {
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.url)}
                      tooltip={item.title}
                    >
                      <Link href={item.url}>
                        <Icon className='size-4' />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              }

              return (
                <Collapsible
                  key={item.title}
                  open={isOpen}
                  onOpenChange={() => toggleSection(item.title)}
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip={item.title}>
                        <Icon className='size-4' />
                        <span>{item.title}</span>
                        {isOpen ? (
                          <ChevronDownIcon className='ml-auto size-4 transition-transform' />
                        ) : (
                          <ChevronRightIcon className='ml-auto size-4 transition-transform' />
                        )}
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.items?.map((subItem) => (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={isActive(subItem.url)}
                            >
                              <Link href={subItem.url}>{subItem.title}</Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href='/dashboard/profile'>
                <Avatar className='size-8'>
                  <AvatarImage src='/avatars/user.png' alt='User' />
                  <AvatarFallback>U</AvatarFallback>
                </Avatar>
                <div className='flex flex-col gap-0.5 leading-none'>
                  <span className='text-sm font-medium'>User Name</span>
                  <span className='text-xs text-muted-foreground'>
                    Free Tier
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
