import {
  Bot,
  Home,
  Globe,
  FlaskConical,
  HardDrive,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavToolConfig = {
  group: string;
  tool: string;
  href: string;
  newLabel: string;
  newHref: string;
  historyHref: string;
};

export type NavLinkConfig = {
  label: string;
  href: string;
};

export type NavGroupConfig = {
  heading: string;
  links: NavLinkConfig[];
};

export type SidebarConfig =
  | { type: "static"; groups: NavGroupConfig[] }
  | { type: "dynamic"; tools: NavToolConfig[] };

export type RailItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  hasSidebar: boolean;
  sidebar: SidebarConfig | null;
  matchPrefixes: string[];
};

export const NAV_CONFIG: RailItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: Home,
    href: "/dashboard",
    hasSidebar: false,
    sidebar: null,
    matchPrefixes: ["/dashboard"],
  },
  {
    id: "network",
    label: "Network",
    icon: Globe,
    href: "/network/mesh",
    hasSidebar: true,
    sidebar: {
      type: "static",
      groups: [
        {
          heading: "Infrastructure",
          links: [
            { label: "Topology", href: "/network/mesh" },
            { label: "Nodes", href: "/network/nodes" },
            { label: "Services", href: "/network/services" },
            { label: "Fidelity", href: "/network/fidelity" },
          ],
        },
        {
          heading: "Structure",
          links: [
            { label: "DAG View", href: "/network/dag" },
            { label: "Circuits", href: "/network/circuits" },
            { label: "Zones", href: "/network/zones" },
          ],
        },
      ],
    },
    matchPrefixes: ["/network"],
  },
  {
    id: "lab",
    label: "Lab",
    icon: FlaskConical,
    href: "/runs",
    hasSidebar: true,
    sidebar: {
      type: "dynamic",
      tools: [
        {
          group: "Quantum Runs",
          tool: "runs",
          href: "/runs",
          newLabel: "New Run",
          newHref: "/runs/new",
          historyHref: "/runs",
        },
        {
          group: "Options Pricing",
          tool: "options",
          href: "/options",
          newLabel: "New",
          newHref: "/options",
          historyHref: "/options/history",
        },
        {
          group: "Risk Engine",
          tool: "risk",
          href: "/risk",
          newLabel: "New Analysis",
          newHref: "/risk",
          historyHref: "/risk/history",
        },
        {
          group: "Financial",
          tool: "finance",
          href: "/finance",
          newLabel: "New Analysis",
          newHref: "/finance",
          historyHref: "/finance/history",
        },
        {
          group: "Pharma Docking",
          tool: "pharma",
          href: "/pharma/history",
          newLabel: "New Pipeline",
          newHref: "/pharma/submit",
          historyHref: "/pharma/history",
        },
      ],
    },
    matchPrefixes: ["/runs", "/options", "/risk", "/finance", "/pharma"],
  },
  {
    id: "vault",
    label: "Vault",
    icon: HardDrive,
    href: "/vault/circuits",
    hasSidebar: true,
    sidebar: {
      type: "static",
      groups: [
        {
          heading: "Discover",
          links: [
            { label: "Circuit Library", href: "/vault/circuits" },
            { label: "Shared Runs", href: "/vault/runs" },
          ],
        },
        {
          heading: "My Vault",
          links: [
            { label: "My Circuits", href: "/vault/my/circuits" },
            { label: "My Runs", href: "/vault/my/runs" },
          ],
        },
      ],
    },
    matchPrefixes: ["/vault"],
  },
  {
    id: "agents",
    label: "Agents",
    icon: Bot,
    href: "/agents",
    hasSidebar: true,
    sidebar: {
      type: "static",
      groups: [
        {
          heading: "Workspace",
          links: [
            { label: "Overview", href: "/agents" },
            { label: "Chat", href: "/agents/chat" },
          ],
        },
        {
          heading: "Platform",
          links: [
            { label: "Marketplace", href: "/agents/marketplace" },
            { label: "Proposals", href: "/agents/proposals" },
            { label: "Wallet", href: "/agents/wallet" },
          ],
        },
      ],
    },
    matchPrefixes: ["/agents"],
  },
  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    href: "/settings",
    hasSidebar: false,
    sidebar: null,
    matchPrefixes: ["/settings"],
  },
];
