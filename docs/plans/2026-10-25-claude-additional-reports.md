## Additional Claude reports — 2026-10-25 (A01-A17)

Status: SPECIFIED / OPEN. Source: Ken's pasted Claude session review. These reports and engine conditions are attributed to Claude; they have not been independently reproduced in this intake. Existing C01-C04 proofs remain historical bounded evidence, not coverage of these new cases. The expanded validation/diagnostic scope is open again. No implementation, real-mod edit, save scan, test-command execution, game action, publication or installation is authorized by this documentation-only intake. Kimi stays paused.

### A01 — Blocked-deploy diagnostics

Mapping: C06; original 1/2/5.

C06a disposition: PARTIAL. Forge response/Playtest now exposes every blocker and a source-bound acceptance request with required reasons. Actual refusal/acceptance/receipt/stale-source tests pass. The active mod's deploy.py truncates displayed stage detail to90 characters; client console integration remains OPEN and untouched. Evidence: `../testing/claude-C06-api.json`.

Reported: RESULT: NOT DEPLOYED reported only "1 unaccepted mod finding"; identifying it required opening validate_ws_result.json.

Acceptance: Print every blocking finding inline: code, file, line, message and stable identity, plus the actual supported acceptance command with a required reason where policy permits acceptance. Non-overridable blockers explain that boundary. Prove refusal and acceptance against the same source/receipt; no acceptance bypass.

### A02 — Conditional MD event names

Mapping: C04 supplement; original 3.

Reported: raise_lua_event name="if $x then 'AIChat.search_report' else 'AIChat.recon_report'" was treated as one literal event and raised md_lua.missing_register although both registrations existed.

Acceptance: Resolve each statically literal if/else branch to its possible event names. Test both registered, one genuinely absent, nested/quoted forms and mixed dynamic branches. Other runtime construction is explicitly unverifiable, not a fabricated missing-register error. Preserve precise known-branch diagnostics.

### A03 — Warning identity survives line movement

Mapping: C03/C05 supplement; original 9.

Reported: The same 12 warnings repeatedly appeared as "12 new, 12 resolved" after lines moved.

Acceptance: Use file + code + semantic source reference + enclosing cue/function, excluding line numbers from identity. Keep current location as display metadata. Test inserted lines/unrelated edits, duplicate contexts, changed expression, new warnings and real resolutions. Stable identity must not silently reuse approval after relevant evidence changes.

### A04 — Fidelity output after refused deployment

Mapping: C06; original 5/6.

C06a disposition: OPEN, owner identified by read-only source inspection. The exact alarm is the active mod's unconditional deploy.py fidelity block. Forge prewrite refusal adds `deployment.state:not-deployed` and `fidelityScope:none`; helper integration and partial-write cases remain outstanding. No active-mod edits.

Reported: A NOT DEPLOYED run printed "THE DEPLOYED LUA IS NOT THE ONE YOU BUILT" (760228 vs 746022 bytes), comparing the previous deployment.

Acceptance: Suppress current-deployment fidelity alarms when no write occurred, or clearly label the comparison "previous deployment" with its identity/time. Prove refused, preview, successful and partial/failed-write outcomes. Reconcile Forge response versus project deploy.py formatter before choosing the fix owner.

### A05 — Windows console encoding

Mapping: C06; original 5.

C06a disposition: RESOLVED / VERIFIED locally for the reported stage text (not published or installed). The exact Forge skipped-stage string is ASCII and passed Windows CP437/CP1252/UTF-8 stdout and redirected-byte checks. No global ban on Unicode or native terminal screenshot claim. Evidence: `../testing/claude-C06-api.json`.

Reported: Stage text appeared as "Not reached � fix the failure above first".

Acceptance: Use ASCII stage text or explicitly configured UTF-8 output; test Windows console and redirected output without replacement characters. Trace Forge versus deploy.py formatting ownership; do not modify the real mod during intake.

### A06 — CRITICAL: corrupt-save detection and UTF-8 scan

Mapping: C07 logs plus read-only save-check capability; original 11/17.

Reported: Claude reports Lua :sub() split a multi-byte character; invalid bytes reached the save, and libxml2 discarded AiLive state on load with only "LIBXML2 ... error 81: Invalid bytes".

Acceptance: Flag the load-time line as critical, attach the actual save identity when known and explicitly unknown otherwise. Provide read-only "scan this save for invalid UTF-8" with byte/location evidence and supported-format limits. Use intact/corrupt synthetic or disposable save fixtures, truncation/chunk-boundary cases and old-session negatives; never silently repair a save. OPTIONAL: narrowly warn when string.sub/:sub output flows into AddUITriggeredEvent without a proven UTF-8-safe helper; dynamic flow remains unverified, not assumed safe.

### A07 — New-file reload guidance

Mapping: C06 deploy diff + C07 runtime; original 10/17.

Reported: Reported trap: /refreshmd does not register a new MD file; a save load is needed. A newly listed Lua file in ui.xml can load with /reloadui.

Acceptance: Compare the newly deployed manifest with the previous successful deployment. For added MD files say "new MD file: load a save, /refreshmd is not enough"; distinguish newly registered Lua and /reloadui guidance. Test add/edit/remove/first deployment and refused deployment without falsely implying a reload happened. Ground reload behavior in corpus and coordinated game proof.

### A08 — MoveWait needs timeout

Mapping: C04 supplement; original 17.

Reported: Claude reports MoveWait never ends without a timeout parameter, so queued work behind it never starts.

Acceptance: Establish the actual MoveWait definition/call contract and timeout conditions in authoritative source and a bounded probe. Test missing, supplied and dynamic timeout cases; do not generalize unrelated wait commands.

### A09 — Destroyed-ship pilot lifetime

Mapping: C04 supplement; original 17.

Reported: Claude reports vanilla ejects a ship pilot before event_player_owned_destroyed; event.param.pilot is null for the destroyed ship, but non-null for a space suit's own destruction. A pilot-conditioned cue silently missed a whole raid. The golden-book record reportedly says otherwise.

Acceptance: Verify event/object distinction and execution order against vanilla and a bounded reproduction. Test destroyed-ship versus space-suit contexts and unrelated pilot reads. Correct the specific golden-book entry only after locating it and establishing contrary evidence.

### A10 — Rescue docking requirements

Mapping: C04 supplement; original 17.

Reported: Claude reports RescueShip/RescueInRange require a docking bay that fits the suit; S and XS ships cannot pick anyone up.

Acceptance: Ground the capacity/compatibility condition in the implementation/corpus and a bounded probe. Test compatible bay, no/incompatible bay and unresolved target. Avoid turning reported size observations into an unverified universal size rule.

### A11 — NPC versus control-computer entities

Mapping: C04 supplement; original 17.

Reported: Ship entities such as "Ship Trader Computer" are not people; handing something to a person needs an isclass.npc check.

Acceptance: Verify person-target operations and class guard semantics; cover NPC, computer, guarded and dynamic cases. Do not warn on every entity use or infer intent solely from variable names.

### A12 — Property reads misclassified as references

Mapping: C04 supplement; original 3.

Reported: macro "name", macro "id" and ware "averageprice" were reported as unknown references although they were property accesses.

Acceptance: Separate typed property accesses from root literal IDs using actual scriptproperties/vanilla authority. Test these three cases plus genuine unknown macro/ware literals; do not just allowlist these words.

### A13 — Nested-brace property scope

Mapping: C04 supplement; original 3.

Reported: The chain .cargo.free.{ware.{$x}}.transporttag warns and even suggests transporttag itself, indicating a reported scope error.

Acceptance: Reproduce the exact nested selector and resolve the receiver after the braces correctly. Test known property, fabricated property, deeper nesting and malformed delimiters against the actual game property model. The suggested-cause diagnosis remains a hypothesis until reproduced.

### A14 — X4 Lua globals

Mapping: C04 supplement; original 3/4.

Reported: Color and GetCurRealTime were reported undefined although Claude identifies them as X4 globals.

Acceptance: Confirm and derive supported globals from authoritative vanilla/engine references; test Color/GetCurRealTime, local shadowing and a genuinely undefined symbol. Record corpus/version provenance and unavailable-reference limits.

### A15 — Project behavior gates in the verdict

Mapping: C06 verification/deployment contract; new capability extending original 5/6.

Reported: The mod runs about 20 Python behavior gates through deploy.py, outside Forge's validated verdict.

Acceptance: Let a project register explicit test commands; a combined verified result requires Forge checks and all required project gates to pass on the exact source snapshot. Record command identity/version, exit status, bounded output and receipt linkage. Test fail, timeout, missing runner, source change and untrusted/unauthorized registration; execution must use an explicit authorized project trust boundary, never arbitrary commands taken from imported mod text.

### A16 — Keyboard-free reload: concrete focus failures

Mapping: C07, existing #14/#35; original 10.

Reported: F11 console typing failed four times: Chrome stole focus; the first click after /refreshmd did not focus input; Return went to Explorer; wrong-window keys left X4 in external view.

Acceptance: Retain the existing file-drop/IPC companion request requirement, pairing and receipt/postcondition proof. No keyboard fallback. Prove transport before claiming refresh/reload support; only use the coordinated game window.

### A17 — Current-save log tail at realistic scale

Mapping: C07, existing #14/#35; original 11.

Reported: debuglog reached 54 MB; game time jumped backwards on every load and old timelines were mistaken for current.

Acceptance: Return lines since the last established save load with save name/session identity, bounded reading and rotation/truncation handling. Test a 54 MB fixture, repeated/backward timestamps, unknown save identity, save A-to-B and old corruption lines. A timestamp reversal alone is evidence of uncertainty, not proof of a named save.

### Scope and ownership

Tracking policy (2026-10-26): retain every complaint as an active bug or feature until its own
acceptance passes. GitHub #20 and the corresponding Notion task carry an unchecked A01-A17
checklist. Resolve/check each case in the same delivery as its exact evidence and local commit;
track published/installed separately. Parent programs remain open for incomplete cases. Earlier
C01-C04 proof never silently resolves these later reports. No case is resolved by this docs commit.

Retain original inventory 1-17; A01-A17 are traceable follow-up cases, not replacement numbering. Reuse GitHub #20 and the existing Notion safety task as the intake owner; runtime work remains linked to #14/#35. Reconcile exact code/project ownership before creating any independently executable child task. C03 line-stable identity, C04 added validation cases, C06 diagnostics/project gates and C07 save/reload work all remain open until their own evidence exists. C05's existing benchmark contract is unchanged; this intake does not start or reorder implementation. Critical priority is recorded for A06.

### Intake record

Lane LIGHT (documentation only). Plan: preserve every reported trigger/condition, map to existing complaints/units, synchronize existing records, read back. Baseline: clean release worktree at 89b1d86057886826b87a0420a71a85da75add14a; public/installed versions not inspected or changed. Reconciliation: existing complaint inventory, C04 gotcha dispositions, completion plan, GitHub #20 and Notion task/hub; no capability-map delta, no new implementation claim. Rollback: remove only this intake's documentation delta. Validation: 17 unique case IDs, all mappings/acceptance text present, exact code examples retained, diff whitespace check and connected-page readback. Close: VERIFIED for intake only; all requests remain SPECIFIED/OPEN. AAR triggered: Notion auto-linked dotted identifiers in prose. Readback detected altered event/selector examples; literal report blocks replaced the affected prose and were read back again. Sustain exact example checks; use literal code blocks for source snippets. No implementation or runtime risk delta. Documentation is saved locally; no code commit or release is claimed.
