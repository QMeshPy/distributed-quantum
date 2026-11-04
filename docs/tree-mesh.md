# Tree mesh: groups chained through each other

> **Status: does not work yet.** This layout was tested. The chained peer is never seen by the coordinator and cannot receive work. This page records the intended design, what the test showed, why, and what building it would take. Use the [star layout](remote-workers.md) for now.

## The intended layout

Workers are split into groups. In each group, only the first peer connects to the coordinator. The rest connect to the peer in front of them:

```
                    ┌──────────────┐
                    │ Coordinator  │
                    └──┬────┬────┬─┘
                       │    │    │
                      A1   A2   A3        ← connect directly to the coordinator
                       │    │    │
                      B1   B2   B3        ← connect only to the peer in front of them
                            │    │
                           C2   C3
```

So `B1` never dials the coordinator. It dials `A1`. The coordinator still wants to give `B1` work, and `B1` should show up in the dashboard.

## What was tested

Setup, all on one machine to keep the test controlled: the real backend (coordinator), a worker `A1` that also **listens** on its own port and dials the coordinator, and a worker `B1` that dials **only** `A1`.

| Question | Result |
|---|---|
| Does `A1` connect to the coordinator? | Yes. It showed up `healthy` in `/api/v1/discovery/peers`. |
| Does `B1` connect to `A1`? | Yes. `B1` printed `Coordinator CONNECTED` (it considers `A1` its upstream). |
| Does the coordinator learn about `B1`? | **No.** After 55 seconds, `B1` was absent from `/discovery/peers`, and its ID did not appear anywhere in the coordinator's log. |
| Can the coordinator send `B1` a block? | **No.** It has no connection to `B1`, and `B1` has no reachable address. (Not needed to test once `B1` is invisible.) |

The listening option used for `A1` is not in the committed worker script; a throwaway copy of the script with that option was used for this test.

## Why it fails

1. **Workers do not relay discovery.** Peers announce themselves with gossip messages. A worker only publishes its own announcements; it does not subscribe to the discovery topics (`consume_discovery=False` in the worker). A peer that is not subscribed does not forward other peers' messages. So `A1` never passes `B1`'s announcements on to the coordinator.
2. **The coordinator has no path to `B1` for work.** Work travels over a direct connection that the coordinator opens or reuses. `B1` is behind `A1`, with no listener and (on a real network) behind its own NAT, so the coordinator cannot dial it. The code has no relay: nothing forwards a request from the coordinator through `A1` to `B1`.

## What it would take

Two pieces, both new work (not a setting):

1. **Make the first-level peers relay discovery.** `A1` subscribes to the discovery topics so gossip passes through it, and optionally listens so `B1` can dial it. Expected to be small, but not tried. After it, the coordinator should see `B1` in the peer list, as a logical mesh.
2. **Give the coordinator a way to run work on `B1`.** Two options:
   - **Circuit relay.** py-libp2p ships a circuit relay v2 module (`libp2p/relay/circuit_v2`). `A1` acts as the relay, and the coordinator reaches `B1` at `/p2p/<A1>/p2p-circuit/p2p/<B1>`. This is the standard libp2p answer, but nothing in this backend uses it yet, so it needs wiring and testing.
   - **A forwarding peer.** `A1` accepts the work requests meant for `B1` and passes them down its own connection. It is simpler to reason about, but it is custom code in the worker.

The effort for either option has not been estimated, and neither has been tried.

## What to use today

- Run the [star layout](remote-workers.md): everyone dials the coordinator. It is the tested path, and every peer receives its own blocks.
- To make groups visible, put the group in the label: `g1-alice-1`, `g1-bob-1`, `g2-carol-1`. That is **cosmetic only**; the physical layout is still a star, but the peer lists and logs show who is in which group.

## Building the chained layout

The suggested order is piece 1 first, since it is the quick one and gets chained peers onto the dashboard. Then try circuit relay for piece 2 and test the full chain (coordinator → `A1` → `B1`) before updating this page.
