import { expect, test } from "bun:test";
import { readApiError } from "../src/shared/lib/api-error";

test("validation details are readable without echoing submitted input", async () => {
  const response = Response.json({
    detail: [
      { msg: "price must be positive", input: "private", ctx: {} },
      { msg: "quantity is required" },
    ],
  });
  expect(await readApiError(response, "Failed")).toBe(
    "price must be positive; quantity is required",
  );
});

test("text errors and non-JSON failures have a safe display message", async () => {
  expect(
    await readApiError(Response.json({ detail: "feed is stale" }), "Failed"),
  ).toBe("feed is stale");
  expect(await readApiError(new Response("<html>error</html>"), "Failed")).toBe(
    "Failed",
  );
  expect(
    await readApiError(
      Response.json({ detail: { secret: "private" } }),
      "Failed",
    ),
  ).toBe("Failed");
});

test("platform errors show their message without serializing private details", async () => {
  expect(await readApiError(Response.json({
    error: "validation_error",
    message: "The portfolio cannot be priced.",
    details: [{ message: "private input", input: "private", ctx: { secret: "private" } }],
  }), "Failed")).toBe("The portfolio cannot be priced.");
  expect(await readApiError(Response.json({ error: "Backend unreachable" }), "Failed"))
    .toBe("Backend unreachable");
  expect(await readApiError(Response.json({ message: {}, error: {}, details: ["private"] }), "Failed"))
    .toBe("Failed");
  expect(await readApiError(Response.json({ message: "", detail: "", error: "" }), "Failed"))
    .toBe("Failed");
});
