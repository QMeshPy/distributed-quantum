import { expect, mock, test } from "bun:test";
import { useContext } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { QUERY_KEYS_AGENTKIT } from "../src/constants/query-keys";
import { AddressOrEnsInput } from "../src/features/agentkit/components/address-or-ens-input";
import {
  AgentLlmProviderContext,
  AgentLlmProviderProvider,
} from "../src/features/agentkit/llm-provider/agent-llm-provider-context";

let searchParams = new URLSearchParams();
mock.module("next/navigation", () => ({
  useRouter: () => ({ push() {} }),
  useSearchParams: () => searchParams,
  usePathname: () => "/agents/chat",
}));

const sessions = [
  { id: "b-chat", agentId: "b", messages: [{ role: "user", content: "Other agent conversation" }] },
  { id: "a-chat", agentId: "a", messages: [{ role: "user", content: "Current agent conversation" }] },
];
mock.module("../src/features/agentkit/hooks/use-chat-sessions", () => ({
  useChatSessions: () => ({ sessions, sessionsReady: true }),
}));
const { default: AgentsChatPage } = await import("../src/app/(main)/agents/chat/page");

function renderWithQueries(element, client = new QueryClient()) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AgentLlmProviderProvider>{element}</AgentLlmProviderProvider>
    </QueryClientProvider>,
  );
}

test("address validation is visible on the first render", () => {
  const html = renderWithQueries(<AddressOrEnsInput value="invalid-address" onChange={() => {}} />);
  expect(html).toContain("Enter a 0x address or an ENS name");
  expect(html).not.toContain("Resolves to");
});

test("a cached ENS address shows its preview without a validation error", () => {
  const client = new QueryClient();
  client.setQueryData(QUERY_KEYS_AGENTKIT.ensResolve("alice.eth", false), {
    address: "0x1111111111111111111111111111111111111111",
  });
  const html = renderWithQueries(<AddressOrEnsInput value="alice.eth" onChange={() => {}} />, client);
  expect(html).toContain("Resolves to");
  expect(html).toContain("0x1111…1111");
  expect(html).not.toContain("Enter a 0x address");
});

test("provider rendering is safe before browser storage is available", () => {
  function Selection() {
    const { provider, loading } = useContext(AgentLlmProviderContext);
    return <output>{provider}:{String(loading)}</output>;
  }
  expect(renderWithQueries(<Selection />)).toContain("groq:true");
});

test("chat initially selects only the requested agent's latest conversation", () => {
  searchParams = new URLSearchParams("agentId=a");
  const client = new QueryClient();
  client.setQueryData(QUERY_KEYS_AGENTKIT.agents(), [{ agent_id: "a", agent_name: "Agent A" }]);
  const html = renderWithQueries(<AgentsChatPage />, client);
  expect(html).toContain("Current agent conversation");
  expect(html).not.toContain("Other agent conversation");
});

test("a new chat stays blank even when the agent has older conversations", () => {
  searchParams = new URLSearchParams("agentId=a&new=1");
  const client = new QueryClient();
  client.setQueryData(QUERY_KEYS_AGENTKIT.agents(), [{ agent_id: "a", agent_name: "Agent A" }]);
  const html = renderWithQueries(<AgentsChatPage />, client);
  expect(html).toContain("What would you like to do?");
  expect(html).not.toContain("Current agent conversation");
  expect(html).not.toContain("Other agent conversation");
});
