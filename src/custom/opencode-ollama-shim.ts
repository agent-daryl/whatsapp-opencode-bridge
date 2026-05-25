import type { Config } from "./config.js";

const OLLAMA_BASE = "http://10.10.0.20:11434";
const OLLAMA_MODEL = "qwen3.6:27b_256k";

const sessions = new Map<string, { title: string; messages: { role: string; content: string }[] }>();

type RawSession = { id: string };
type HealthResp = { healthy: boolean; version: string };

type Client = {
  global: { health: () => Promise<HealthResp>; };
  session: {
    create: (opts: { title: string; permission: unknown[] }) => Promise<RawSession>;
    prompt: (opts: { sessionID: string; parts: Array<{ type: string; text: string }> }) => Promise<unknown>;
  };
  event: {
    subscribe: (arg: any, opts?: { signal: AbortSignal }) => Promise<{
      stream: AsyncIterable<unknown>;
    }>;
  };
  permission: {
    respond: (opts: { sessionID: string; permissionID: string; response: string }) => Promise<void>;
  };
};

async function ollamaChat(systems: string[], user: string): Promise<string> {
  const msgs = [
    ...systems.map(s => ({ role: "system" as const, content: s })),
    { role: "user" as const, content: user },
  ];
  // Append session history
  // We pass them through the user prompt context
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: OLLAMA_MODEL, messages: msgs, stream: false, options: { num_ctx: 8192 } }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama ${res.status}: ${err}`);
  }
  const json = await res.json();
  return json.message?.content ?? "";
}

async function* emptyEvents(): AsyncIterable<unknown> {
  // yield nothing; bridge loops but never blocks on events
  while (true) {
    await new Promise(r => setTimeout(r, 60000));
    yield null as unknown;
  }
}

export function createClient(config: Config): Client {
  return {
    global: {
      async health() {
        try {
          const r = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(5000) });
          return { healthy: r.ok, version: "ollama-direct" };
        } catch {
          return { healthy: false, version: "unknown" };
        }
      },
    },
    session: {
      async create(opts: { title: string; permission: unknown[] }): Promise<RawSession> {
        const id = "ses_" + Math.random().toString(36).slice(2, 15);
        sessions.set(id, { title: opts.title, messages: [] });
        return { id };
      },
      async prompt(opts: { sessionID: string; parts: Array<{ type: string; text: string }> }): Promise<unknown> {
        const text = opts.parts.map(p => p.text).join("\n").trim();
        let session = sessions.get(opts.sessionID);
        if (!session) {
          session = { title: "owpenbot-session", messages: [] };
          sessions.set(opts.sessionID, session);
        }
        session.messages.push({ role: "user", content: text });

        const system = [
          "You are a helpful assistant connected via WhatsApp.",
          "Keep responses concise and clear.",
        ];
        // Include conversation history from this session
        const history = session.messages.filter(m => m.content !== text);
        const msgs = [
          ...system.map(s => ({ role: "system" as const, content: s })),
          ...history,
          { role: "user" as const, content: text },
        ];
        const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: OLLAMA_MODEL, messages: msgs, stream: false, options: { num_ctx: 8192 } }),
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(`Ollama ${res.status}: ${err}`);
        }
        const json = await res.json();
        const reply = json.message?.content ?? "";
        session.messages.push({ role: "assistant", content: reply });
        return { parts: [{ type: "text", text: reply, ignored: false }] };
      },
    },
    event: {
      subscribe() {
        return Promise.resolve({ stream: emptyEvents() });
      },
    },
    permission: {
      async respond() { /* no-op */ },
    },
  };
}

export function buildPermissionRules(_mode: "allow" | "deny"): Array<{ permission: string; pattern: string; action: "allow" | "deny" }> {
  return [{ permission: "*", pattern: "*", action: "allow" }];
}
