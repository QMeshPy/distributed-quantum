import { expect, test } from "bun:test";
import {
  access,
  enginePath,
  forwardFrame,
} from "../src/shared/spreadsheets/access";
const workbook = {
  ownerId: "owner",
  members: [
    { userId: "editor", role: "editor" },
    { userId: "viewer", role: "viewer" },
  ],
  sheets: [
    { room: "ec_abc", source: false },
    { room: "ec_source", source: true },
  ],
};
test("members have bounded roles and source sheets are immutable", () => {
  expect(access(workbook, "stranger", "ec_abc")).toBeNull();
  expect(access(workbook, "editor", "ec_abc")?.write).toBe(true);
  expect(access(workbook, "viewer", "ec_abc")?.write).toBe(false);
  expect(access(workbook, "owner", "ec_source")?.write).toBe(false);
  expect(access(workbook, "owner", "other")).toBeNull();
});
test("proxy denies alternate routes and confines rooms", () => {
  expect(enginePath("/sheets-engine/ec_abc")).toEqual({
    room: "ec_abc",
    kind: "ui",
  });
  expect(enginePath("/sheets-engine/_ws/ec_abc")?.kind).toBe("ws");
  for (const path of [
    "/sheets-engine/_rooms",
    "/sheets-engine/_/ec_abc",
    "/sheets-engine/ec_abc/edit",
    "/sheets-engine/%2e%2e/ec_abc",
    "/sheets-engine/ec_abc.csv",
  ])
    expect(enginePath(path)).toBeNull();
});
test("websocket commands cannot escape room or viewer permission", () => {
  const msg = {
    type: "execute",
    room: "ec_abc",
    cmdstr: "set A1 text t hello",
  };
  expect(() =>
    forwardFrame(JSON.stringify(msg), "ec_abc", "u", false, "secret"),
  ).toThrow();
  expect(() =>
    forwardFrame(
      JSON.stringify({ ...msg, room: "ec_other" }),
      "ec_abc",
      "u",
      true,
      "secret",
    ),
  ).toThrow();
  expect(
    JSON.parse(
      forwardFrame(JSON.stringify(msg), "ec_abc", "u", true, "secret"),
    ),
  ).toEqual({ ...msg, user: "u", auth: "secret" });
  expect(() =>
    forwardFrame('{"type":"unknown"}', "ec_abc", "u", true, "secret"),
  ).toThrow();
});

test("upstream broadcasts never expose engine credentials", async () => {
  const { outboundFrame } = await import("../src/shared/spreadsheets/access");
  expect(
    JSON.parse(
      outboundFrame(
        '{"type":"execute","auth":"secret","cmdstr":"set A1 text t hi"}',
      ),
    ),
  ).toEqual({ type: "execute", cmdstr: "set A1 text t hi" });
});
test("cross-sheet recalculation only reads authorized workbook sheets", () => {
  const frame = JSON.stringify({ type: "ask.recalc", room: "ec_source" });
  expect(
    JSON.parse(
      forwardFrame(frame, "ec_abc", "u", false, "secret", [
        "ec_abc",
        "ec_source",
      ]),
    ).room,
  ).toBe("ec_source");
  expect(() =>
    forwardFrame(frame, "ec_abc", "u", false, "secret", ["ec_abc"]),
  ).toThrow();
});
