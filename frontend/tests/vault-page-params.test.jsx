import { expect, mock, test } from "bun:test";
import { renderToReadableStream } from "react-dom/server";

mock.module("next/dynamic", () => ({
  default: () => function Detail({ cid }) { return <output>{cid}</output>; },
}));

for (const route of ["cid", "circuits", "runs"]) {
  test(`vault ${route} page resolves promised route parameters`, async () => {
    const { default: Page } = await import(`../src/app/(main)/vault/${route}/[cid]/page`);
    const stream = await renderToReadableStream(<Page params={Promise.resolve({ cid: "bafy-test" })} />);
    expect(await new Response(stream).text()).toContain("<output>bafy-test</output>");
  });
}
