import type { Metadata } from "next";

import { LandingPage } from "@/features/landing";

export const metadata: Metadata = {
  title: "DQS — Distributed Quantum Services",
  description:
    "Explore DQS, an open-source research platform for discovering, planning, and executing composable quantum circuit services over a local libp2p fabric.",
  openGraph: {
    title: "DQS — Distributed Quantum Services",
    description:
      "A research-grade orchestration layer for composable quantum circuit services.",
    type: "website",
  },
};

export default function HomePage() {
  return <LandingPage />;
}
