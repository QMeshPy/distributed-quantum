export type WalletBalance = {
  address: string;
  usdc: string;
  eth: string;
  network: string;
};

export type ProposalFragment = {
  fragment_id: string;
  title: string;
  budget: number;
  status: "available" | "claimed" | "completed";
  claimed_by: string | null;
};

export type Proposal = {
  proposal_id: string;
  title: string;
  description: string;
  researcher_id: string;
  budget_required: string;
  budget_raised: string;
  funding_threshold: string;
  status: "active" | "funded" | "completed" | "expired";
  fragments: ProposalFragment[];
  deadline: string;
  tags: string[];
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
