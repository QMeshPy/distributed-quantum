import {
  Home,
  Globe,
  FlaskConical,
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
      ],
    },
    matchPrefixes: ["/runs", "/options", "/risk", "/finance"],
  },

  {
    id: "settings",
    label: "Settings",
    icon: Settings,
    href: "/settings",
    hasSidebar: true,
    sidebar: {
      type: "static",
      groups: [
        {
          heading: "Workspace",
          links: [
            { label: "General", href: "/settings" },
            { label: "Integrations", href: "/settings/integrations" },
            { label: "Users", href: "/settings/users" },
          ],
        },
        {
          heading: "System",
          links: [
            { label: "Security", href: "/settings/security" },
            { label: "Observability", href: "/settings/observability" },
            { label: "Audit Logs", href: "/settings/audit" },
          ],
        },
      ],
    },
    matchPrefixes: ["/settings"],
  },
];
