# X4 Mod Studio

A visual IDE for building, validating, and deploying **X4: Foundations** mods — node-based Mission Director authoring, schema-backed validation against your real game install, cross-mod conflict scanning, round-trip import/export, and one-click deploy to your `extensions/` folder.

## Quick start

```
npm install
```

Double-click `restart-studio.bat` (Windows), or run the two dev servers yourself:

```
npm run dev:api   # API server on http://127.0.0.1:3001
npm run dev:web   # UI (Vite) on http://localhost:3000
```

Open http://localhost:3000, then point the app at your install via **SETTINGS** (X4 game path, XSD schema folder, mod workspace folder). These paths are saved to `config.json`, which is **gitignored** — copy `config.example.json` if you prefer editing by hand.

## API keys & secrets — read this before worrying

**Nothing secret is ever committed to this repository.** The layout:

| Where | What | Committed? |
|---|---|---|
| `.env.local` | Your provider API keys (Gemini/OpenRouter/OpenAI/Anthropic), GitHub OAuth Client ID | **Never** (`.env*` is gitignored; only `.env.example` is tracked) |
| Browser localStorage | Keys entered in the in-app **AI Providers** modal, GitHub token from the device-flow sign-in | Never touches the filesystem/repo |
| `.studio-api-token` | Per-session token authenticating your browser to your local API | **Never** (gitignored) |
| `config.json` | Your machine's game/schema/workspace paths | **Never** (gitignored) |

How keys are protected at runtime:

- The API server binds **127.0.0.1 only** — nothing on your network can reach it.
- Every `/api/*` call requires the session token your browser receives on page load.
- Server-side `.env.local` keys are **Origin-gated**: they only back requests coming from the app UI in your own browser. External scripts/agents (even with the session token) must supply their own key via the `x-custom-api-key` header — they can never spend your configured keys.
- Keys are only ever sent to the respective provider's official endpoint.

Setup: `copy .env.example .env.local`, fill in the keys you use (all optional), restart. Or skip the file and enter keys in the in-app AI Providers settings instead.

## Docs

- `ROADMAP.md` — strategy, changelogs, and the validation roadmap.
- `HANDOFF.md` — working-state notes for contributors/agents (top section is current; lower sections are historical).
