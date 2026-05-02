'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
	ActivityIcon,
	AlertTriangleIcon,
	BarChart3Icon,
	BookOpenIcon,
	BotIcon,
	BoxIcon,
	BrainIcon,
	ChevronRightIcon,
	CircleDotIcon,
	ClipboardListIcon,
	CpuIcon,
	FileCodeIcon,
	FileTextIcon,
	FlameIcon,
	FlaskConicalIcon,
	FolderKanbanIcon,
	GaugeIcon,
	GitBranchIcon,
	HeartPulseIcon,
	HomeIcon,
	KeyRoundIcon,
	LayoutDashboardIcon,
	LibraryIcon,
	LineChartIcon,
	MapIcon,
	NetworkIcon,
	PackageIcon,
	PlayCircleIcon,
	PlusIcon,
	RadioIcon,
	ServerIcon,
	SettingsIcon,
	ShieldIcon,
	SparklesIcon,
	UsersIcon,
	WrenchIcon,
	ZapIcon
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarProvider,
	SidebarSeparator
} from '@/components/ui/sidebar';
import { useHash } from '@/hooks/use-hash';
import { cn } from '@/lib/utils';

export type DashboardShellProps = {
	children: ReactNode;
};

const WORKSPACE_NAME = 'Quantum Gates';
const WORKSPACE_INITIALS = 'QG';
const WORKSPACE_SUBTITLE = 'Distributed Quantum Network';

const navItems = [
	{
		key: 'home',
		railLabel: 'Home',
		label: 'Home',
		icon: HomeIcon,
		emoji: 'HM',
		href: '/dashboard'
	},
	{
		key: 'network',
		railLabel: 'Network',
		label: 'Network',
		icon: NetworkIcon,
		emoji: 'NW',
		href: '/network'
	},
	{
		key: 'runs-projects',
		railLabel: 'Runs',
		label: 'Runs & Projects',
		icon: FolderKanbanIcon,
		emoji: 'RP',
		href: '/runs'
	},
	{
		key: 'analytics',
		railLabel: 'Analytics',
		label: 'Analytics',
		icon: GaugeIcon,
		emoji: 'AN',
		href: '/analytics'
	},
	{
		key: 'docs',
		railLabel: 'Docs',
		label: 'Documentation',
		icon: FileTextIcon,
		emoji: 'DC',
		href: '/docs'
	},
	{
		key: 'settings',
		railLabel: 'Settings',
		label: 'Settings',
		icon: SettingsIcon,
		emoji: 'ST',
		href: '/settings'
	}
] as const;

const panelData: Record<string, { group: string; items: { label: string; href: string }[] }[]> = {
	home: [
		{
			group: 'Home',
			items: [
				{ label: 'Overview', href: '/dashboard' },
				{ label: 'Network Health', href: '/dashboard/network-health' }
			]
		}
	],
	network: [
		{
			group: 'Network',
			items: [
				{ label: 'Service Mesh', href: '/network/mesh' },
				{ label: 'Nodes', href: '/network/nodes' },
				{ label: 'Services', href: '/network/services' },
				{ label: 'Fidelity', href: '/network/fidelity' }
			]
		},
		{
			group: 'Topology',
			items: [
				{ label: 'DAG View', href: '/network/dag' },
				{ label: 'Circuit Paths', href: '/network/circuits' },
				{ label: 'Zones', href: '/network/zones' }
			]
		}
	],
	'runs-projects': [
		{
			group: 'Runs',
			items: [
				{ label: 'Run History', href: '/runs' }
			]
		},
		{
			group: 'Projects',
			items: []
		}
	],
	analytics: [
		{
			group: 'Analytics',
			items: [
				{ label: 'Measurements', href: '/analytics/measurements' },
				{ label: 'Geometry', href: '/analytics/geometry' },
				{ label: 'Deep State', href: '/analytics/deep-state' },
				{ label: 'Comparisons', href: '/analytics/comparisons' }
			]
		},
		{
			group: 'Insights',
			items: [
				{ label: 'Efficient Frontier', href: '/analytics/frontier' },
				{ label: 'State Ranking', href: '/analytics/ranking' },
				{ label: 'Solver Diagnostics', href: '/analytics/diagnostics' }
			]
		}
	],
	docs: [
		{
			group: 'Documentation',
			items: [
				{ label: 'System Docs', href: '/docs' },
				{ label: 'Roadmap', href: '/docs/roadmap' },
				{ label: 'API Reference', href: '/docs/api' }
			]
		},
		{
			group: 'Developer',
			items: [
				{ label: 'Schemas', href: '/docs/schemas' },
				{ label: 'Examples', href: '/docs/examples' },
				{ label: 'Playbooks', href: '/docs/playbooks' }
			]
		}
	],
	settings: [
		{
			group: 'Workspace',
			items: [
				{ label: 'General', href: '/settings' },
				{ label: 'Integrations', href: '/settings/integrations' },
				{ label: 'Users', href: '/settings/users' }
			]
		},
		{
			group: 'System',
			items: [
				{ label: 'Security', href: '/settings/security' },
				{ label: 'Observability', href: '/settings/observability' },
				{ label: 'Audit Logs', href: '/settings/audit' }
			]
		}
	]
};

/** Sidebar links for Runs & Projects — maps label → href */
const runsProjectsItemHref: Record<string, string> = {
	'Run History': '/runs'
};

/** Financial submenu under Runs → Projects (separate pages instead of hash links). */
const FINANCIAL_SUBMENU_LINKS: { label: string; href: string }[] = [
	{ label: 'Upload & Analyse', href: '/finance' },
	{ label: 'Benchmark', href: '/finance/benchmark' },
	{ label: 'Frontier', href: '/finance/frontier' },
	{ label: 'Execution', href: '/finance/execution' },
	{ label: 'Top States', href: '/finance/states' }
];

function financialSubLinkIsActive(href: string, pathname: string, hash: string): boolean {
	return pathname === href || pathname.startsWith(href + '/');
}

const SIDEBAR_ITEM_ICONS: Record<string, LucideIcon> = {
	'Upload & Analyse': FlameIcon,
	'Recent Jobs': ClipboardListIcon,
	Benchmark: BarChart3Icon,
	Scenarios: BoxIcon,
	Correlations: ActivityIcon,
	Overview: LayoutDashboardIcon,
	Activity: ActivityIcon,
	'Quick Actions': ZapIcon,
	'Network Health': HeartPulseIcon,
	'Open Runs': PlayCircleIcon,
	'Recent Alerts': AlertTriangleIcon,
	'Service Mesh': NetworkIcon,
	Nodes: ServerIcon,
	Services: CpuIcon,
	Fidelity: RadioIcon,
	'DAG View': GitBranchIcon,
	'Circuit Paths': MapIcon,
	Zones: BoxIcon,
	'Active Run': PlayCircleIcon,
	'Run History': ClipboardListIcon,
	Plans: ClipboardListIcon,
	Results: BarChart3Icon,
	'All Projects': FolderKanbanIcon,
	Experiments: FlaskConicalIcon,
	Reports: FileTextIcon,
	Artifacts: PackageIcon,
	Financial: FlameIcon,
	Measurements: GaugeIcon,
	Geometry: BoxIcon,
	'Deep State': BrainIcon,
	Comparisons: BarChart3Icon,
	'Efficient Frontier': LineChartIcon,
	'State Ranking': ActivityIcon,
	'Solver Diagnostics': AlertTriangleIcon,
	Frontier: LineChartIcon,
	'Top States': ActivityIcon,
	'System Docs': BookOpenIcon,
	Roadmap: MapIcon,
	'API Reference': FileCodeIcon,
	Schemas: LibraryIcon,
	Examples: SparklesIcon,
	Playbooks: ClipboardListIcon,
	Assistant: BotIcon,
	'Prompt Studio': SparklesIcon,
	Automation: WrenchIcon,
	'Context Packs': BoxIcon,
	'Model Runs': CpuIcon,
	Suggestions: SparklesIcon,
	General: SettingsIcon,
	Integrations: WrenchIcon,
	Users: UsersIcon,
	Security: ShieldIcon,
	Observability: BarChart3Icon,
	'Audit Logs': KeyRoundIcon
};

function iconForSidebarItem(label: string): LucideIcon {
	return SIDEBAR_ITEM_ICONS[label] ?? CircleDotIcon;
}

function parseRunsRoute(pathname: string): {
	runId: string | null;
	isFragmentFlow: boolean;
} {
	const flow = /^\/runs\/([^/]+)\/fragment-flow\/?$/.exec(pathname);
	if (flow && flow[1] !== 'new') {
		return { runId: flow[1], isFragmentFlow: true };
	}
	const detail = /^\/runs\/([^/]+)\/?$/.exec(pathname);
	if (detail && detail[1] !== 'new') {
		return { runId: detail[1], isFragmentFlow: false };
	}
	return { runId: null, isFragmentFlow: false };
}

export function DashboardShell({ children }: DashboardShellProps) {
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const hash = useHash();
	const { runId, isFragmentFlow } = useMemo(() => parseRunsRoute(pathname), [pathname]);
	const statusFilter = searchParams.get('status');
	const fragmentBreadcrumbId = searchParams.get('fragment');
	const routeState = useMemo(() => {
		// Detect active nav item based on pathname
		if (pathname.startsWith('/network')) return { activeItem: 'network' as const };
		if (pathname.startsWith('/analytics')) return { activeItem: 'analytics' as const };
		if (pathname.startsWith('/docs')) return { activeItem: 'docs' as const };
		if (pathname.startsWith('/settings')) return { activeItem: 'settings' as const };
		if (pathname.startsWith('/runs') || pathname.startsWith('/finance')) {
			return { activeItem: 'runs-projects' as const };
		}
		if (pathname === '/dashboard' || pathname === '/') {
			return { activeItem: 'home' as const };
		}
		return null;
	}, [pathname]);
	const activeItem = routeState?.activeItem ?? 'home';
	const activeNav = navItems.find(item => item.key === activeItem) ?? navItems[0];
	const ActiveNavIcon = activeNav.icon;
	const activeGroups = panelData[activeItem] ?? [];
	const [activePanelItem, setManualActivePanelItem] = useState<string | null>(null);

	return (
		<div className='flex h-svh max-h-svh overflow-hidden bg-plane-bg-base text-foreground'>
			{/* Rail */}
			<aside className='relative z-0 flex min-h-0 w-[4.5rem] shrink-0 flex-col overflow-x-visible overflow-y-auto'>
				{/* Logo */}
				<div className='flex h-14 shrink-0 items-center justify-center text-[13px] font-black leading-none tracking-tighter text-foreground'>
					<span className='text-primary'>Q</span>G
				</div>

				{/* Nav items */}
				<nav className='flex flex-1 flex-col items-center gap-5 py-2'>
					{navItems.map(item => {
						const Icon = item.icon;
						const isActive = activeItem === item.key;

						return (
							<Link
								key={item.key}
								href={item.href}
								aria-label={item.label}
								aria-current={isActive ? 'page' : undefined}
								className='flex flex-col items-center gap-[5px]'
							>
								<span
									className={cn(
										'flex size-11 items-center justify-center rounded-[14px] transition-all duration-150',
										isActive
											? 'bg-white text-foreground shadow'
											: 'text-muted-foreground/60 hover:text-foreground'
									)}
								>
									<Icon className='size-[18px] shrink-0' strokeWidth={isActive ? 2 : 1.5} />
								</span>
								<span
									className={cn(
										'text-[10px] leading-none',
										isActive
											? 'font-semibold text-foreground'
											: 'font-medium text-muted-foreground/60'
									)}
								>
									{item.railLabel}
								</span>
							</Link>
						);
					})}
				</nav>

				{/* User avatar pinned to bottom */}
				<button
					type='button'
					aria-label='Account'
					className='flex h-14 w-full shrink-0 items-center justify-center'
				>
					<span className='relative flex size-8 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground'>
						SB
						<span className='absolute bottom-0 right-0 size-2 rounded-full border-2 border-plane-bg-base bg-green-500' />
					</span>
				</button>
			</aside>

			<SidebarProvider className='!min-h-0 flex min-w-0 flex-1 flex-col overflow-hidden bg-transparent has-data-[variant=inset]:bg-transparent'>
					<div className='relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border/60 bg-plane-bg-elevated shadow-sm'>
						<div className='relative flex min-h-0 min-w-0 flex-1 overflow-hidden'>
							<Sidebar
								collapsible='none'
								className='relative h-full min-h-0 shrink-0 overflow-hidden border-r border-border/60 bg-transparent text-sidebar-foreground'
							>
								<SidebarHeader className='relative gap-2 border-b border-border bg-card px-4 py-3'>
									<div className='flex items-start justify-between gap-3'>
										<div className='flex min-w-0 flex-1 items-start gap-3'>
											<div className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10'>
												<ActiveNavIcon className='size-5 text-primary' />
											</div>
											<div className='min-w-0'>
												<p className='truncate text-sm font-semibold tracking-tight'>
													{activeNav.label}
												</p>
												<p className='text-xs text-muted-foreground'>
													Workspace navigation
												</p>
											</div>
										</div>
										{activeItem === 'runs-projects' ? (
											pathname.startsWith('/finance') ? (
												<Button
													asChild
													size='icon'
													variant='outline'
													className='size-8 shrink-0 rounded-md border-border/50 bg-background hover:bg-muted'
													aria-label='New analysis'
												>
													<Link href='/finance'>
														<PlusIcon className='size-4' />
													</Link>
												</Button>
											) : (
												<Button
													asChild
													size='icon'
													variant='outline'
													className='size-8 shrink-0 rounded-md border-border/50 bg-background hover:bg-muted'
													aria-label='New run'
												>
													<Link href='/runs/new'>
														<PlusIcon className='size-4' />
													</Link>
												</Button>
											)
										) : (
											<Button
												type='button'
												size='icon'
												variant='outline'
												className='size-8 shrink-0 rounded-md border-border/50 bg-background hover:bg-muted'
												aria-label='Add'
											>
												<PlusIcon className='size-4' />
											</Button>
										)}
									</div>
								</SidebarHeader>
								<SidebarContent className='relative gap-0 px-0 py-3'>
									{activeGroups.map((section, sectionIdx) => (
										<div key={section.group}>
											{sectionIdx > 0 && (
												<SidebarSeparator className='my-3 bg-border/50' />
											)}
											<SidebarGroup className='gap-1'>
												<SidebarGroupLabel className='px-4 text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
													{section.group}
												</SidebarGroupLabel>
												<SidebarGroupContent>
													<SidebarMenu className='gap-0.5 px-2'>
														{section.items.map(item => {
															const NavIcon = iconForSidebarItem(item.label);
															const runsHref =
																activeItem === 'runs-projects'
																	? runsProjectsItemHref[item.label]
																	: undefined;

															if (runsHref) {
																const onRunsList = pathname === '/runs';
																const isRunHistoryActive =
																	item.label === 'Run History' &&
																	onRunsList &&
																	!runId;

																return (
																	<SidebarMenuItem key={item.label}>
																		<SidebarMenuButton
																			asChild
																			isActive={isRunHistoryActive}
																			className='px-3'
																		>
																			<Link
																				href={runsHref}
																				onClick={() =>
																					setManualActivePanelItem(item.label)
																				}
																			>
																				<NavIcon className='opacity-80' />
																				<span className='truncate'>{item.label}</span>
																			</Link>
																		</SidebarMenuButton>
																	</SidebarMenuItem>
																);
															}

															return (
																<SidebarMenuItem key={item.href}>
																	<SidebarMenuButton
																		asChild
																		isActive={pathname === item.href}
																		className='px-3'
																	>
																		<Link href={item.href}>
																			<NavIcon className='opacity-80' />
																			<span className='truncate'>{item.label}</span>
																		</Link>
																	</SidebarMenuButton>
																</SidebarMenuItem>
															);
														})}
														{section.group === 'Projects' &&
														activeItem === 'runs-projects' ? (
															<SidebarMenuItem>
																<Collapsible
																	defaultOpen={pathname.startsWith('/finance')}
																	className='group/collapsible w-full'
																>
																	<CollapsibleTrigger asChild>
																		<SidebarMenuButton
																			isActive={pathname.startsWith('/finance')}
																			className='px-3'
																		>
																			<FlameIcon className='opacity-80' />
																			<span className='truncate'>Financial</span>
																			<ChevronRightIcon className='ml-auto size-4 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-90' />
																		</SidebarMenuButton>
																	</CollapsibleTrigger>
																	<CollapsibleContent>
																		<SidebarMenuSub>
																			{FINANCIAL_SUBMENU_LINKS.map(link => (
																				<SidebarMenuSubItem key={link.href}>
																					<SidebarMenuSubButton
																						asChild
																						size='sm'
																						isActive={financialSubLinkIsActive(
																							link.href,
																							pathname,
																							hash
																						)}
																					>
																						<Link
																							href={link.href}
																							onClick={() =>
																								setManualActivePanelItem(
																									'Financial'
																								)
																							}
																						>
																							<span className='truncate'>
																								{link.label}
																							</span>
																						</Link>
																					</SidebarMenuSubButton>
																				</SidebarMenuSubItem>
																			))}
																		</SidebarMenuSub>
																	</CollapsibleContent>
																</Collapsible>
															</SidebarMenuItem>
														) : null}
													</SidebarMenu>
												</SidebarGroupContent>
											</SidebarGroup>
										</div>
									))}
								</SidebarContent>
							</Sidebar>

							<div className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background/50'>
								<header className='flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-transparent px-4 py-3'>
									<Breadcrumb>
										<BreadcrumbList>
											<BreadcrumbItem>
												<BreadcrumbLink asChild>
													<Link href='/dashboard'>Dashboard</Link>
												</BreadcrumbLink>
											</BreadcrumbItem>
											<BreadcrumbSeparator />
											{pathname === '/runs/new' ? (
												<>
													<BreadcrumbItem className='max-w-[40vw] sm:max-w-none'>
														<BreadcrumbLink asChild>
															<Link
																href='/runs'
																className='truncate'
															>
																Runs & Projects
															</Link>
														</BreadcrumbLink>
													</BreadcrumbItem>
													<BreadcrumbSeparator />
													<BreadcrumbItem>
														<BreadcrumbPage>New run</BreadcrumbPage>
													</BreadcrumbItem>
												</>
											) : runId ? (
												<>
													<BreadcrumbItem className='max-w-[40vw] sm:max-w-none'>
														<BreadcrumbLink asChild>
															<Link
																href='/runs'
																className='truncate'
															>
																Runs & Projects
															</Link>
														</BreadcrumbLink>
													</BreadcrumbItem>
													<BreadcrumbSeparator />
													<BreadcrumbItem className='min-w-0 max-w-[min(100%,14rem)] sm:max-w-md'>
														{isFragmentFlow ? (
															<BreadcrumbLink asChild>
																<Link
																	href={`/runs/${encodeURIComponent(runId)}`}
																	className='truncate font-mono text-sm'
																>
																	Run {runId}
																</Link>
															</BreadcrumbLink>
														) : (
															<BreadcrumbPage className='truncate font-mono text-sm'>
																Run {runId}
															</BreadcrumbPage>
														)}
													</BreadcrumbItem>
													{isFragmentFlow ? (
														<>
															<BreadcrumbSeparator />
															<BreadcrumbItem className='min-w-0 max-w-[min(100%,12rem)] sm:max-w-md'>
																{fragmentBreadcrumbId ? (
																	<BreadcrumbLink asChild>
																		<Link
																			href={`/runs/${encodeURIComponent(runId)}/fragment-flow`}
																			className='truncate'
																		>
																			Fragment flow
																		</Link>
																	</BreadcrumbLink>
																) : (
																	<BreadcrumbPage className='truncate'>
																		Fragment flow
																	</BreadcrumbPage>
																)}
															</BreadcrumbItem>
															{fragmentBreadcrumbId ? (
																<>
																	<BreadcrumbSeparator />
																	<BreadcrumbItem className='min-w-0 max-w-[min(100%,14rem)] sm:max-w-md'>
																		<BreadcrumbPage className='truncate font-mono text-sm'>
																			{fragmentBreadcrumbId}
																		</BreadcrumbPage>
																	</BreadcrumbItem>
																</>
															) : null}
														</>
													) : null}
												</>
											) : pathname === '/runs' ? (
												<>
													<BreadcrumbItem>
														<BreadcrumbPage>Runs & Projects</BreadcrumbPage>
													</BreadcrumbItem>
													<BreadcrumbSeparator />
													<BreadcrumbItem>
														<BreadcrumbPage>All runs</BreadcrumbPage>
													</BreadcrumbItem>
												</>
											) : pathname.startsWith('/finance') ? (
												<>
													<BreadcrumbItem className='max-w-[40vw] sm:max-w-none'>
														<BreadcrumbLink asChild>
															<Link
																href='/runs'
																className='truncate'
															>
																Runs & Projects
															</Link>
														</BreadcrumbLink>
													</BreadcrumbItem>
													<BreadcrumbSeparator />
													<BreadcrumbItem>
														<BreadcrumbPage>Financial Analytics</BreadcrumbPage>
													</BreadcrumbItem>
												</>
											) : activePanelItem ? (
												<>
													<BreadcrumbItem className='max-w-[40vw] sm:max-w-none'>
														<BreadcrumbLink asChild>
															<Link
																href='/dashboard'
																className='truncate'
																onClick={() => setManualActivePanelItem(null)}
															>
																{activeNav.label}
															</Link>
														</BreadcrumbLink>
													</BreadcrumbItem>
													<BreadcrumbSeparator />
													<BreadcrumbItem className='min-w-0 max-w-[min(100%,12rem)] sm:max-w-md'>
														<BreadcrumbPage className='truncate'>
															{activePanelItem}
														</BreadcrumbPage>
													</BreadcrumbItem>
												</>
											) : (
												<BreadcrumbItem>
													<BreadcrumbPage>{activeNav.label}</BreadcrumbPage>
												</BreadcrumbItem>
											)}
										</BreadcrumbList>
									</Breadcrumb>
								</header>

								<main className='min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain'>
									{children}
								</main>
							</div>
						</div>
					</div>
				</SidebarProvider>
		</div>
	);
}
