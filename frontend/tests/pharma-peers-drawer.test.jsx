import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PharmaPeersPanel } from "../src/features/pharma/components/pharma-peers-drawer";

const task = (n, fragment, state, extra = {}) => ({
  task: n,
  fragment,
  start: 1,
  state,
  peer: null,
  peer_id: null,
  started_at: null,
  seconds: null,
  error: null,
  ...extra,
});

const job = (extra = {}) => ({ job_id: "pharma_x", status: "running", log_lines: [], ...extra });

const render = (props) => renderToStaticMarkup(<PharmaPeersPanel isRunning {...props} />);

describe("pharma peers panel", () => {
  test("groups tasks by fragment and shows each peer's label, short ID, state and timing", () => {
    const html = render({
      job: job(),
      liveData: {
        server_time: 130,
        peer_tasks: [
          task(1, "CC=O", "running", {
            peer: "alice-1",
            peer_id: "12D3KooWAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAZZZZZZ",
            started_at: 100,
          }),
          task(2, "CC=O", "done", { peer: "bob-1", peer_id: "12D3KooWBBBB", seconds: 41.2 }),
          task(3, "O=CO", "queued"),
          task(4, "O=CO", "superseded"),
        ],
      },
    });
    expect(html).toContain("Fragment CC=O");
    expect(html).toContain("Fragment O=CO");
    expect(html).toContain("alice-1");
    expect(html).toContain("12D3KooW…ZZZZZZ"); // long IDs are shortened
    expect(html).toContain("30s"); // running: server_time 130 - started_at 100
    expect(html).toContain("41.2s");
    expect(html).toContain("Running");
    expect(html).toContain("Waiting for a peer");
    expect(html).toContain("Not needed");
  });

  test("shows a failed peer's reason", () => {
    const html = render({
      job: job(),
      liveData: {
        server_time: 1,
        peer_tasks: [task(1, "CC=O", "failed", { peer: "carol-1", error: "ConnectionError: reset" })],
      },
    });
    expect(html).toContain("Failed");
    expect(html).toContain("ConnectionError: reset");
  });

  test("a finished job falls back to the final fragment-to-peer mapping", () => {
    const html = render({
      isRunning: false,
      job: job({
        status: "completed",
        result: { fragments_distributed: { frag_000: "alice-1, bob-1" } },
      }),
      liveData: null,
    });
    expect(html).toContain("Computed by");
    expect(html).toContain("frag_000");
    expect(html).toContain("alice-1, bob-1");
  });

  test("shows peer events from the hidden VQE log lines", () => {
    const html = render({
      job: job({
        log_lines: [
          { ts: "t", level: "vqe", message: "peer dave-1 dropped (ConnectionError); task 4 rerouted" },
          { ts: "t", level: "stage", message: "not a peer event" },
        ],
      }),
      liveData: null,
    });
    expect(html).toContain("dave-1 dropped");
    expect(html).not.toContain("not a peer event");
  });

  test("explains the empty state before the stage starts", () => {
    expect(render({ job: job(), liveData: null })).toContain("appear here when the drug-discovery stage");
    expect(render({ job: job(), liveData: null, isRunning: false })).toContain("No peer data was recorded");
  });

  test("links to the mesh page", () => {
    expect(render({ job: job(), liveData: null })).toContain('href="/network/mesh"');
  });
});
