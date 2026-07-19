# B64 · Audit-driven hardening batch — reconciled plan (SPECIFIED)

> Source: a four-sweep read-only audit (2026-07-18) — security/auth, data/state/perf, UI/UX/a11y,
> tests/config/docs/architecture. Every finding carries file:line evidence + a confidence label
> (OBSERVED FACT / LIKELY INFERENCE / UNVERIFIED POSSIBILITY). This doc is the durable planning
> record; BACKLOG.md carries the compact umbrella. Implement ONE unit at a time; each ships with a
> Ken-approval brief (intended change / files / risks / validation) BEFORE code, per Ken's order.
>
> **Ordering law (Ken, 2026-07-18):** SECURITY FIRST, then agent's choice (perf → cheap UX → a11y →
> test/arch). Ken-gated items (design changes, EXPERIENCE eyeballs) are SPECIFIED but not auto-built.

## Reconciliation summary (what the audit found vs what the records already know)

- **Already tracked — NOT re-opened here:** the 3 RED oracles are env-only (documented since B49, A/B-proven);
  the e2e stdout-parse verdict is deliberate (B17, libuv 0xC0000409 crash); the 13 baked machine literals are
  a B41 residual. These are context, not new work.
- **Intentional designs the audit flags — need Ken sign-off to change (adapter rule):** the AI spend meter caps
  *calls* not dollars by design (B25); server provider keys are gated to app-UI origin by the `isAppUiRequest`
  Origin/Referer check by design (capability-map standing sweep). Dollar-awareness EXTENDS B25 (allowed, spend
  surface → rule 3.6 review); closing the Origin spoof MODIFIES a deliberate isolation model → Ken decision.
- **Confirmed real, no ADR conflict:** the read-scope → `GET /api/run_command` scope break (dev-only, 404 in
  prod), the synchronous object-index build on the request path, redundant per-validate DOM parsing, uncached
  reference sets, undebounced workspace writes, color-only severity, error-toast auto-expiry, modal a11y gaps.
- **Confirmed strengths to preserve (do not "fix"):** path containment (`isPathWithin`+sep guard), loopback bind
  + CORS, hashed/expiring/scoped agent-key store, contained deletes + `.forgekeep`, no baked secrets, the single
  spend chokepoint, the `basenameLints` DRY registry, per-panel `ErrorBoundary`, bounded/optional SQLite cache,
  atomic state writes, unusually complete docs.

Capability-map delta on close of the batch: add the run_command scope-fix, the index-async refactor, and any
spend-attribution change as POSITIVE deltas; record `no capability-map delta` for pure UX/a11y styling units.

---

## SECURITY UNITS (Ken's priority — built first, in this order)

### B64-SEC1 · run_command scope-integrity fix  ·  difficulty Low · regression-risk Low · gate: headless · **RECOMMENDED FIRST**
- **Problem (OBSERVED FACT):** `scopeAllows()` blanket-grants every GET to every scope (`src/lib/agentKeys.ts:203`),
  but `GET /api/run_command?cmd=…` runs `exec(cmd)` (`server.ts:8188`). A read-scoped agent key inherits full RCE.
  Bounded: the route only registers when `NODE_ENV !== "production"`; the shipped sidecar sets production +
  `FORGE_ALLOW_RUN_COMMAND:""` + loopback bind, so this is dev-server-only. The scope selftest only exercised POST
  routes, so it never caught a GET RCE.
- **Why it matters:** a delegated "read-only" key is supposed to be incapable of mutation; today it can run any shell
  command on the dev server. Scope integrity is the whole point of B42.
- **Change:** exclude `run_command` (and `run_command/job`) from the blanket-GET grant in `scopeAllows` — require the
  session token (or a new explicit `admin`/`exec` scope) for it; keep the route's existing `NODE_ENV`/flag gate.
- **Reuse:** the existing `scopeAllows` deny-by-default matrix + `WRITE_SCOPE_POST_PREFIXES` pattern (add a GET-exclusion list).
- **Files:** `src/lib/agentKeys.ts` (scopeAllows), `server.ts` (run_command auth check), `agent-keys-selftest`.
- **Acceptance + negative path:** extend `agent-keys-selftest` — mint a **read** key → assert **403** on
  `GET /api/run_command` and `GET /api/run_command/job/*`; session token still 200 (dev); assert a normal read GET
  (e.g. `/api/agent/schema`) still 200 for the read key (no over-restriction).
- **Validate:** `npm run typecheck` · `node scripts/oracle-sweep.mjs` (agent-keys green + the new negative check) ·
  `npm run test:e2e` (MACHINE-STATE ASK first) · live drill: read key 403 vs session 200 on the dev server.
- **Rollback:** single-function revert; no persisted state touched.

### B64-SEC2 · document security/spend env vars in .env.example  ·  Low · Low · headless (Light lane)
- **Problem (OBSERVED FACT):** `AI_DAILY_CALL_CAP`, `FORGE_ALLOW_RUN_COMMAND`, `X4_STATE_DIR`, `X4_DATA_DIR`,
  `X4_CONFIG_DIR`, `API_ONLY`, `PORT` are read by the server but absent from `.env.example`. The two that matter:
  the spend backstop and the RCE-enabling flag are invisible to a new dev running `dev:api`.
- **Change:** add each with a one-line comment (what it does, safe default, the security note on `FORGE_ALLOW_RUN_COMMAND`).
  Also note the `OPENROUTER_API_KEY` / `OPEN_ROUTER_API_KEY` alias (`server.ts:2046`).
- **Files:** `.env.example` only. **Acceptance:** every `process.env.*` the server reads appears in `.env.example`
  (grep parity check). **Rollback:** doc-only revert.

### B64-SEC3 · config.json JSON.parse hardening  ·  Low · Low · headless
- **Problem (OBSERVED FACT):** `readXsdConfig()` does `JSON.parse` with no try/catch (`src/lib/xsdParser.ts:298`),
  called at the top of ~40 route handlers (several before their try block). A corrupt/partially-written `config.json`
  throws → opaque 500 instead of a config error.
- **Change:** wrap the parse; on failure return a typed "config unreadable" result (empty/default config + a surfaced
  warning), matching how B45 made schema-absence non-fatal.
- **Files:** `src/lib/xsdParser.ts`. **Acceptance + negative path:** new oracle feeds malformed JSON → asserts a typed
  degrade (no throw); valid config still parses unchanged. **Validate:** typecheck + oracle + e2e. **Rollback:** function revert.

### B64-SEC4 · dollar-aware spend attribution (EXTENDS B25)  ·  Medium · Medium · headless + **Ken-review (spend surface)**
- **Problem (LIKELY INFERENCE):** `aiSpendMeter` caps daily *call count* (default 300, `server.ts:1893`) with no dollar
  estimate and no per-agent-key / per-provider attribution. A 299-call day of an expensive model passes the backstop;
  spend is not attributable.
- **Reconcile note:** B25's call-cap is intentional. This does NOT weaken it — it ADDS a cost estimate + attribution
  alongside. Any change to spend behavior is adapter rule 3.6 → Ken reviews the meter/limit/failure design before ship.
- **Change:** add per-model cost estimate at the chokepoint; record per-key + per-provider rollups in `data/ai-usage.json`;
  optional dollar soft-cap env (`AI_DAILY_USD_CAP`, default off = behavior unchanged). Surface via `GET /api/ai/usage`.
- **Files:** `src/lib/aiSpendMeter.ts`, `server.ts` (chokepoint + usage route), `ai-spend-selftest`.
- **Acceptance + negative path:** oracle with cost fixtures asserts rollups; dollar-cap trip proven by oracle (NOT by
  spending); with the cap unset, behavior is byte-identical to today. **Validate:** typecheck + oracle + e2e; live
  `GET /api/ai/usage` shows attribution. **Rollback:** the meter file is append/rewrite; revert code + keep the file
  (backward-compatible read).

### B64-SEC5 · close the Origin/Referer spend-gate spoof  ·  Med-High · Med · **KEN-GATED (modifies a deliberate design)**
- **Problem (LIKELY INFERENCE):** server provider keys are used only when `isAppUiRequest(req)` is true, decided purely
  by the `Origin`/`Referer` header (`server.ts:1876`). A non-browser local client holding the studio token can set
  `Origin: http://localhost:3000` and spend the user's provider credits — defeating "external agents bring their own key."
- **Reconcile note:** the Origin-gate is the DELIBERATE isolation model (capability-map). Replacing it (e.g. a
  server-minted per-session app secret the header can't forge) is a design change → Ken's explicit sign-off first.
- **Status:** SPECIFIED, Ken decision. Do not build without a go. Candidate fix documented; verify the spoof first
  (curl with forged Origin against an AI route → confirm it uses the server key) so the decision has evidence.

### B64-SEC6 · session-token rotation/expiry  ·  Med-High · Med · **deferred (low urgency, single-user loopback)**
- **Problem (OBSERVED FACT):** the studio session token is unscoped, never rotates within a checkout (`server.ts:192`).
- **Reconcile note:** scoped agent keys (B42) already mitigate delegated access; the root token is loopback-only + off the
  wire + out of git. Low marginal risk for a local single-user tool. SPECIFIED, deferred; revisit if a multi-user or
  remote surface ever appears.

### B64-SEC7 · plaintext AI keys at rest  ·  **deferred with documented accepted-risk rationale**
- **Problem (OBSERVED FACT):** `data/ai-keys.json` stores provider keys verbatim (`src/server/aiKeyStore.ts:50`).
- **Reconcile note:** partly inherent (keys must be reversible to call the provider); already gitignored, kept off the
  wire (status booleans only), same trust boundary as `.env`. OS-keychain integration is high-effort / low-marginal-value
  for a local tool. Decision: DOCUMENT the accepted risk in the security notes rather than build. Not queued.

---

## PERFORMANCE UNITS (agent's choice — highest felt value after security)

### B64-P1 · object-index build off the request hot path  ·  Med-High · Med · headless · **perf keystone**
- **Problem (OBSERVED FACT):** `getObjectIndex()` builds synchronously on the request path (`server.ts:1335` → `*Sync`
  fs + `gunzipSync` over up to ~15k files); Node is single-threaded so the whole build freezes every in-flight request,
  including each client's 3s workspace poll. 60s TTL with no background refresh (`server.ts:1281`) means a random user
  request periodically eats the full rebuild. (~25s duration is a project comment → inference.)
- **Change:** serve-stale-while-revalidate — return the warm (even expired) index immediately and refresh in the
  background (async/worker); only the very first cold build (no cache at all) blocks, and even that should yield. Never
  block a request on a *refresh*.
- **Reuse:** the existing `objectIndexCache` + `cacheKey` + SQLite cold-boot restore (`server.ts:1274-1316`); add a
  background-refresh flag, don't rebuild the cache model.
- **Files:** `server.ts` (getObjectIndex + collectObjectIndexStamps), possibly `src/lib/x4ObjectIndex.ts`.
- **Acceptance + negative path:** a request issued *during* a background refresh returns in <100ms with the prior index;
  index correctness unchanged (an added macro appears after refresh completes); no double-build race (concurrent callers
  share one in-flight refresh). **Validate:** typecheck + oracle + e2e + a timing drill (poll latency during refresh).
  **Rollback:** revert to synchronous build (single flag). **Risk:** concurrency correctness — needs the fresh-eyes review.

### B64-P2 · cache getReferenceSets + share one DOM parse across lints  ·  Med · Low-Med · headless
- **Problem (OBSERVED FACT):** `getReferenceSets()` is uncached and rebuilt ~2× per validate, walking the whole index
  each time (`server.ts:1383,1443`); and each validate DOM-parses the same file across ~8 lints (`jobs.xml` parsed 3×,
  md files 2×; `projectValidation.ts:236-265`). No shared AST.
- **Change:** memoize `getReferenceSets` by index signature (mirror the jobs/wares vocab cache at `server.ts:1404`);
  thread one parsed `Document` per file through the `basenameLints` loop + migration/tfile layers.
- **Files:** `server.ts` (getReferenceSets cache), `src/server/projectValidation.ts` (shared parse), lint libs (accept an
  optional pre-parsed doc). **Acceptance:** GOLDEN behavior-preservation test — flattened findings + summary counts
  byte-identical before/after across a fixture exercising all lints (the same test class used for the B63 registry refactor);
  plus a measured validate-latency delta. **Validate:** typecheck + the golden oracle + e2e. **Rollback:** revert; lints keep
  their own-parse fallback. **Risk:** a lint that mutates its doc — audit for shared-doc mutation first.

### B64-P3 · debounce/dirty-check workspace writes  ·  Med · Med · headless
- **Problem (OBSERVED FACT):** every workspace mutation synchronously `JSON.stringify`s + tmp-writes + renames the whole
  workspace (`server.ts:1785` → `workspaceState.ts:73`), no debounce/dirty-check; rapid edits = write amplification.
- **Change:** debounce the persist + skip when the content hash is unchanged; keep the atomic tmp+rename.
- **Files:** `server.ts` (commitActiveWorkspace), `src/lib/workspaceState.ts`. **Acceptance + negative path:** rapid-edit
  drill coalesces writes; a crash-consistency check proves the LAST edit persists (no lost write); the CAS head/hash
  contract (ADR-F1) is unchanged. **Validate:** typecheck + oracle + e2e. **Rollback:** revert to write-per-commit.
  **Risk:** losing the final write on a debounce window — the crash-consistency check is mandatory.

### B64-P4 · deepen cold-boot index invalidation stamps  ·  Med · Low-Med · headless
- **Problem (LIKELY INFERENCE):** `collectObjectIndexStamps` covers only `.cat` files + each scan root's top-level mtime
  (`server.ts:1234`); a nested loose-XML edit under `assets/` bumps neither, so a restarted process restores a stale
  SQLite index and only the 60s TTL eventually corrects it (code comment acknowledges the window).
- **Change:** extend the stamp to detect nested loose-XML changes (bounded recursive mtime/size digest, or a shallow
  content hash of the loose roots). **Files:** `server.ts`. **Acceptance + negative path:** restart after a nested edit →
  the fresh index reflects it immediately (before any TTL expiry). **Validate:** typecheck + oracle + e2e. **Rollback:** revert.

---

## CHEAP UX / CORRECTNESS UNITS (agent's choice — small, high-clarity)

### B64-U1 · error-level toasts assertive + non-expiring  ·  Low · Low · gate: eyeball (EXPERIENCE)
- **Problem (OBSERVED FACT):** toasts render `role="status"` (polite) with a 4.2s TTL (`src/lib/uiDialogs.tsx:50,129`);
  `window.alert` is rerouted into them. An error can vanish before it's read or announced.
- **Change:** error-severity toasts get `role="alert"` + no auto-dismiss (manual close); info/success keep the timed polite behavior.
- **Files:** `src/lib/uiDialogs.tsx`. **Acceptance:** e2e triggers a validation error → the toast persists + carries the alert
  role; a success toast still auto-expires. **Eyeball:** Ken confirms an error toast stays put. **Rollback:** revert.

### B64-U2 · deploy-failure error styling  ·  Low · Very-low · eyeball
- **Problem (OBSERVED FACT):** GuidedRail's `fail` phase uses `text-amber-300` — the same amber as warnings
  (`src/components/GuidedRail.tsx:153`) — so a hard failure reads as a caution.
- **Change:** failure → red/error tokens, distinct from warning-amber. **Files:** `GuidedRail.tsx`. **Acceptance:** visual
  check in the rendered webview (Ken eyeball). **Rollback:** revert.

### B64-U3 · color-independent validation severity  ·  Low-Med · Low · eyeball
- **Problem (OBSERVED FACT):** gutter markers distinguish error vs warning by fill color only (`bg-red-500` vs `bg-amber-400`,
  `src/components/CodePreview.tsx:1185,1391`) — colorblind users can't tell them apart.
- **Change:** add an icon/glyph (e.g. ✕ vs ⚠) alongside color. **Files:** `CodePreview.tsx`. **Acceptance:** rendered check +
  contrast pass. **Rollback:** revert.

### B64-U4 · Beginner "Customize" dead-end affordance  ·  Low-Med · Low · **verify-first + eyeball**
- **Problem (LIKELY INFERENCE):** with nothing selected the Beginner Customize step shows only a passive hint
  (`src/components/BeginnerWorkspace.tsx:137`) with no affordance to reach the editor. **Verify in the real webview first**
  (drive the beginner flow) before building. SPECIFIED, verify-then-scope.

---

## ACCESSIBILITY UNITS (agent's choice — broad reach; most are EXPERIENCE-gated)

### B64-A1 · shared modal shell a11y (fixes ~10 modals at once)  ·  Med · Low · headless build + eyeball close
- **Problem (OBSERVED FACT):** zero `role="dialog"`/`aria-modal` across ~10 modal surfaces; the large modals lack
  Escape-to-close + focus trapping (only 7 of 48 files have any Escape handling).
- **Change:** add `role="dialog"` + `aria-modal="true"` + a labelled title + Escape-to-close + focus-trap + focus-restore to
  the SHARED modal shell so every modal inherits it. **Files:** the shared modal component + `uiDialogs.tsx`.
- **Acceptance + negative path:** keyboard-only open→trap→Escape→focus-restore on each modal; axe scan clean; a click-outside
  path still works. **Validate:** DOM/role assertions headless + Ken keyboard eyeball. **Rollback:** revert the shell.

### B64-A2 · Canvas keyboard navigation  ·  High · Low-Med · **EXPERIENCE-gated, heavy**
- **Problem (OBSERVED FACT):** every node interaction is pointer-only — no `tabIndex`/`role`/key handlers on nodes
  (`src/components/Canvas.tsx:1798+`). No keyboard path to the central editor.
- **Change:** Tab/arrow node selection + keyboard move/connect. SPECIFIED; large, needs fresh context + a real keyboard
  walkthrough to close. Not auto-built in this batch.

### B64-A3 · sub-11px typography pass  ·  Med · Low · **deferred (design-led)**
- **Problem (OBSERVED FACT):** 832 occurrences of `text-[8px..10px]` across 45 files (status at `ReadinessLadder.tsx:70`).
  Likely under WCAG readability/contrast at that size. Needs a rendered pass + a design decision. SPECIFIED, deferred.

---

## TEST / ARCHITECTURE UNITS (agent's choice — infra)

### B64-T1 · route-level integration test harness  ·  Med-High · Low · headless
- **Problem (OBSERVED FACT):** no unit framework; 133 server routes + all React components + the entire extension are
  untested beyond 9 e2e specs. Biggest coverage gap.
- **Change:** a lightweight HTTP integration harness over the highest-risk routes (`project/validate`, `fs/write`, deploy,
  agent keys) + an extension smoke test; wire into the sweep. **Files:** new `tests/` harness + `scripts/oracle-sweep` hook.
  **Acceptance:** the harness runs green in the sweep and fails loudly on a seeded regression. **Rollback:** remove the harness.

### B64-T2 · e2e verdict via Playwright JSON reporter  ·  Med · Med · headless
- **Problem (OBSERVED FACT):** `scripts/run-e2e.mjs:40` regex-matches stdout ("N passed") and ignores the exit code
  (deliberate: libuv 0xC0000409 crash) — brittle to any Playwright summary-wording change.
- **Change:** consume Playwright's structured JSON reporter for the verdict instead of stdout regex; keep the exit-code
  workaround as a fallback. **Files:** `scripts/run-e2e.mjs` + Playwright config. **Acceptance:** green/red/no-run all
  verdict correctly off the JSON; a reworded stdout no longer breaks it. **Rollback:** revert to the regex parser.

### B64-ARCH1 · continue server.ts route extraction  ·  High (incremental) · Low · **long-term, ongoing**
- **Problem (OBSERVED FACT):** `server.ts` is 8,259 lines / 133 routes; extraction to `src/server/` is ~18% done.
- **Change:** continue the proven extraction one route-group at a time (the `src/server/*.ts` + `selftestRegistry` pattern
  works). SPECIFIED as an ongoing background reduction, not a single unit. Each extraction: move + re-run typecheck/oracle/e2e,
  no behavior change. **Risk:** low if incremental + gated each time.

---

## PRODUCT-DECISION UNITS (Ken's call)

### B64-X1 · finish or remove Google OAuth  ·  Low-Med · Low · **Ken decision**
- **Problem (OBSERVED FACT):** a "Sign in with Google" button exists but only shows "not available yet"
  (`src/components/AIConnectionModal.tsx:132`). A visible control that does nothing erodes trust. Ken decides: wire it or remove it.

---

## Build sequence (one at a time; security first, then agent's choice)

1. **B64-SEC1** (run_command scope) — recommended first, self-proving oracle
2. **B64-SEC2** (env docs) — trivial, pairs with SEC1
3. **B64-SEC3** (config.json hardening)
4. **B64-SEC4** (dollar-aware spend) — Ken-review before ship (spend surface)
5. **B64-SEC5** (Origin spoof) — Ken decision, verify-first  ·  **B64-SEC6/SEC7** deferred (documented)
6. **B64-P1** (index off hot path) — perf keystone
7. **B64-P2** (validate latency) → **B64-P3** (workspace write debounce) → **B64-P4** (stale-index stamps)
8. **B64-U1** (toast) → **B64-U2** (deploy color) → **B64-U3** (severity icon)  ·  **B64-U4** verify-first
9. **B64-A1** (modal shell a11y) — headless build, eyeball close  ·  **B64-A2** heavy/eyeball, **B64-A3** deferred
10. **B64-T1** (route tests) → **B64-T2** (e2e reporter) → **B64-ARCH1** (extraction, ongoing)
11. **B64-X1** (OAuth) — Ken decision

**Gate legend:** headless = closeable with oracles/e2e alone · eyeball = needs Ken's rendered screen (blocked by
`textinputhost.exe` remotely — batch these for when Ken is at the machine) · Ken-decision = design/product call before build.
