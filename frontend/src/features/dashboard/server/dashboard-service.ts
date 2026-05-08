import "server-only";
import { cache } from "react";
import { BACKEND } from "@/constants";

export const getDashboardStats = cache(async () => {
  try {
    const res = await fetch(`${BACKEND.BASE_URL}/api/v1/network/stats`, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return res.json() as Promise<unknown>;
  } catch {
    return null;
  }
});

export const getNetworkHealth = cache(async () => {
  try {
    const res = await fetch(BACKEND.HEALTH, {
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    return res.json() as Promise<unknown>;
  } catch {
    return null;
  }
});
