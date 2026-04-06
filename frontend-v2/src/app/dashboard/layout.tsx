"use client"

import type { ReactNode } from "react"
import { useState } from "react"
import {
  ActivityIcon,
  BellIcon,
  BotIcon,
  CalendarIcon,
  ChevronDownIcon,
  CircleIcon,
  HomeIcon,
  LayoutDashboardIcon,
  LockIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  VideoIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type DashboardLayoutProps = {
  children: ReactNode
}

const navItems = [
  {
    key: "overview",
    railLabel: "Home",
    label: "Overview",
    icon: HomeIcon,
    emoji: "OV",
  },
  {
    key: "agents",
    railLabel: "Agents",
    label: "Agents",
    icon: BotIcon,
    emoji: "AI",
  },
  {
    key: "signals",
    railLabel: "Signals",
    label: "Signals",
    icon: ActivityIcon,
    emoji: "SI",
  },
  {
    key: "experiments",
    railLabel: "Labs",
    label: "Experiments",
    icon: SparklesIcon,
    emoji: "EX",
  },
] as const

const panelData: Record<string, { group: string; items: string[] }[]> = {
  overview: [
    { group: "Workspace", items: ["Inbox", "Assigned Comments", "All Tasks", "My Tasks"] },
    { group: "Views", items: ["List", "Board", "Calendar", "Gantt"] },
  ],
  agents: [
    { group: "Agents", items: ["All Agents", "Running Jobs", "Agent Logs"] },
    { group: "Automation", items: ["Workflows", "Triggers", "Task Rules"] },
  ],
  signals: [
    { group: "Signals", items: ["Live Feed", "Alerts", "Anomaly Detection"] },
    { group: "Reports", items: ["Daily Summary", "Trends", "Exports"] },
  ],
  experiments: [
    { group: "Labs", items: ["Experiments", "Templates", "Runs"] },
    { group: "Insights", items: ["Comparisons", "Artifacts", "Metrics"] },
  ],
}

const viewTabs = ["List", "Board", "Calendar", "Gantt", "Table"] as const

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [activeItem, setActiveItem] = useState<(typeof navItems)[number]["key"]>(navItems[0].key)
  const [activeView, setActiveView] = useState<(typeof viewTabs)[number]>("List")
  const [activePanelItem, setActivePanelItem] = useState<string | null>(null)

  const activeNav = navItems.find((item) => item.key === activeItem) ?? navItems[0]
  const activeGroups = panelData[activeItem] ?? []

  return (
    <div className="flex h-svh max-h-svh flex-col overflow-hidden bg-muted/30 text-foreground">
      {/* Top bar — workspace, search, actions */}
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-background px-3">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground shadow-sm">
            QG
          </span>
          <button
            type="button"
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Quantum Gates
            <ChevronDownIcon className="size-4 opacity-70" />
          </button>
          <button
            type="button"
            className="hidden rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground sm:block"
            aria-label="Open calendar"
          >
            <CalendarIcon className="size-4" />
          </button>
        </div>

        <div className="mx-auto flex max-w-xl flex-1">
          <div className="flex w-full items-center gap-2 rounded-full border border-border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground shadow-inner">
            <SearchIcon className="size-4 shrink-0 opacity-60" />
            <span className="flex-1 truncate">Search</span>
            <kbd className="hidden rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
              ⌘ K
            </kbd>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Notifications">
            <BellIcon className="size-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Video">
            <VideoIcon className="size-4" />
          </Button>
          <button
            type="button"
            className="relative ml-1 flex size-8 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground ring-2 ring-background"
            aria-label="Account"
          >
            SB
            <span className="absolute bottom-0.5 right-0.5 size-1.5 rounded-full bg-emerald-500 ring-2 ring-background" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 gap-3 overflow-hidden p-3 pt-3">
        {/* Floating rail — icons + short labels (no scroll; height follows viewport) */}
        <aside className="flex min-h-0 w-16 shrink-0 flex-col items-center overflow-hidden rounded-2xl border border-border bg-card py-2 shadow-lg ring-1 ring-black/5">
          <div className="mb-1.5 flex size-8 items-center justify-center rounded-lg bg-primary/10 text-[9px] font-bold text-primary">
            QG
          </div>

          <nav className="flex flex-1 flex-col items-center gap-1 px-0.5">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = activeItem === item.key

              return (
                <button
                  key={item.key}
                  type="button"
                  aria-label={item.label}
                  aria-pressed={isActive}
                  onClick={() => {
                    setActiveItem(item.key)
                    setActivePanelItem(null)
                  }}
                  className={cn(
                    "flex w-full flex-col items-center gap-px rounded-lg px-1 py-1.5 transition-colors",
                    isActive
                      ? "bg-primary/15 text-primary shadow-sm ring-1 ring-primary/25"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="max-w-full truncate text-[9px] font-medium leading-tight">{item.railLabel}</span>
                </button>
              )
            })}
          </nav>

          <button
            type="button"
            aria-label="Settings"
            className="mt-1 flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <SettingsIcon className="size-3.5" />
          </button>
        </aside>

        {/* Single floating shell: secondary sidebar + main (ClickUp-style) */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl ring-1 ring-black/5">
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
            <aside className="flex min-h-0 w-64 shrink-0 flex-col overflow-hidden border-r border-border bg-muted/20">
              <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{activeNav.label}</p>
                  <p className="text-xs text-muted-foreground">Workspace navigation</p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className="size-8 shrink-0 rounded-lg border-border bg-background"
                  aria-label="Add"
                >
                  <PlusIcon className="size-4" />
                </Button>
              </div>

              <div className="min-h-0 flex-1 space-y-5 overflow-hidden px-3 py-4">
                {activeGroups.map((group) => (
                  <div key={group.group}>
                    <p className="mb-2 px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                      {group.group}
                    </p>
                    <ul className="space-y-0.5">
                      {group.items.map((item) => {
                        const isSelected = activePanelItem === item
                        return (
                          <li key={item}>
                            <button
                              type="button"
                              onClick={() => setActivePanelItem(item)}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                                isSelected
                                  ? "bg-primary/15 font-medium text-primary"
                                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                              )}
                            >
                              <CircleIcon className="size-2 shrink-0 fill-current opacity-70" />
                              <span className="truncate">{item}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
              {/* Breadcrumbs */}
              <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Engineering</span>
                <span className="text-border">/</span>
                <span>Dashboard</span>
                <LockIcon className="size-3 opacity-60" />
                <span className="text-border">/</span>
                <span>TODOs</span>
                <LockIcon className="size-3 opacity-60" />
              </div>

              {/* View tabs */}
              <div className="flex shrink-0 items-center gap-1 border-b border-border px-2">
                {viewTabs.map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveView(tab)}
                    className={cn(
                      "relative px-3 py-2.5 text-sm font-medium transition-colors",
                      activeView === tab
                        ? "text-foreground after:absolute after:right-3 after:bottom-0 after:left-3 after:h-0.5 after:rounded-full after:bg-primary"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tab}
                  </button>
                ))}
                <Button type="button" variant="ghost" size="sm" className="ml-1 text-muted-foreground">
                  + View
                </Button>
                <div className="ml-auto flex items-center gap-2 pr-2">
                  <Button type="button" variant="outline" size="sm" className="hidden sm:inline-flex">
                    Agents
                  </Button>
                  <Button type="button" variant="secondary" size="sm" className="gap-1.5">
                    <SparklesIcon className="size-3.5" />
                    Ask AI
                  </Button>
                  <Button type="button" size="sm">
                    Share
                  </Button>
                </div>
              </div>

              {/* Toolbar row */}
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
                <div className="flex flex-wrap items-center gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Filter">
                    <SearchIcon className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Status">
                    <LayoutDashboardIcon className="size-4" />
                  </Button>
                </div>
                <Button type="button" size="sm">
                  <PlusIcon className="size-4" />
                  Task
                </Button>
              </div>

              <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain">{children}</main>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
