export type Role = "viewer" | "editor";
export type AccessWorkbook = {
  ownerId: string;
  members: { userId: string; role: string }[];
  sheets: { room: string; source: boolean }[];
};
export function access(book: AccessWorkbook, userId: string, room: string) {
  const sheet = book.sheets.find((s) => s.room === room);
  const role =
    book.ownerId === userId
      ? "owner"
      : book.members.find((m) => m.userId === userId)?.role;
  return sheet && role
    ? { role, write: !sheet.source && role !== "viewer" }
    : null;
}
export function enginePath(
  path: string,
): { room: string; kind: "ui" | "ws" } | null {
  const match = /^\/sheets-engine\/(?:(_ws)\/)?(ec_[a-z0-9]+)$/.exec(path);
  return match ? { room: match[2], kind: match[1] ? "ws" : "ui" } : null;
}
export function forwardFrame(
  raw: string,
  room: string,
  user: string,
  write: boolean,
  auth: string,
  readableRooms: string[] = [room],
): string {
  if (raw.length > 65536) throw new Error("Frame too large");
  const frame = JSON.parse(raw);
  if (
    !frame ||
    typeof frame !== "object" ||
    (frame.room !== room &&
      !(frame.type === "ask.recalc" && readableRooms.includes(frame.room)))
  )
    throw new Error("Invalid room");
  const reads = [
    "ask.recalc",
    "ask.log",
    "ask.ecells",
    "ask.ecell",
    "my.ecell",
    "ecell",
  ];
  if (frame.type === "execute") {
    if (!write || typeof frame.cmdstr !== "string")
      throw new Error("Read only");
  } else if (!reads.includes(frame.type)) throw new Error("Unsupported frame");
  return JSON.stringify({
    ...frame,
    user,
    auth: write && frame.type !== "ask.recalc" ? auth : "0",
  });
}

export function outboundFrame(raw: string): string {
  const frame = JSON.parse(raw);
  delete frame.auth;
  return JSON.stringify(frame);
}
