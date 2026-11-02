import { expect, test } from "bun:test";
import { parseLlmProvidersPayload } from "../src/features/agentkit/llm-provider/parse-providers";

const providers = [
  { id: "groq", label: "Groq", configured: true },
  { id: "near", label: "NEAR AI Cloud", configured: true },
];

test("a 502 JSON body does not become the provider list", () => {
  expect(parseLlmProvidersPayload(502, { error: "Backend unreachable" })).toBeNull();
});

test("a 200 body without providers is rejected", () => {
  expect(parseLlmProvidersPayload(200, { default: "groq" })).toBeNull();
});

test("a valid list is kept", () => {
  expect(parseLlmProvidersPayload(200, { default: "near", providers })).toEqual({
    providers,
    defaultProvider: "near",
  });
});
