const REPOSITORY = "https://github.com/QMeshPy/distributed-quantum";

export const EXTERNAL_LINKS = {
  REPOSITORY,
  RESEARCH_PAPER:
    "https://github.com/QMeshPy/documentations/blob/main/research/RESEARCH_PAPER_DRAFT.md",
  DEMO_VIDEO: "https://youtu.be/Q6Khh3bJnqU",
  DOCS: {
    OVERVIEW: `${REPOSITORY}#what-this-is`,
    X402: `${REPOSITORY}#algorand-x402-machine-payable-quantum-services`,
    PROVENANCE:
      "https://github.com/QMeshPy/documentations/blob/main/repository/backend/PROVENANCE.md",
    CHAIN_REGISTRY:
      "https://github.com/QMeshPy/documentations/blob/main/repository/backend/CHAIN_REGISTRY.md",
    BACKEND: `${REPOSITORY}/blob/main/backend/README.md`,
    TOKENIZED_STOCKS_PR: `${REPOSITORY}/pull/108`,
  },
} as const;
