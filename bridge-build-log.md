# WhatsApp → OpenCode Bridge: Build Log

## Goal

Route WhatsApp messages to a local opencode assistant so the user can chat with an LLM from WhatsApp, with opencode managing conversation sessions and Ollama providing inference.

## Architecture

```
WhatsApp (your phone) → owpenbot (Node.js bridge) → opencode serve (127.0.0.1:4096) → Ollama (10.10.0.20:11434)
```

| Component | Role | Location |
|---|---|---|
| owpenbot | WhatsApp ↔ opencode message bridge | `/tmp/owpenbot/` |
| opencode serve | Headless session manager + LLM router | `127.0.0.1:4096` |
| Ollama | Local model inference | `10.10.0.20:11434` |

## Completed Work

### 1. Started `opencode serve`

Ran opencode in headless server mode on port 4096. It reads provider config from `~/.config/opencode/opencode.jsonc` (Ollama at `10.10.0.20:11434`, multiple models available).

### 2. Set up owpenbot

- Cloned owpenbot repo to `/tmp/owpenbot/`
- Installed dependencies with `pnpm`
- Compiled TypeScript to `dist/`
- Created `.env` config file with bridge settings
- Ran WhatsApp pairing flow — scanned QR code with phone, session credentials persisted to `~/.owpenbot/credentials/whatsapp/`
- Ran the setup wizard to configure personal number mode with an allowlist

### 3. Fixed self-chat bug (`WHATSAPP_SELF_CHAT` env override)

`.env` had `WHATSAPP_SELF_CHAT=false`, which silently overrode the JSON config and dropped all self-messages. Changed to `true`.

### 4. Bridged to opencode

Started owpenbot bridge. It connected to WhatsApp (Baileys), received messages, routed them through the `@opencode-ai/sdk` to the opencode serve API, and forwarded prompts to Ollama. End-to-end messaging confirmed working.

### 5. Added trigger prefix

Modified `src/config.ts` and `src/bridge.ts` to add a configurable message trigger prefix. Only WhatsApp messages starting with the prefix are processed; the prefix is stripped before sending to opencode.

- Config: `WHATSAPP_TRIGGER_PREFIX` (env) or `messageTriggerPrefix` (JSON)
- Default: `~`
- Example: send `~ what is 2+2` → processed as `what is 2+2`; send `what is 2+2` → silently ignored

### 6. Added reply prefix

Modified `src/bridge.ts` to prepend a configurable tag to all LLM replies to WhatsApp, making it visually clear which messages came from the AI.

- Config: `WHATSAPP_REPLY_PREFIX` (env) or `replyPrefix` (JSON)
- Default: `[🤖 AI]: `
- Example: reply shows `[🤖 AI]: The answer is 4.`

### 7. Added error reply suppression

Modified `src/bridge.ts` to suppress error messages sent back to WhatsApp on LLM failure. Errors still log to the file, but are never delivered to the phone.

- Config: `WHATSAPP_SUPPRESS_ERRORS` (env) or `suppressErrorReplies` (JSON)
- Default: `true` (suppressed)
- Applies to both empty responses and hard failures (e.g., opencode unreachable)

### 8. Set up systemd services

Created two user-level systemd services in `~/.config/systemd/user/`:

- `opencode-serve.service` — manages `opencode serve --port 4096`
- `owpenbot.service` — manages `node /tmp/owpenbot/dist/cli.js start`, dependent on `opencode-serve.service`

Both are **disabled** (won't start on boot) and **stopped**. Start manually when needed:

```bash
# Start both (owpenbot waits for opencode-serve due to dependency)
systemctl --user start opencode-serve owpenbot

# Stop both
systemctl --user stop opencode-serve owpenbot

# Check status
systemctl --user status opencode-serve owpenbot
```

### 9. Tested post-reboot recovery

After server reboot, restarted Ollama, opencode serve, and owpenbot. Verified all three connected and message flow worked with the new features.

## Problems Hit

### Problem 1: Self-messages silently dropped (ROOT CAUSE — SOLVED)

**Symptom:** Messages sent from the user's phone to their own number were never delivered to opencode. No errors in logs, no visible failure.

**Investigation:** Traced through `owpenbot/src/whatsapp.ts` and found a filter at the handler that checks `config.whatsappSelfChatMode`. If `false`, self-messages are dropped silently. The JSON config (`~/.owpenbot/owpenbot.json`) had `"selfChatMode": true`, so why was it `false` at runtime?

**Root cause:** In `owpenbot/src/config.ts`, config loading uses `parseBoolean(env.WHATSAPP_SELF_CHAT, whatsappFile.selfChatMode ?? false)`. Environment variables are checked **first**, then the JSON file is the fallback. The `.env` file had `WHATSAPP_SELF_CHAT=false`, which overrode the JSON config.

**Fix:** Changed `.env` to `WHATSAPP_SELF_CHAT=true`.

**Lesson:** `.env` values always override `owpenbot.json` config. If both are set, env wins.

### Problem 2: `pkill` hanging on owpenbot restart

**Symptom:** Attempting `pkill -f "cli.js"` to stop the bridge timed out after 120 seconds.

**Root cause:** Baileys WebSocket connections can be slow to tear down. The process received the signal but was waiting on a network close.

**Workaround:** The process did eventually stop. For future restarts, consider killing with `kill -9` if the normal signal doesn't work within a few seconds.

### Problem 3: Opencode serve dying with `nohup`

**Symptom:** After server reboot, `opencode serve` would start and then immediately die when launched via `nohup`.

**Investigation:** Running it directly showed it started fine. The issue was that `nohup` + shell command chaining was losing the process.

**Fix:** Used `nohup ... &` properly with correct quoting and waited for the HTTP response before declaring success. Replaced with systemd management.

### Problem 4: Replay messages from unknown LID

**Symptom:** After WhatsApp reconnect, the bridge logged: `[WhatsApp] 146982454743127@lid ! Access denied.`

**Explanation:** WhatsApp replayed offline messages/notifications on reconnect. Some were from LIDs not on the allowlist. This is expected behavior — the allowlist filter is working correctly.

## Key Configuration Files

| File | Purpose |
|---|---|
| `/tmp/owpenbot/.env` | Bridge env vars — **WHATSAPP_SELF_CHAT must be `true`** |
| `~/.owpenbot/owpenbot.json` | Bridge config — allowlist, selfChatMode, auth dirs |
| `~/.config/opencode/opencode.jsonc` | Opencode provider config — Ollama endpoint, models |
| `~/.owpenbot/credentials/whatsapp/` | Persisted WhatsApp session |
| `~/.owpenbot/logs/owpenbot.log` | Runtime logs |
| `~/.config/systemd/user/opencode-serve.service` | Systemd unit for opencode serve |
| `~/.config/systemd/user/owpenbot.service` | Systemd unit for owpenbot bridge |

## Current `.env` Configuration

```
OPENCODE_URL=http://127.0.0.1:4096
OPENCODE_DIRECTORY=/home/daryl/Documents/ai_workloads
OWPENBOT_DATA_DIR=~/.owpenbot
WHATSAPP_AUTH_DIR=~/.owpenbot/credentials/whatsapp
WHATSAPP_ENABLED=true
WHATSAPP_SELF_CHAT=true
WHATSAPP_TRIGGER_PREFIX=~
WHATSAPP_REPLY_PREFIX=[🤖 AI]:
WHATSAPP_SUPPRESS_ERRORS=true
LOG_LEVEL=info
```

## How to Start (systemd)

```bash
# Start both services (opencode serve starts first, owpenbot depends on it)
systemctl --user start opencode-serve owpenbot

# Stop both
systemctl --user stop opencode-serve owpenbot

# Check status
systemctl --user status opencode-serve owpenbot
```

## Decisions

### Skipped: `OPENCODE_SERVER_PASSWORD`

The opencode serve API is currently unauthenticated. This was a deliberate decision because the server only listens on `127.0.0.1` on a private home network with no external exposure.

**Reasons someone might want to set it:**

1. **Remote or network-wide access** — If the server listens on `0.0.0.0` or is exposed through a tunnel (Tailscale, Cloudflare Tunnel, reverse proxy), anyone who reaches it can send prompts, read sessions, and execute tools.
2. **Tool execution safety** — The API can run arbitrary bash commands, read/write files, and edit code. Authentication prevents unauthorized users from abusing this.
3. **Session privacy** — The API exposes full conversation history, including any sensitive data shared with the LLM.
4. **Multi-user network** — If roommates, guests, or IoT devices share your Wi-Fi, they could use the API to run inference against your models or read your sessions.
5. **Future-proofing** — If you ever expose the server beyond localhost, forgetting to add authentication would leave it wide open.

To enable it, add `OPENCODE_SERVER_PASSWORD=your_secret` to `.env` and restart owpenbot.

## Remaining

- [ ] Verify which model the bridge defaults to and whether it can be configured per-channel
