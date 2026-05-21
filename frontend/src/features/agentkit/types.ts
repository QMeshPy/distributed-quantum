export type WalletBalance = {
  address: string;
  usdc: string;
  eth: string;
  network: string;
};

export type ProposalFragment = {
  fragment_id: string;
  title: string;
  description?: string;
  /** Legacy numeric field; backend now sends budget_allocated as a string */
  budget?: number;
  budget_allocated?: string;
  status: "available" | "unclaimed" | "claimed" | "completed";
  claimed_by: string | null;
};

export type Proposal = {
  proposal_id: string;
  title: string;
  description: string;
  researcher_id: string;
  budget_required: string;
  budget_raised: string;
  funding_threshold?: string;
  funding_percentage?: string;
  status: "draft" | "active" | "funded" | "in_progress" | "completed" | "expired" | "cancelled";
  fragments: ProposalFragment[];
  deadline: string;
  tags: string[];
  created_at?: string;
};

export type MarketplaceAgent = {
  agent_id: string;
  agent_name: string;
  description: string;
  capabilities: string[];
  pricing_per_task: string;
  reputation_score: number;
  total_tasks: number;
  status: "active" | "busy" | "offline" | "available";
  specialty?: string;
  rating?: number;
  price_per_task?: number;
};

export type Notification = {
  notification_id: string;
  type:
    | "proposal_funded"
    | "fragment_claimed"
    | "payment_received"
    | "new_proposal";
  title: string;
  message: string;
  read: boolean;
  created_at: string;
};

export type CreateProposalForm = {
  title: string;
  description: string;
  methodology: string;
  budget_required: string;
  tags: string[];
  auto_fragment: boolean;
  deadline_days: number;
};

export type TransferForm = {
  to_address: string;
  amount: string;
};
