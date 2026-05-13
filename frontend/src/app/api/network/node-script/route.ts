import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const SCRIPT_PATH = path.resolve(
  process.cwd(),
  "..",
  "scripts",
  "node-starter-template.py"
);

export async function GET(request: NextRequest) {
  let content: string;
  try {
    content = await fs.readFile(SCRIPT_PATH, "utf-8");
  } catch {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") === "1";

  if (view) {
    return new NextResponse(content, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  return new NextResponse(content, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="node-starter-template.py"',
    },
  });
}
