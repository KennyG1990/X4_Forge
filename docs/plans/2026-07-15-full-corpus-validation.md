# B46 · Full-corpus schema/reference validation (modding-relevant subset) — SPECIFIED 2026-07-15

Lane: **FULL** (core validation-engine change — highest blast radius in the app). Ken chose the
**modding-relevant subset** scope (not exhaustive 39-type).

## Bounded goal
Validate every mod file type a modder actually creates/patches against its REAL game schema, and
make "unknown X" reference checks comprehensive — using the unpacked game at
`F:\Downskies\x4unpackersuiteV1\X4 unpacked 9.00` (39 XSDs in `libraries/`, 9,884 corpus XMLs).

## Reconcile (verified 2026-07-15)
- Today loads ONLY `md.xsd`+`common.xsd` (MD) + harvested `aiscripts.xsd`; schemaFiles is
  HARDCODED `['md.xsd','common.xsd']` (server.ts config + `loadCurrentSchemaLibrary`).
- `loadSchemaLibrary` (src/lib/xsdParser.ts) is MD-shaped (events/conditions/actions/controlFlow).
- `validateXmlAgainstSchema` (src/lib/xsdValidate.ts) already validates an XML against a
  SchemaIndex with a `domain` + `references` — the generic seam to reuse per file type.
- Reference sets (`getReferenceSets`, server.ts ~1353) cover only macros/wares/factions, derived
  from `getObjectIndex` (SQLite-cached corpus walk, ~17k rows today).
- B45 already lets the schema folder point at the unpacked `libraries/` and loads a richer md.xsd
  (402 events/807 actions) — the loader is the next constraint.

## Subset file types (Ken's scope)
MD (`md/*.xml` → md.xsd) · AIScripts (`aiscripts/*.xml` → aiscripts.xsd) · wares
(`libraries/wares.xml` → libraries.xsd) · jobs (`libraries/jobs.xml`) · factions
(`libraries/factions.xml` → factions.xsd) · gamestarts (`libraries/gamestarts.xml` →
gamestarts.xsd) · god/sectors (`libraries/god.xml`, `maps/**` → objectspawn*/region_definitions)
· t-files (`t/*.xml` — page/entry structure) · ui (`ui/**` → addon/coreaddon.xsd) ·
macros/components (referenced, not usually authored → reference sets).

## Phases (each ≈ one focused session; checkpoint between)
1. **Multi-schema loader.** New schema registry that discovers + loads ALL `*.xsd` in the schema
   folder, keyed by root element/domain (not the 2-file hardcode). Keep the existing MD
   SchemaLibrary shape for back-compat; add a per-domain index map. Oracle: load the unpacked
   `libraries/`, assert N domains parsed, md still 402/807. `GET /api/agent/schema-registry`.
2. **File→schema routing.** A path→domain map + a validator that runs `validateXmlAgainstSchema`
   with the right domain index per generated/imported file; wire into `runSchemaValidation` +
   `project/validate`. Oracle: a deliberately-malformed wares/jobs/factions file FAILS; a
   vanilla-shaped one passes. Negative path is the acceptance.
3. **Full-corpus reference sets.** Extend `getObjectIndex` to index every subset entity type from
   the unpacked ROOT (components, wares, factions, jobs, sectors, gamestarts ids, t-file page/entry
   ids); extend `getReferenceSets` accordingly. Cache in the existing SQLite store; watch build
   time (9,884 files). Oracle: reference set counts per kind; an unknown ware/faction/job flagged.

## Acceptance contract (per phase)
Each phase: pure engine + oracle (house pattern) + endpoint; tsc/lint/precommit/e2e green; the
NEGATIVE path (malformed file rejected / unknown ref flagged) is the real proof; ground every new
lint against the real corpus (do NOT invent rules — the project has falsified intuition-lints
before). Performance: corpus indexing must stay cached (SQLite) and not block validation.

## Risks
Touching the schema/validation core can introduce cry-wolf false positives (the #1 historical
failure mode here — see xsdValidate enum-merge, `parent`-keyword falsifications). Mitigate: every
new schema/domain validated against the vanilla corpus for zero false errors before shipping; keep
new checks WARNING-severity until corpus-proven; MD path unchanged. Rollback = revert per phase.

## Not doing (out of subset scope)
The ~29 rarely-modded schema types (voicesequences, material_library, region_lodvalues, effects,
colors, sound_library, audiologs, …). Loader still parses them (cheap); routing/refs skip them
until demanded.
