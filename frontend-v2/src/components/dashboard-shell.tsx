'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger
} from '@/components/ui/collapsible';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
	ActivityIcon,
	AlertTriangleIcon,
	BarChart3Icon,
	BellIcon,
	BookOpenIcon,
	BotIcon,
	BoxIcon,
	BrainIcon,
	CalendarIcon,
	ChevronDownIcon,
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
	SearchIcon,
	ServerIcon,
	SettingsIcon,
	ShieldIcon,
	SparklesIcon,
	UsersIcon,
	VideoIcon,
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

const navItems = [
	{
		key: 'home',
		railLabel: 'Home',
		label: 'Home',
		icon: HomeIcon,
		emoji: 'HM'
	},
	{
		key: 'network',
		railLabel: 'Network',
		label: 'Network',
		icon: NetworkIcon,
		emoji: 'NW'
	},
	{
		key: 'runs-projects',
		railLabel: 'Runs',
		label: 'Runs & Projects',
		icon: FolderKanbanIcon,
		emoji: 'RP'
	},
	{
		key: 'analytics',
		railLabel: 'Analytics',
		label: 'Analytics',
		icon: GaugeIcon,
		emoji: 'AN'
	},
	{
		key: 'docs',
		railLabel: 'Docs',
		label: 'Docs',
		icon: FileTextIcon,
		emoji: 'DC'
	},
	{
		key: 'ai',
		railLabel: 'AI',
		label: 'AI Assistant',
		icon: BotIcon,
		emoji: 'AI'
	},
	{
		key: 'settings',
		railLabel: 'Settings',
		label: 'Settings',
		icon: SettingsIcon,
		emoji: 'ST'
	}
] as const;

const panelData: Record<string, { group: string; items: string[] }[]> = {
	home: [
		{ group: 'Home', items: ['Overview', 'Activity', 'Quick Actions'] },
		{ group: 'Current Focus', items: ['Network Health', 'Open Runs', 'Recent Alerts'] }
	],
	network: [
		{ group: 'Network', items: ['Service Mesh', 'Nodes', 'Services', 'Fidelity'] },
		{ group: 'Topology', items: ['DAG View', 'Circuit Paths', 'Zones'] }
	],
	'runs-projects': [
		{ group: 'Runs', items: ['Active Run', 'Run History', 'Plans', 'Results'] },
		{ group: 'Projects', items: ['All Projects', 'Experiments', 'Reports', 'Artifacts'] }
	],
	analytics: [
		{ group: 'Analytics', items: ['Measurements', 'Geometry', 'Deep State', 'Comparisons'] },
		{ group: 'Insights', items: ['Trend Explorer', 'Anomalies', 'Forecasts'] }
	],
	docs: [
		{ group: 'Documentation', items: ['System Docs', 'Roadmap', 'API Reference'] },
		{ group: 'Developer', items: ['Schemas', 'Examples', 'Playbooks'] }
	],
	ai: [
		{ group: 'AI', items: ['Assistant', 'Prompt Studio', 'Automation'] },
		{ group: 'Knowledge', items: ['Context Packs', 'Model Runs', 'Suggestions'] }
	],
	settings: [
		{ group: 'Workspace', items: ['General', 'Integrations', 'Users'] },
		{ group: 'System', items: ['Security', 'Observability', 'Audit Logs'] }
	]
};

/** Sidebar links for Runs & Projects — maps label → href */
const runsProjectsItemHref: Record<string, string> = {
	'Run History': '/runs',
	'Active Run': '/runs?status=running'
};

/** Financial submenu under Runs → Projects (hash matches analytics tabs). */
const FINANCIAL_SUBMENU_LINKS: { label: string; href: string }[] = [
	{ label: 'Upload & Analyse', href: '/finance' },
	{ label: 'Column Profiles', href: '/finance#profiles' },
	{ label: 'Correlations', href: '/finance#correlations' },
	{ label: 'Trends', href: '/finance#trends' },
	{ label: 'DCF Valuation', href: '/finance#dcf' },
	{ label: 'Anomalies', href: '/finance#anomalies' },
	{ label: 'Execution', href: '/finance#execution' }
];

function financialSubLinkIsActive(href: string, pathname: string, hash: string): boolean {
	if (!pathname.startsWith('/finance')) return false;
	const hashIdx = href.indexOf('#');
	if (hashIdx === -1) return !hash;
	return hash === href.slice(hashIdx + 1);
}

const SIDEBAR_ITEM_ICONS: Record<string, LucideIcon> = {
	'Upload & Analyse': FlameIcon,
	'Recent Jobs': ClipboardListIcon,
	'DCF Valuation': BarChart3Icon,
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
	'Trend Explorer': LineChartIcon,
	Anomalies: AlertTriangleIcon,
	Forecasts: LineChartIcon,
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
	const [manualActiveItem, setManualActiveItem] = useState<(typeof navItems)[number]['key']>('home');
	const [manualActivePanelItem, setManualActivePanelItem] = useState<string | null>(null);
	const { runId, isFragmentFlow } = useMemo(() => parseRunsRoute(pathname), [pathname]);
	const statusFilter = searchParams.get('status');
	const fragmentBreadcrumbId = searchParams.get('fragment');
	const routeState = useMemo(() => {
		if (pathname.startsWith('/runs')) {
			return {
				activeItem: 'runs-projects' as const,
				activePanelItem:
					pathname === '/runs'
						? statusFilter === 'running' || statusFilter === 'current'
							? 'Active Run'
							: 'Run History'
						: null
			};
		}

		if (pathname.startsWith('/finance')) {
			return {
				activeItem: 'runs-projects' as const,
				activePanelItem: null
			};
		}

		if (pathname === '/dashboard' || pathname === '/') {
			return {
				activeItem: 'home' as const,
				activePanelItem: null
			};
		}

		return null;
	}, [pathname, statusFilter]);
	const activeItem = routeState?.activeItem ?? manualActiveItem;
	const activePanelItem = routeState?.activePanelItem ?? manualActivePanelItem;
	const activeNav = navItems.find(item => item.key === activeItem) ?? navItems[0];
	const ActiveNavIcon = activeNav.icon;
	const activeGroups = panelData[activeItem] ?? [];

	const homeRailActive = (pathname === '/dashboard' || pathname === '/') && activeItem === 'home';
	const runsRailActive =
		(pathname.startsWith('/runs') || pathname.startsWith('/finance')) && activeItem === 'runs-projects';

	const railItemActive = (key: (typeof navItems)[number]['key']) => {
		if (key === 'home') return homeRailActive;
		if (key === 'runs-projects') return runsRailActive;
		return activeItem === key;
	};

	return (
		<div className='flex h-svh max-h-svh flex-col overflow-hidden bg-muted/30 text-foreground'>
			<header className='flex h-11 shrink-0 items-center gap-3 border-b bg-background px-3'>
				<div className='flex items-center gap-2'>
					<span className='flex size-7 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground shadow-sm'>
						QG
					</span>
					<button
						type='button'
						className='flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-foreground transition-colors hover:bg-muted'
					>
						Quantum Gates
						<ChevronDownIcon className='size-4 opacity-70' />
					</button>
					<button
						type='button'
						className='hidden rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground sm:block'
						aria-label='Open calendar'
					>
						<CalendarIcon className='size-4' />
					</button>
				</div>

				<div className='mx-auto flex max-w-xl flex-1'>
					<div className='flex w-full items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground'>
						<SearchIcon className='size-4 shrink-0 opacity-60' />
						<span className='flex-1 truncate'>Search</span>
						<kbd className='hidden rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block'>
							⌘ K
						</kbd>
					</div>
				</div>

				<div className='flex items-center gap-1'>
					<Button
						type='button'
						variant='ghost'
						size='icon-sm'
						aria-label='Notifications'
					>
						<BellIcon className='size-4' />
					</Button>
					<Button
						type='button'
						variant='ghost'
						size='icon-sm'
						aria-label='Video'
					>
						<VideoIcon className='size-4' />
					</Button>
					<button
						type='button'
						className='relative ml-1 flex size-8 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground ring-2 ring-background'
						aria-label='Account'
					>
						SB
						<span className='absolute bottom-0.5 right-0.5 size-1.5 rounded-full bg-chart-1 ring-2 ring-background' />
					</button>
				</div>
			</header>

			<div className='flex min-h-0 min-w-0 flex-1 gap-2 overflow-hidden px-2 pb-2 pt-2'>
				<aside className='flex min-h-0 w-16 shrink-0 flex-col items-center overflow-hidden rounded-2xl border bg-card py-2 shadow-sm'>
					<div className='mb-1.5 flex size-8 items-center justify-center rounded-lg bg-primary/10 text-[9px] font-bold text-primary'>
						QG
					</div>

					<nav className='flex flex-1 flex-col items-center gap-1 px-0.5'>
						{navItems.map(item => {
							const Icon = item.icon;
							const isActive = railItemActive(item.key);

							if (item.key === 'home') {
								return (
									<Link
										key={item.key}
										href='/dashboard'
										aria-label={item.label}
										aria-current={isActive ? 'page' : undefined}
										onClick={() => {
											setManualActiveItem('home');
											setManualActivePanelItem(null);
										}}
										className={cn(
											'flex w-full flex-col items-center gap-px rounded-lg px-1 py-1.5 transition-colors',
											isActive
												? 'bg-primary/15 text-primary shadow-sm ring-1 ring-primary/30'
												: 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
										)}
									>
										<Icon className='size-4 shrink-0' />
										<span className='max-w-full truncate text-[9px] font-medium leading-tight'>
											{item.railLabel}
										</span>
									</Link>
								);
							}

							if (item.key === 'runs-projects') {
								return (
									<Link
										key={item.key}
										href='/runs'
										aria-label={item.label}
										aria-current={isActive ? 'page' : undefined}
										onClick={() => {
											setManualActiveItem('runs-projects');
											setManualActivePanelItem('Run History');
										}}
										className={cn(
											'flex w-full flex-col items-center gap-px rounded-lg px-1 py-1.5 transition-colors',
											isActive
												? 'bg-primary/15 text-primary shadow-sm ring-1 ring-primary/30'
												: 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
										)}
									>
										<Icon className='size-4 shrink-0' />
										<span className='max-w-full truncate text-[9px] font-medium leading-tight'>
											{item.railLabel}
										</span>
									</Link>
								);
							}

							return (
								<button
									key={item.key}
									type='button'
									aria-label={item.label}
									aria-pressed={isActive}
									onClick={() => {
										setManualActiveItem(item.key);
										setManualActivePanelItem(null);
									}}
									className={cn(
										'flex w-full flex-col items-center gap-px rounded-lg px-1 py-1.5 transition-colors',
										isActive
											? 'bg-primary/15 text-primary shadow-sm ring-1 ring-primary/30'
											: 'text-muted-foreground hover:bg-muted/80 hover:text-foreground'
									)}
								>
									<Icon className='size-4 shrink-0' />
									<span className='max-w-full truncate text-[9px] font-medium leading-tight'>
										{item.railLabel}
									</span>
								</button>
							);
						})}
					</nav>

					<button
						type='button'
						aria-label='Settings'
						className='mt-1 flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
					>
						<SettingsIcon className='size-3.5' />
					</button>
				</aside>

				<SidebarProvider className='!min-h-0 flex min-w-0 flex-1 flex-col overflow-hidden bg-transparent has-data-[variant=inset]:bg-transparent'>
					<div className='relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm'>
						<div className='relative z-[1] flex min-h-0 min-w-0 flex-1 overflow-hidden'>
							<Sidebar
								collapsible='none'
								className='relative h-full min-h-0 shrink-0 overflow-hidden border-r border-sidebar-border/80 bg-sidebar text-sidebar-foreground before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_90%_45%_at_50%_-15%,var(--primary-glow),transparent)] dark:before:bg-[radial-gradient(ellipse_90%_45%_at_50%_-15%,var(--primary-glow-strong),transparent)]'
							>
								<SidebarHeader className='relative gap-2 border-b border-sidebar-border/60 bg-sidebar/80 px-4 py-4 backdrop-blur-[2px]'>
									<div className='flex items-start justify-between gap-3'>
										<div className='flex min-w-0 flex-1 items-start gap-3'>
											<div className='flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 via-primary/10 to-transparent shadow-inner ring-1 ring-primary/20'>
												<ActiveNavIcon className='size-5 text-primary' />
											</div>
											<div className='min-w-0'>
												<p className='truncate text-sm font-semibold tracking-tight'>
													{activeNav.label}
												</p>
												<p className='text-xs text-sidebar-foreground/65'>
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
													className='size-8 shrink-0 rounded-lg border-primary/25 bg-background/50 shadow-sm hover:bg-primary/10'
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
													className='size-8 shrink-0 rounded-lg border-primary/25 bg-background/50 shadow-sm hover:bg-primary/10'
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
												className='size-8 shrink-0 rounded-lg'
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
												<SidebarSeparator className='my-3 bg-gradient-to-r from-transparent via-sidebar-border to-transparent' />
											)}
											<SidebarGroup className='gap-1.5'>
												<SidebarGroupLabel className='px-4 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50'>
													{section.group}
												</SidebarGroupLabel>
												<SidebarGroupContent>
													<SidebarMenu className='gap-0.5 px-2'>
														{section.items.map(item => {
															const NavIcon = iconForSidebarItem(item);
															const runsHref =
																activeItem === 'runs-projects'
																	? runsProjectsItemHref[item]
																	: undefined;

															if (runsHref) {
																const onRunsList = pathname === '/runs';
																const isRunHistoryActive =
																	item === 'Run History' &&
																	onRunsList &&
																	!runId &&
																	statusFilter !== 'current';
																const isActiveRunLinkActive =
																	item === 'Active Run' &&
																	onRunsList &&
																	!runId &&
																	(statusFilter === 'running' ||
																		statusFilter === 'current');

																return (
																	<SidebarMenuItem key={item}>
																		<SidebarMenuButton
																			asChild
																			isActive={
																				isRunHistoryActive ||
																				isActiveRunLinkActive
																			}
																			className='px-3'
																		>
																			<Link
																				href={runsHref}
																				onClick={() =>
																					setManualActivePanelItem(item)
																				}
																			>
																				<NavIcon className='opacity-80' />
																				<span className='truncate'>{item}</span>
																			</Link>
																		</SidebarMenuButton>
																	</SidebarMenuItem>
																);
															}

															return (
																<SidebarMenuItem key={item}>
																	<SidebarMenuButton
																		type='button'
																		isActive={activePanelItem === item}
																		onClick={() => setManualActivePanelItem(item)}
																		className='px-3'
																	>
																		<NavIcon className='opacity-80' />
																		<span className='truncate'>{item}</span>
																	</SidebarMenuButton>
																</SidebarMenuItem>
															);
														})}
														{section.group === 'Projects' && activeItem === 'runs-projects' ? (
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

							<div className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background'>
								<header className='flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-background px-4 py-3'>
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
		</div>
	);
}
