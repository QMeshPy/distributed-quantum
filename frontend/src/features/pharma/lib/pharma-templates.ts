export type PharmaTemplate = {
  id: string;
  title: string;
  target_pdb_id: string;
  mode: "optimization" | "discovery";
  initial_ligand_smiles?: string;
  max_iterations: number;
  candidate_count: number;
  description: string;
  tags: string[];
  highlights: string[];
  target_name: string;
  indication: string;
};

export const DEFAULT_PHARMA_TEMPLATE_ID = "covid-main-protease";

export const PHARMA_TEMPLATES: PharmaTemplate[] = [
  {
    id: "covid-main-protease",
    title: "COVID-19 Main Protease",
    target_name: "SARS-CoV-2 3CLpro",
    indication: "Antiviral",
    target_pdb_id: "6LU7",
    mode: "optimization",
    initial_ligand_smiles:
      "CC(C)(C)OC(=O)N[C@@H](CC1CCCCC1)C(=O)N[C@@H](CC(=O)O)C(=O)NC2=CC=CC=C2",
    max_iterations: 5,
    candidate_count: 100,
    description:
      "Refine a peptidomimetic inhibitor scaffold against the SARS-CoV-2 main protease — a validated antiviral target with extensive literature.",
    tags: ["Optimization", "Antiviral", "Hot target"],
    highlights: [
      "PDB 6LU7 — high-resolution 2.16 Å crystal structure",
      "Peptidomimetic seed for fast QAOA convergence",
      "Benchmarked against Nirmatrelvir scaffold",
    ],
  },
  {
    id: "egfr-inhibitor",
    title: "EGFR Kinase Inhibitor",
    target_name: "EGFR (ErbB1)",
    indication: "Oncology",
    target_pdb_id: "1IEP",
    mode: "optimization",
    initial_ligand_smiles:
      "CCc1nn(C)c(C(=O)Nc2ccc(F)cc2F)c1-c1ccnc(Nc2ccc(OCc3ccccc3)cc2)n1",
    max_iterations: 8,
    candidate_count: 150,
    description:
      "Optimise an erlotinib-like scaffold in the EGFR ATP-binding pocket — a canonical benchmark for structure-based drug design tools.",
    tags: ["Optimization", "Oncology", "Kinase"],
    highlights: [
      "Classical drug-discovery benchmark target",
      "Erlotinib-inspired seed ligand",
      "Tracks known resistance mutations",
    ],
  },
  {
    id: "hsp90-discovery",
    title: "HSP90 Novel Discovery",
    target_name: "Heat Shock Protein 90α",
    indication: "Oncology",
    target_pdb_id: "2BSM",
    mode: "discovery",
    max_iterations: 10,
    candidate_count: 200,
    description:
      "Generate novel scaffolds targeting the HSP90 N-terminal ATP-binding domain — a broad-spectrum cancer chaperone inhibitor target.",
    tags: ["Discovery", "Oncology", "Novel scaffold"],
    highlights: [
      "Unrestricted scaffold generation via VQC",
      "Filters for Lipinski + ADMET compliance",
      "Computes HOMO-LUMO gap via VQE per fragment",
    ],
  },
  {
    id: "ache-alzheimer",
    title: "Acetylcholinesterase (AChE)",
    target_name: "Human AChE",
    indication: "Alzheimer's",
    target_pdb_id: "1EVE",
    mode: "optimization",
    initial_ligand_smiles: "CC(=O)Oc1ccc(cc1)C(=O)NCCN(C)C",
    max_iterations: 6,
    candidate_count: 120,
    description:
      "Refine donepezil-like dual-site binders targeting both the catalytic anionic site and peripheral anionic site of AChE.",
    tags: ["Optimization", "CNS", "Dual-site"],
    highlights: [
      "Dual CAS+PAS binding site handling",
      "Donepezil analogue as seed",
      "PDB 1EVE — 2.76 Å resolution",
    ],
  },
  {
    id: "tnf-alpha-discovery",
    title: "TNF-α Allosteric Discovery",
    target_name: "Tumor Necrosis Factor α",
    indication: "Auto-immune",
    target_pdb_id: "2AZ5",
    mode: "discovery",
    max_iterations: 12,
    candidate_count: 300,
    description:
      "Discover small-molecule allosteric disruptors of the TNF-α trimer interface — challenging for quantum-accelerated fragment growing.",
    tags: ["Discovery", "Auto-immune", "PPI"],
    highlights: [
      "Protein-protein interface disruptor strategy",
      "High candidate count for PPI target",
      "MOSES diversity metrics included",
    ],
  },
  {
    id: "jak2-hematology",
    title: "JAK2 Kinase",
    target_name: "Janus Kinase 2",
    indication: "Hematology",
    target_pdb_id: "2B7A",
    mode: "optimization",
    initial_ligand_smiles: "Cc1cn(-c2cc(NC(=O)c3ccc(F)c(Cl)c3)ccc2F)nn1",
    max_iterations: 7,
    candidate_count: 100,
    description:
      "Optimise ruxolitinib-like scaffolds in the JAK2 ATP pocket — relevant to myeloproliferative disorders and haematological cancers.",
    tags: ["Optimization", "Hematology", "Kinase"],
    highlights: [
      "Ruxolitinib-inspired seed SMILES",
      "PDB 2B7A — well-studied kinase pocket",
      "Selectivity scoring against JAK1/JAK3",
    ],
  },
];

export function getPharmaTemplateById(id: string): PharmaTemplate | undefined {
  return PHARMA_TEMPLATES.find((t) => t.id === id);
}
