import { expect, mock, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Only the test's Next navigation and session boundary are substituted.
// Production FilecoinVault still obtains its user from useAuth, and the proxy enforces it.
mock.module("next/link", () => ({
  default: ({ href, children, ...props }) =>
    createElement("a", { href, ...props }, children),
}));
mock.module("../src/features/auth/hooks/use-auth", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
const { FilecoinVault } = await import(
  "../src/features/filecoin/filecoin-vault.tsx"
);
const { ReceiptPanel } = await import(
  "../src/features/filecoin/receipt-panel.tsx"
);

test("signed-out vault keeps storage mutations disabled and offers sign in", () => {
  const html = renderToStaticMarkup(createElement(FilecoinVault));
  expect(html).toContain('href="/signin"');
  const publish = [
    ...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g),
  ].find((button) => button[2].endsWith("Publish file"));
  expect(publish?.[1]).toContain('disabled=""');
  expect(html).toContain("Calibration");
});

test("a receipt alone is not rendered as a verified possession or NEAR proof", () => {
  const html = renderToStaticMarkup(
    createElement(ReceiptPanel, {
      receipt: {
        network: "calibration",
        chain_id: 314159,
        piece_cid: "bafkzcibfixture",
        sha256: "a".repeat(64),
        size_bytes: 256,
        complete: true,
        copies: [],
        transaction_hashes: [],
      },
    }),
  );
  expect(html).toContain("Not checked");
  expect(html).not.toContain("Proven this period");
  expect(html).not.toContain("Recorded anchors verified");
});
