import type { Metadata } from "next";

import { LandingPage } from "@/features/landing";

export const metadata: Metadata = {
  title: "QMesh · Quantum, run as a network",
  description:
    "QMesh turns quantum computation into network services that peers discover, pay for per request, and verify.",
  openGraph: {
    title: "QMesh · Quantum, run as a network",
    description:
      "Quantum computation as discoverable, payable and verifiable network services.",
    type: "website",
  },
};

export default function HomePage() {
  return <LandingPage />;
}
