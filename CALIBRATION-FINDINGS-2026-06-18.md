# X4 Forge — Calibration Findings (pre-ship), 2026-06-18

Adversarial UX calibration: a mix of **live** browser testing (Claude in Chrome, front + back
verified) and **code-grounded** static analysis (3 parallel source reviews, file:line cited).
Every item is labelled by evidence level. **Nothing here rests on a green badge** — that's
the point of the exercise.

## Root cause (all three source reviews converged independently)

Validation in Forge is **advisory everywhere**: badges, toasts, inline messages, and
`*-selftest` greens are computed separately and **no Copy / Save / Compile action gates on
its own verdict.** Plus there are **divergent emit paths** — the on-disk compiler escapes
XML, the live preview/copy compiler does not; the patch preview validates, the compile/copy
path emits raw. So a green/✓/"OK"/"copied!" is reliably a *claim*, not proof.

**Single highest-leverage fix:** before any compile/copy/deploy emits a file, run the emitted
string back through the XML parser (`parseXMLToWorkspace` already exists) and **hard-block on
parse failure**; and make Copy/Save consult the already-computed validation verdict instead of
firing an unconditional success toast.

---

## A. LIVE-CONFIRMED this session (front + back observed)

- **L1 — Wares pricing is warn-not-block; the invalid value reaches the compiled XML.**
  Set Min Floor = 999999999 (> Max 720). FRONT: red "Invalid pricing range… X4 engine rejects
  unstable boundaries" + "Average price anomalous" + Conflict Diagnostics → "2 ISSUES". BACK:
  the generated `wares.xml` still emitted `<price min="999999999" average="350" max="720" />`.
  The warning is honest but nothing stops the broken economy from compiling. **Verdict: works
  as a warning, ships the bad value anyway.**
- **L2 — Negative cargo volume silently coerced, no warning.** Typed `-99` into Cargo Volume.
  FRONT: the number field dropped the `-` and displays a cosmetic `099`; no warning at all
  (unlike pricing). BACK: compiler emitted `volume="99"`. Volume/zero/negative isn't validated
  the way price is — inconsistent. **Verdict: BREAK (silent coercion + cosmetic display bug).**
- **L3 — "Create" a new ware with an empty id silently no-ops** (no hint why nothing happened).
  Minor.
- **L4 — App used blocking native `alert()`/`confirm()`/`prompt()` (29 sites, 8 files).
  ✅ FIXED & verified this session.** Native dialogs froze the renderer and couldn't be driven
  by an agent. Replaced with a non-blocking in-app system: `src/lib/uiDialogs.tsx` (toast +
  async `confirmDialog`/`promptDialog` + `<DialogHost/>` mounted in App); `window.alert` is
  globally routed to a toast in `main.tsx` (covers all 14 alerts); the 4 `confirm` + 9 `prompt`
  sites converted to `await confirmDialog/promptDialog`. **Verified:** host `typecheck` clean,
  `lint` 0 errors, `oracle-sweep` 49/49, `test:canvas` passed; live in Chrome the "Wipe
  snapshots" control now shows the styled in-app confirm modal (screenshot) and the
  remove-last-ware guard renders an in-app toast ("Keep at least one ware entry") — **no native
  browser popup at any point.** (Calibration tip retained: for any future native dialog, override
  `window.alert/confirm/prompt` before interacting so it can't freeze the tooling.)

---

## B. CODE-PREDICTED — high confidence, NOT yet live-confirmed (do these next)

### Ship-blockers
- **P1 — Unescaped XML in MD cue/condition attributes → malformed `md/<id>.xml` while the
  "Compiler: OK" badge stays green.** `generateMDXML.renderCue` interpolates `name`,
  `namespace`, `state`, event/`check_value` attrs raw (`src/types.ts:689,705,725,735…`); the
  escaper exists (`types.ts:643`) but these branches bypass it. A cue named `Trade & Profit`
  ships invalid XML the game won't load. **This is the flagship deterministic-promise
  violation — confirm live first.**
- **P2 — AIScript preview/"Copy XML" emit unescaped attributes** (`AIScriptEditor.tsx:303`) and
  **disagree with the escaped packaged file** (`modCompiler.ts:118`). Copy gives broken XML.
- **P3 — Empty cue name ships a machine id** (`cue_<timestamp>`) as the cue name
  (`types.ts:684`); readiness check doesn't validate cue names (`modCompiler.ts:312`).
- **P4 — Malformed XML patch *content* compiles raw into the diff** (`compileDiffDocument`,
  `modCompiler.ts:281-284`); the Applied-Preview validates it but the compile/Copy path doesn't.
- **P5 — Broken/oversized custom Lua ships verbatim** (`modCompiler.ts:498`); the Lua analyzer
  is decorative (findings never block).
- **P6 — `NaN` in any ware/job number field ships as `attr="NaN"` and evades the diagnostic**
  (`NaN <= 0` is `false`, so quota/price guards don't fire). Blank a number field to repro.
- **P7 — File-bridge directory/filename path traversal via bare `..`/`...`** — the regex
  `/^[a-z0-9_.-]+$/` (`fileBridgeTransport.ts:31-32`) accepts dot-only segments.
- **P8 — Contract field-name interpolated raw into generated MD XML** (`contractGlue.ts:107,
  413,448,450`); only presence is validated, so `a" />` breaks the MD.

### Trust / integrity
- **P9 — AI Connection modal: fake Google "OAuth"** (hardcodes a user after 1.2s,
  `AIConnectionModal.tsx:240-249`) + unverified key save reporting success via `setTimeout`.
- **P10 — Load-Project aiscript/diff paste claims success but imports nothing**
  (`SyncModal.tsx:269-276`); content sniff is a spoofable `string.includes`.
- **P11 — Directory Settings saves empty/nonexistent paths as "Saved"** (0 schema counts are
  the only tell, `DirectorySettingsModal.tsx:110-138`).
- **P12 — Duplicate ware/job IDs accepted and shipped**; same-source dupes aren't even flagged.

### Stability / correctness
- **Sub-cue cycle → unbounded recursion** in `generateMDXML.renderCue` (`types.ts:828-836`) and
  the canvas simulator → tab hang / stack overflow.
- **`Date.now()`-based ids collide** on same-millisecond spawns (composite blocks) → corrupt
  `nodeById` / React keys.
- **Selftest dashboard loose pass-predicate** (`PackageModDoctor.tsx:205-210`) can green a
  malformed/empty endpoint response.
- **UI Builder "layout valid" badge can't see off-frame/negative widgets** — validator called
  without the `frame` arg, so its out-of-frame branch is dead code.

---

## C. Confirmed SOLID (don't waste retest time)
- Canvas link rules (out↔out / self / duplicate all rejected); Tidy Graph (pure, cycle-guarded);
  `mdSimulate` tri-state honesty; the Diff→Patch synthesizer (real round-trip-tested validation);
  JSON workspace import (`Array.isArray(nodes)` guard + checkpoint-before-replace); the Project
  tab (read-only, honest derived status).

## Suggested fix order
1. P1/P2/P3 (unescaped/empty MD+AIScript names) + the root-cause parser-gate — these break the
   core promise. 2. P4/P5 (patch content + Lua ship raw). 3. P6/P12 (NaN + dup ids). 4. P7/P8
   (injection seams). 5. L1/L2 (ware field validation parity + block-on-invalid). 6. P9/P10/P11
   (honest auth/import/settings feedback). 7. L4 (replace native dialogs with in-app modals).
