# Prompt for Smarter LLM to Help Solve WhatsApp OpenCode Bridge

You are an expert AI assistant helping debug a WhatsApp messaging bridge that connects WhatsApp to a local opencode server. Here is all the context:

## Goal
We want to control an opencode assistant via WhatsApp messages. The user sends a message to themselves on WhatsApp, and gets back an LLM-generated response. We're using `owpenbot` to bridge WhatsApp to `opencode serve`.

## Tech Stack
- **owpenbot** (https://github.com/different-ai/owpenbot), v0.1.16
- **opencode serve** v1.15.10
- **SDK**: @opencode-ai/sdk v1.1.47 (owpenbot imports from `@opencode-ai/sdk/v2/client`)
- **WhatsApp**: @whiskeysockets/baileys 7.0.0-rc.9
- **LLM**: Local Ollama at `http://10.10.0.20:11434/v1` with Qwen 3.6, Gemma 4, Nemotron models

## Config
opencode config (`~/.config/opencode/opencode.jsonc`):
```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": "allow",
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama (direct)",
      "options": {
        "baseURL": "http://10.10.0.20:11434/v1",
        "apiKey": "ollama"
      },
      "models": {
        "nemotron-3-nano:30b-a3b_200k_context": { "name": "Nemotron 3 Nano (200k)" },
        "gemma4:31b_90k": { "name": "Gemma 4 31b (90k)" },
        "qwen3.6:latest": { "name": "Qwen 3.6 35B A3B" },
        "qwen3.6:27b_130k": { "name": "Qwen 3.6 27B Dense (130k)" },
        "qwen3.6:latest_200k": { "name": "Qwen 3.6 35B A3B (200k)" },
        "qwen3-coder-next:q4_K_M_200k": { "name": "Qwen3 Coder (200k)" }
      }
    }
  }
}
```

owpenbot config (`~/.owpenbot/owpenbot.json`):
```json
{
  "version": 1,
  "channels": {
    "whatsapp": {
      "dmPolicy": "allowlist",
      "allowFrom": ["+17192320565"],
      "selfChatMode": true,
      "accounts": {
        "default": {
          "authDir": "/home/daryl/.owpenbot/credentials/whatsapp"
        }
      }
    }
  }
}
```

## The Problem
WhatsApp messages are received by owpenbot (Baileys connects fine, QR paired, adapter works). But when owpenbot tries to send those messages to opencode for LLM processing, it fails. The logs show:
- `failed to reach opencode health`
- `timed out waiting for message` on incoming messages

The bridge uses `@opencode-ai/sdk/v2/client` which calls routes like `/api/v2/health`, `/api/v2/sessions`, `/api/v2/sessions/{id}/prompt`, and subscribes to event streams.

However, `opencode serve` v1.15.10 returns HTML for every route. Testing with curl confirms:
```
curl http://127.0.0.1:4096/api/v2/health
<!doctype html>...
HTTP_STATUS:200
```
Every endpoint returns the React web frontend (200 HTML), not JSON. The SDK can't parse HTML and fails.

## Key Files
```
/tmp/owpenbot/src/bridge.ts    # Main bridge logic - creates sessions, sends prompts, subscribes to events
/tmp/owpenbot/src/opencode.ts  # Client wrapper using SDK
/tmp/owpenbot/src/whatsapp.ts  # WhatsApp adapter using Baileys
```

The bridge flow in `bridge.ts`:
1. Creates client via `createOpencodeClient({ baseUrl, directory, responseStyle: "data", throwOnError: true })`
2. On boot calls `client.global.health()` - this returns HTML, not JSON
3. Subscribes to `client.event.subscribe()` for SSE-like event stream
4. On incoming message calls `client.session.create()` to make a session
5. Sends prompt via `client.session.prompt({ sessionID, parts })`
6. Collects response text from returned parts
7. Sends reply back to WhatsApp via Baileys socket

## What I Need From You
1. Debug why `opencode` serve is returning HTML instead of JSON API responses. Is there a flag or configuration to enable the proper API routes?
2. If the API mismatch is unavoidable with this version, what is the best approach to build a simpler working bridge?
3. Provide concrete code or commands to solve the problem.

Be specific, practical, and code-focused.
