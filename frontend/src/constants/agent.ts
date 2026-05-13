export const AGENT_API = {
  BASE: "/api/v1/agent",
  SESSIONS: "/api/v1/agent/sessions",
} as const;

export const getStreamWS = (sessionId: string): string => {
  if (typeof window === "undefined") {
    return `ws://localhost:8081/api/v1/agent/sessions/${sessionId}`;
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/api/v1/agent/sessions/${sessionId}`;
};

export const AGENT_LIMITS = {
  AUTO_APPROVAL_THRESHOLD_USD: 5,
  MAX_MESSAGE_LENGTH: 4000,
  SESSION_TIMEOUT_HOURS: 24,
  POLL_INTERVAL_MS: 2000,
} as const;

export const AGENT_QUERY_KEYS = {
  all: () => ["agent"] as const,
  sessions: () => ["agent", "sessions"] as const,
  session: (id: string) => ["agent", "session", id] as const,
  messages: (id: string) => ["agent", "messages", id] as const,
  budget: () => ["agent", "budget"] as const,
} as const;
