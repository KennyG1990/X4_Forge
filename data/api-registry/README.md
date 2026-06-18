# Third-party API registry — drop-in definitions

Forge ships a built-in registry of well-known community library mods
(`sn_mod_support_apis`, `kuertee_ui_extensions`) that its validators use to catch
the most common real break: using an API without declaring its `content.xml`
dependency (so it silently no-ops in-game).

**To add a new API**, drop a `*.json` file in this folder describing it. Every
`*.json` here is validated and merged onto the built-ins at server start. Bad files
are reported (see `GET /api/agent/external-api-registry` → `sources.errors`) and
skipped — never fatal.

Three ways to add APIs (all merged through the same validate→merge pipeline):

1. **This folder** (`data/api-registry/*.json`) — committed to the repo.
2. **A configured folder** — set `"apiRegistryPath": "C:/path/to/defs"` in `config.json`.
3. **At runtime** — `POST /api/agent/external-api/register` with a def body (in-memory,
   not persisted).

**Don't want to hand-write one?** Point Forge at an installed mod and let it derive a
draft: `GET /api/agent/external-api/derive?ext=<extension_folder_name>`. It scans the
mod's loose `.xml`/`.lua` and returns a DRAFT def (library cues, raised lua events,
global lua functions). Refine the summaries + detect tokens, save it here, done.

## Format (`forge-external-api/v1`)

See `TEMPLATE.json.example`. Required: `extensionId`, `components[]` (each with `id` +
non-empty `symbols[]`, each symbol with `name`, `kind`, non-empty `detect[]`).

- `kind`: one of `md_cue`, `lua_event`, `lua_global`, `lua_callback`, `ui_signal`.
- `detect[]`: literal substrings whose presence in a project's MD/Lua means the symbol
  is used (this is how the validator detects usage — keep them specific to avoid false
  positives).
- `dependsOn[]`: other extension ids this API needs (the validator enforces these
  transitively, e.g. kuertee → sn_mod_support_apis).

## Honest scope (◐)

These are curated, non-exhaustive assertions about community mods — **not** schema-grade
like `md.xsd`. Findings are labelled soft; an unknown member under a known namespace is
info, never an error.
