import "server-only";
import { cache } from "react";
import { BACKEND } from "@/constants";
import {
  transformTopology,
  transformPeerSummary,
  transformService,
} from "../lib/network-transformers";
import type {
  BackendTopologyResponse,
  BackendPeerListResponse,
  BackendServiceResponse,
} from "../types";

export const getNetworkTopology = cache(async () => {
  try {
    const res = await fetch(BACKEND.DISCOVERY.TOPOLOGY, {
      next: { revalidate: 20 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as BackendTopologyResponse;
    return transformTopology(data);
  } catch {
    return null;
  }
});

export const getNetworkPeers = cache(async () => {
  try {
    const res = await fetch(BACKEND.DISCOVERY.PEERS, {
      next: { revalidate: 20 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as BackendPeerListResponse;
    return data.peers.map(transformPeerSummary);
  } catch {
    return null;
  }
});

export const getNetworkServices = cache(async () => {
  try {
    const res = await fetch(BACKEND.SERVICES.LIST, {
      next: { revalidate: 20 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as BackendServiceResponse[];
    return data.map(transformService);
  } catch {
    return null;
  }
});
