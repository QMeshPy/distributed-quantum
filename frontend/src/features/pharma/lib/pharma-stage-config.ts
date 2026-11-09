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
  stage:   { icon: ChevronRight, color: "text-sky-300",     bg: "bg-sky-400/8",     label: "STAGE" },
  iter:    { icon: RefreshCcw,   color: "text-violet-300",  bg: "bg-violet-400/8",  label: "ITER"  },
  vqe:     { icon: Atom,         color: "text-amber-300",   bg: "bg-amber-400/8",   label: "VQE"   },
  score:   { icon: Star,         color: "text-emerald-300", bg: "bg-emerald-400/8", label: "SCORE" },
  admet:   { icon: Filter,       color: "text-teal-300",    bg: "bg-teal-400/8",    label: "ADMET" },
  refine:  { icon: Dna,          color: "text-fuchsia-300", bg: "bg-fuchsia-400/8", label: "HOP"   },
  success: { icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-400/8", label: "DONE"  },
  error:   { icon: XCircle,      color: "text-red-400",     bg: "bg-red-400/8",     label: "ERR"   },
  info:    { icon: Info,         color: "text-white/40",    bg: "bg-white/5",       label: "INFO"  },
};

export const STAGE_ICONS: Record<string, { icon: typeof Atom; label: string; color: string }> = {
  init:          { icon: FlaskConical, label: "Init",      color: "text-white/40"    },
  filtering:     { icon: Filter,       label: "Lipinski",  color: "text-sky-300"     },
  generating:    { icon: Dna,          label: "QWGAN",     color: "text-violet-300"  },
  fragmenting:   { icon: Anchor,       label: "Fragments", color: "text-amber-300"   },
  vqe_computing: { icon: Atom,         label: "VQE",       color: "text-amber-300"   },
  docking:       { icon: Zap,          label: "QAOA",      color: "text-rose-300"    },
  scoring:       { icon: Star,         label: "VQC+ADMET", color: "text-emerald-300" },
  refining:      { icon: RefreshCcw,   label: "Scaffold",  color: "text-fuchsia-300" },
  iteration:     { icon: Activity,     label: "Iteration", color: "text-violet-300"  },
  completed:     { icon: CheckCircle2, label: "Done",      color: "text-emerald-400" },
  failed:        { icon: XCircle,      label: "Failed",    color: "text-red-400"     },
};

export const STAGE_ORDER = [
  "init", "filtering", "generating", "fragmenting",
  "vqe_computing", "docking", "scoring", "refining", "completed",
];
