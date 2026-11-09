"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import Link from "next/link";
import { QUERY_KEYS } from "@/constants/query-keys";
import { API } from "@/constants/api";

interface NodeAppearanceDetectorProps {
  /** Peer IDs to skip (already known before the detector mounted) */
  knownPeerIds?: string[];
}

type DetectorState = "waiting" | "found" | "timeout";

const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 10 * 60 * 1_000; // 10 minutes

export function NodeAppearanceDetector({ knownPeerIds }: NodeAppearanceDetectorProps) {
  const queryClient = useQueryClient();
  const initialPeerIds = useRef<Set<string> | null>(null);
  const [state, setState] = useState<DetectorState>("waiting");
  const [foundPeerId, setFoundPeerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      if (intervalId !== null) clearInterval(intervalId);
      setState((prev) => (prev === "waiting" ? "timeout" : prev));
    }, TIMEOUT_MS);

    async function fetchPeerIds(): Promise<Set<string>> {
      const res = await fetch(API.NETWORK.PEERS);
      if (!res.ok) throw new Error("Failed to fetch peers");
      const data = (await res.json()) as { peers: Array<{ peer_id: string }> };
      return new Set(data.peers.map((p) => p.peer_id));
    }

    async function init() {
      try {
        if (knownPeerIds && knownPeerIds.length > 0) {
          initialPeerIds.current = new Set(knownPeerIds);
        } else {
          initialPeerIds.current = await fetchPeerIds();
        }
      } catch {
        initialPeerIds.current = new Set();
      }

      if (cancelled) return;

      intervalId = setInterval(async () => {
        if (cancelled || initialPeerIds.current === null) return;
        try {
          const current = await fetchPeerIds();
          for (const id of current) {
            if (!initialPeerIds.current.has(id)) {
              if (intervalId !== null) clearInterval(intervalId);
              clearTimeout(timeoutId);
              if (!cancelled) {
                setFoundPeerId(id);
                setState("found");
                // Auto-register the detected node in user's account
                fetch(API.NETWORK.NODES_MINE, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ peerId: id, host: "127.0.0.1", port: 4020 }),
                }).catch(() => {});
                queryClient.invalidateQueries({ queryKey: QUERY_KEYS.network.myNodes() });
                queryClient.invalidateQueries({ queryKey: QUERY_KEYS.network.nodes() });
              }
              return;
            }
          }
        } catch {
          // silent — keep polling
        }
      }, POLL_INTERVAL_MS);
    }

    void init();

    return () => {
      cancelled = true;
      if (intervalId !== null) clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [knownPeerIds, queryClient]);

  if (state === "found") {
    return (
      <div className="rounded-xl p-4 ring-1 ring-emerald-500/30 bg-emerald-500/10">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium text-emerald-300">Node detected!</p>
            <p className="break-all font-mono text-xs text-emerald-200/70">
              Peer ID: {foundPeerId}
            </p>
            <Link
              href="/network/nodes"
              className="mt-1 text-xs text-emerald-400 underline-offset-2 hover:underline"
            >
              View in nodes table
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (state === "timeout") {
    return (
      <div className="rounded-xl p-4 ring-1 ring-yellow-500/30 bg-yellow-500/10">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-400" />
          <p className="text-sm text-yellow-200/80">
            Node not detected after 10 minutes. You can register it manually below.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-4 ring-1 ring-white/10 bg-white/[0.03]">
      <div className="flex items-center gap-3">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-white/40" />
        <p className="text-sm text-white/50">
          Waiting for your node to appear on the network…
        </p>
      </div>
    </div>
  );
}
