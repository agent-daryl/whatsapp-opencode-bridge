# WhatsApp OpenCode Bridge - Project Status

<details>
<summary>Goals</summary>

Establish a WhatsApp messaging bridge to control the opencode assistant using `owpenbot` and a headless `opencode serve` instance. The user prefers opencode over autonomous agents like OpenClaw to maintain direct control over LLM interactions.

</details>
<details>
<summary>Architecture</summary>

```
┌──────────────┐       ┌──────────────┐          ┌───────────────────┐          ┌──────────────┐
│   WhatsApp   │──────▶│   owpenbot   │         │   opencode serve  │         │    Ollama    │
│  (your phone)│◀──────│  (Node.js)   │────────▶│  (127.0.0.1:4096) │────────▶│              │
└──────────────┘       └──────────────┘         └───────────────────┘         └──────────────┘
                                                                                   │
                                                                                   │
                                                                                   ▼
                                                                                   │ Local models  │
                                                                                   └──────────────┘
```

- **WhatsApp**: User sends messages to own number (self-note)
- **owpenbot**: Bridge that receives WhatsApp messages via Baileys SDK, forwards to opencode serve API
- **opencode serve**: Headless server that manages conversations and routes to LLM
- **Ollama**: Local model inference at `10.10.0.20:11434`

</details>
<details>
<summary>What's Built</summary>

1. **Started `opencode serve` headless server** (v1.15.10) on `127.0.0.1:4096`
2. **Cloned `owpenbot`** from GitHub, installed `pnpm` dependencies, compiled TypeScript
3. **Created `.env` configuration** in `/tmp/owpenbot/.env`
4. **Generated WhatsApp QR code**, user scanned and paired the device
5. **Ran setup wizard** - configured personal number mode with allowlist
6. **Started bridge** - WhatsApp connected and listening for messages

</details>
<details>
<summary>What Doesn't Work & Why</summary>

The bridge receives WhatsApp messages but cannot send prompts to opencode. The `@opencode-ai/sdk` v1.1.47 expects JSON API responses at routes like `/api/v2/health`, `/api/v2/sessions`, `/api/v2/sessions/{id}/prompt`. However, `opencode serve` v1.1.10 serves its web frontend (HTML) on every route.

Root cause: API mismatch between the SDK's expected endpoints and what the installed opencode serve actually exposes. The SDK was generated from an OpenAPI schema that the current serve binary doesn't implement, or the serve command in this version doesn't expose a proper REST API for headless use.

</details>
<details>
<summary>Configurations</summary>

opencode config (`~/.config/opencode/opencode.jsonc`):
- Provider: Ollama at `http://10.10.0.20:11434/v1`
- Models available: Nemotron 3 Nano (200k), Gemma 4 31b (90k), Qwen 3.6 35B A3B, Qwen 3.6 27B Dense (130k), Qwen3 Coder (200k)

owpenbot configuration (`~/.owpenbot/owpenbot.json`):
- WhatsApp: enabled, personal number mode, allowlist contains one number
- Telegram: disabled

</details>
<details>
<summary>Key Files</summary>

- `/home/daryl/.config/opencode/opencode.jsonc` - opencode provider config
- `/tmp/owpenbot/.env` - bridge environment variables
- `/home/daryl/.owpenbot/owpenbot.json` - bridge configuration
- `/home/daryl/.owpenbot/credentials/whatsapp/` - WhatsApp session credentials
- `/home/daryl/.owpenbot/logs/owpenbot.log` - owpenbot runtime logs
- `/tmp/owpenbot/node_modules/@opencode-ai/sdk/` - installed SDK source

</details>
<details>
<summary>Paths Forward</summary>

1. **Debug the mismatch**: Examine what API the SDK expects vs what serve provides
2. **Fix opencode serve**: Configure or patch the serve binary to expose the expected JSON API routes
3. **Rewrite the bridge**: Build a custom bridge that uses opencode's actual protocol instead of the SDK

</details>
