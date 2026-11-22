# Reopen a Studio compile validation report without revalidating

**Owner** [#48](https://github.com/KennyG1990/X4_Forge/issues/48) under #74. **Status** SPECIFIED. **Lane** Full.

Current G candidate is based on 408f254. Project Validate's result ID checks a new validation run against previous evidence. The History blob is a redacted sample and the compile response uses a different field from its compactor. History retention also leaves uncollected blobs. Do not add full result writes or change that durability contract. Use a separate bounded process-local store for the exact validation verdict projection already returned by compile, excluding generated file contents. This is historical evidence, never current-source or deploy authority.

## Contract

- Compile keeps its existing behavior for callers that do not request retention. In an explicit, authenticated workspace, send header `X-Forge-Retain-Validation: 1`; reply includes `validationResult` with ID, content hash and expiry, or honest unavailability for oversized reports. Studio opts in for its addressed compile and carries the accepted reply's ID under the existing workspace/revision guard.
- `GET /api/agent/compile/result/:id` uses the current workspace authority and compile-level write or deploy scope. An opaque ID alone authorizes nothing. Unknown, expired, evicted and cross-workspace IDs share an unavailable response. There is no latest-result guess. No input files, accepted warnings, validation, history or deployment are changed on read.
- Keep the exact JSON projection of compile's verdict, validation, diagnostics and delta. Retain failures too. Use at most 16 entries, 24 MiB of report bytes, 12 MiB per report, and two minutes from capture. No disk storage. This bound allows comparable historical multi-MB reports without making them persistence artifacts. Evict oldest reports by bytes/count. No expiry extension on read.
- Keep all changes on G and run only focused checks while X4 is active. Roll back the new store, route, descriptor, opt-in caller, and display hunks independently.

## Verification

Prove exact successful and failed report replay, no silent recompute after disk edits, unchanged legacy compile behavior, byte/count/expiry bounds, and generic misses for malformed or different-workspace IDs. Prove actual compile and lookup in an isolated HTTP backend when practical. Run focused type checks and review generated capability authority, ensuring the new route is workspace-required and has no public read grant. Full precommit, installed UI proof and complete release remain separate.

## Verification and close

**Status** PARTIAL. The workspace-scoped production-mode backend passed 25 HTTP and isolation checks on the G fixture. Exact report bytes and claimed SHA-256 agreed. The report row re-opened after disk edits and newer compiles while preserving the original failed verdict and input origins. Authentication, another valid workspace, a read-only key, and a bound write key using the wrong workspace all failed closed. A correct workspace write key reopened the exact report. Legacy compile calls produced no retention handle.

The focused cache controls proved immutability, UTF-8 byte accounting, exact hash, oversize refusal, count and byte eviction, expiry, and miss after store recreation. The explicit lifetime is two minutes and the store is reset when the backend stops. Seven G TypeScript files checked with zero semantic errors. The actual component's static markup displayed the ID only for the current result and hid it during checking or local fallback. The existing Studio E2E case now compares its accepted response with the exact retrieved report.

The capability contract was reviewed and promoted with one new authenticated, workspace-required GET route and its descriptor. The 315 existing route dispositions stayed unchanged. The first generation run needed truthful disconnected UI states for both hosts. A preflight hash error stopped the first HTTP runner before it created files. The corrected run closed its Job and listener and removed 15,000,864 bytes of temporary artifacts. No durable reports were stored. Full rendered/browser validation, precommit, VSIX, and installed delivery remain pending. Suggested commit point after required gates is feat(validation): reopen exact compile reports.
