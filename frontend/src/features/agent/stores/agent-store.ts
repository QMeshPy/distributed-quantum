import { create } from "zustand";
import type { ApprovalData } from "../types";

type ExecutionView = "results" | "technical" | "logs";

interface AgentState {
  // UI State
  activeSessionId: string | null;
  executionView: ExecutionView;
  technicalDetailsExpanded: boolean;

  // Session Management
  setActiveSession: (id: string | null) => void;
  setExecutionView: (view: ExecutionView) => void;
  toggleTechnicalDetails: () => void;

  // Input State
  inputMessage: string;
  setInputMessage: (msg: string) => void;
  clearInputMessage: () => void;

  // Approval State
  pendingApproval: {
    sessionId: string;
    data: ApprovalData;
  } | null;
  setPendingApproval: (approval: { sessionId: string; data: ApprovalData } | null) => void;
  clearPendingApproval: () => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  // Initial State
  activeSessionId: null,
  executionView: "results",
  technicalDetailsExpanded: false,
  inputMessage: "",
  pendingApproval: null,

  // Actions
  setActiveSession: (id) => set({ activeSessionId: id }),
  setExecutionView: (view) => set({ executionView: view }),
  toggleTechnicalDetails: () =>
    set((state) => ({ technicalDetailsExpanded: !state.technicalDetailsExpanded })),
  setInputMessage: (msg) => set({ inputMessage: msg }),
  clearInputMessage: () => set({ inputMessage: "" }),
  setPendingApproval: (approval) => set({ pendingApproval: approval }),
  clearPendingApproval: () => set({ pendingApproval: null }),
}));
