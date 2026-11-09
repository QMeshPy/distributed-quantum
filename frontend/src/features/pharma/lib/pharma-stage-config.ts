import {
  Activity,
  Anchor,
  Atom,
  CheckCircle2,
  ChevronRight,
  Dna,
  Filter,
  FlaskConical,
  Info,
  RefreshCcw,
  Star,
  XCircle,
  Zap,
} from "lucide-react";
import type { PipelineLogLevel } from "../types";

export type LogMeta = {
  icon: typeof Atom;
  color: string;
  bg: string;
  label: string;
};

export const LOG_META: Record<PipelineLogLevel, LogMeta> = {
  stage:   { icon: ChevronRight, color: "text-info",     bg: "bg-info/8",     label: "STAGE" },
  iter:    { icon: RefreshCcw,   color: "text-accent",  bg: "bg-accent/8",  label: "ITER"  },
  vqe:     { icon: Atom,         color: "text-warning",   bg: "bg-warning/8",   label: "VQE"   },
  score:   { icon: Star,         color: "text-success", bg: "bg-success/8", label: "SCORE" },
  admet:   { icon: Filter,       color: "text-success",    bg: "bg-success/8",    label: "ADMET" },
  refine:  { icon: Dna,          color: "text-accent", bg: "bg-accent/8", label: "HOP"   },
  success: { icon: CheckCircle2, color: "text-success", bg: "bg-success/8", label: "DONE"  },
  error:   { icon: XCircle,      color: "text-danger",     bg: "bg-danger/8",     label: "ERR"   },
  info:    { icon: Info,         color: "text-subtle",    bg: "bg-surface-muted",       label: "INFO"  },
};

export const STAGE_ICONS: Record<string, { icon: typeof Atom; label: string; color: string }> = {
  init:          { icon: FlaskConical, label: "Init",      color: "text-subtle"    },
  filtering:     { icon: Filter,       label: "Lipinski",  color: "text-info"     },
  generating:    { icon: Dna,          label: "QWGAN",     color: "text-accent"  },
  fragmenting:   { icon: Anchor,       label: "Fragments", color: "text-warning"   },
  vqe_computing: { icon: Atom,         label: "VQE",       color: "text-warning"   },
  docking:       { icon: Zap,          label: "QAOA",      color: "text-danger"    },
  scoring:       { icon: Star,         label: "VQC+ADMET", color: "text-success" },
  refining:      { icon: RefreshCcw,   label: "Scaffold",  color: "text-accent" },
  iteration:     { icon: Activity,     label: "Iteration", color: "text-accent"  },
  completed:     { icon: CheckCircle2, label: "Done",      color: "text-success" },
  failed:        { icon: XCircle,      label: "Failed",    color: "text-danger"     },
};

export const STAGE_ORDER = [
  "init", "filtering", "generating", "fragmenting",
  "vqe_computing", "docking", "scoring", "refining", "completed",
];
