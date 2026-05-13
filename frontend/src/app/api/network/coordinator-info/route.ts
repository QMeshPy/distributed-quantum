import { BACKEND } from "@/constants";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch(BACKEND.BOOTSTRAP.RUNTIME, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch coordinator runtime" },
        { status: 502 }
      );
    }
    const data = await res.json();

    // advertised_multiaddrs is a list; pick the first non-loopback one, fall
    // back to the first available, fall back to null.
    const addrs: string[] = data.advertised_multiaddrs ?? [];
    const publicAddr =
      addrs.find(
        (a) => !a.includes("127.0.0.1") && !a.includes("/ip4/0.0.0.0")
      ) ??
      addrs[0] ??
      null;

    const peerId: string | null = data.host_peer_id ?? null;
    let multiaddr: string | null = null;
    if (publicAddr && peerId) {
      multiaddr = publicAddr.replace(/\/p2p\/[^/]+$/, "") + `/p2p/${peerId}`;
    } else if (publicAddr) {
      multiaddr = publicAddr;
    }

    return NextResponse.json({ peerId, multiaddr, listenPort: 4011 });
  } catch {
    return NextResponse.json(
      { error: "Coordinator unreachable" },
      { status: 502 }
    );
  }
}
