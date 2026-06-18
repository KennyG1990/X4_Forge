# Contributing to X4 Forge

Thanks for helping make X4 Forge better for the X4 modding community. This guide covers
the two most common contributions — **adding a third-party API definition** (no code,
no rebuild) and **adding a deterministic feature** — plus the project conventions that
keep Forge's promise honest.

> License note: X4 Forge is released under **PolyForm Noncommercial 1.0.0** (free for
> non-commercial use). By contributing you agree your contribution is licensed the same way.

## The one rule that matters: honesty over coverage

Forge's whole value is that it tells the truth about your mod. A check that *says* it
validated something it didn't is worse than no check. So:

- If a guarantee is schema-grade (validated against the real `md.xsd`), say so.
- If it is softer (heuristic, curated, our own assertion), label it softer (the ◐
  convention) and never imply schema certainty.
- Never make a fabricated element look valid. Cross-check against the parsed schema.

## Contribution 1 — add a third-party API definition (no rebuild)

This is the easiest and most valuable contribution: teach Forge about a community library
mod so its validators can catch missing-dependency mistakes for everyone who uses it.

1. Copy `data/api-registry/TEMPLATE.json.example` to `data/api-registry/<extension_id>.json`
   (name the file after the `content.xml` id the mod is depended on by).
2. Fill it in following `data/api-registry/schema.json` (editors that honor `$schema`
   validate as you type). Required: `extensionId`, `components[]` — each component needs an
   `id` and a non-empty `symbols[]`, and each symbol needs `name`, `kind`, and a non-empty
   `detect[]` of literal tokens.
3. `detect[]` tokens are how Forge spots usage in a project's MD/Lua. Keep them **specific**
   (e.g. `Simple_Menu_API.Create_Menu`, not `Create_Menu`) to avoid false positives.
4. Set `dependsOn[]` to any other extension ids the API itself needs (Forge enforces these
   transitively).

Don't want to hand-write it? Let Forge derive a draft from an installed copy:

```
GET /api/agent/external-api/derive?ext=<extension_folder_name>
```

It reads the mod's loose and packed `.xml`/`.lua` and returns a draft definition (library
cues, raised Lua events, global Lua functions). Refine the summaries and detect tokens,
save it under `data/api-registry/`, and open a PR.

The server validates every definition at load; malformed files are reported (see
`GET /api/agent/external-api-registry` → `sources.errors`) and skipped, never fatal.

## Contribution 2 — add a deterministic feature (the "house pattern")

Every deterministic capability in Forge ships as a "house": a pure engine, an oracle that
proves it, and a read-only endpoint that exposes the proof.

1. **Pure engine** — `src/lib/<feature>.ts`: inputs in, plain data out. No `fs`, no network,
   no React. Use `@xmldom/xmldom` for nested XML; regex only for flat attribute lists.
   Degrade safely on empty/garbage input (return empty, never throw).
2. **Oracle** — `run<Feature>Selftest()` returning
   `{ allPassed, pass, passed, total, checks[] }`. Cover the happy path, the empty case, and
   every edge case you found. Mirror real artifact shapes in fixtures.
3. **Endpoint + route** — add `GET /api/agent/<feature>-selftest` in `server.ts` **and add
   its path to `PUBLIC_READONLY_GETS`** (selftests are unauthenticated; forget this and it
   401s).
4. **UI (optional, after the oracle is green)** — surface the engine output where the user
   already is.

## Verifying your change

The deterministic selftests are the regression net. Locally:

```
npm run typecheck                 # must be exit 0
npm run lint                      # 0 errors
node scripts/oracle-sweep.mjs     # every -selftest endpoint, all green
npm run test:canvas               # canvas interaction + perf guard
```

`oracle-sweep.mjs` auto-discovers any new `-selftest` from the `PUBLIC_READONLY_GETS`
allowlist, so a new house is picked up automatically. For UI changes, verify live in the
browser (render + the relevant state transition + no console/Vite errors); a passing type
check is not a passing feature.

## Pull requests

- Keep changes scoped and behavior-neutral where possible; explain what's schema-grade vs
  softer.
- Include the selftest results (commands + counts) in the PR description.
- For API-registry definitions, cite the API's own documentation as the source.
