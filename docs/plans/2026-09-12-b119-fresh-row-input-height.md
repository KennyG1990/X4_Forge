# B119 usable fresh-row Input insertion

Goal: a modder can add and edit an Input on a new row and actually see it without writing Lua.
Lane: FULL. Status: VERIFIED (bounded repair). Owner: existing B119 #41. Full goal ACTIVE / PARTIAL.
Previous goal turn: PROGRESS (six-case proof, default label repair, visible defect identified).

PLAN / RECONCILE
- Bounded owner: F:/DEV_ENV/X4_Forge/src/lib/x4UiSourceEdits.ts widgetInsertionPayloadFor.
  Reuse exact existing insertion/parse/owner/CAS/history machinery. Source remains canonical.
  Tests: its .selftest.ts and tests/e2e/x4-ui-source-editor.spec.ts; no other product owner planned.
- Actual final screenshot/Lua: test-results/b119-authoring-journeys-20260912/browser-final-artifacts/
  x4-ui-source-editor-Source-f3dda-across-fresh-same-menu-rows-chromium/. Input has only defaultText;
  fresh row displays a cyan line. Populated-row Input works because another cell establishes height.
- Shipped helper.lua authority: ui/addons/ego_detailmonitorhelper/helper.lua in configured 9.00 corpus.
  widget height0 (3106), editbox inherits cell (3234-3246), cell:getHeight5390-5401 only auto-sizes text
  or empty cell; editbox:getHeight5973-5982 adds a minimum only with a displayed hotkey. row:getHeight
  5249-5264 takes maximum cell contribution. Existing LayoutKernel implements these exact rules.
  Helper.standardButtonHeight=25 at522; real helper search input10814 uses that explicit height.
- Approaches: invent renderer fallback (wrong game semantics); force a neighbour or ask user to author
  height in Lua (fails product intent); emit an explicit ordinary height for newly authored Input (chosen).
  Use literal25 rather than Helper expression: existing scalar inspector can edit it and aliases/scopes
  need no additional global Helper binding. This is a starter-authoring choice, NOT an engine default.
- Existing SourceEdits ownership/ledger machinery is retained, not replaced. Its guarded single-call
  insertion already handles source locality/escaping/refusal; adding one static property needs no parallel
  writer or schema. Graph oriented LayoutProgram/Scene relation; no renderer edit justified.
- Scope: new palette-created Inputs only, both fresh/populated rows. Append height=25 to same creator.
  Do NOT rewrite old/imported inputs, change kernel height, table/frame dimensions, scale/font rules,
  row insertion, source history, numeric oracles, runtime samples, or external confirmation.
- Acceptance: real fresh-row Input has usable selected bounds and neutral-light text pixels, changes
  visibly on ordinary default-text Apply, preserves all source siblings/XML and exact single-literal edit.
  Controlled producer selftest must show fresh row/cell height25, encoded height scalar25, and exact
  creator ownership. Existing heightless source must still project height0/row1 unchanged (negative).
- Tests first: extend existing sequential New-menu source-owner test and same-menu browser test with
  real canvas-content mask (reuse sampleNeutralLightMask, not CSS/chrome/DOM text). Record fail-first
  on untouched SourceEdits, then add the one property and update exact standalone Input source oracle.
- Required gates: full SourceEdits selftest, full mounted SourceEditor selftest, whole tsc, strict exact
  three-file lint, original six-case rendered suite on3200/3201/workers1/60s/trace/zero-flake policy,
  actual final images and independent source/row-height/mask artifacts; full diff review/Graphify update.
  SourceEdits unit corpus is controlled synthetic evidence; browser uses real byte-verified corpus.
- Baseline numeric Scene/Pipeline/Paint reds remain mandatory broader work; no changes to those owners
  or counts. Full E2E/precommit/package/installed/native3menus/12references remain unclaimed.
- Risks: hard-coded authoring choice confused with engine default; source tests silently loosened;
  colored diagnostics mistaken for input text. Document provenance, preserve exact insertion oracle,
  require existing neutral-light inner mask and different post-edit mask, inspect actual image.
- No new network/spend/delete/security/config/Git/release/install/mod/game/save surface. Keep Antigravity
  visible; rendered tests already authorized. Real mod/config/install gates unchanged. No workers.
- Rollback: only this unit's three-file hunks against exact .before copies in
  test-results/b119-fresh-row-input-20260912/; preserve all earlier dirty work.

BASELINE
- 2026-09-12T12:08:58Z: HEAD93c9af111d63ca77c99dee11f21882c4073bcda6;46pins/19guards unchanged,
  no runners,3200/3201free,Deckwright3100PID30164 unchanged. Prior six-case verdict PASS6/6,0flakes.
- Current helper/kernel source supports heightless-row hypothesis; execute fail-first to prove consumer.
  Read recall hit: old July conversation overlap review, not this defect; no solution inferred from it.
- Original full brief/approved canvas-first plan remain canon. ADR-F1/F5/capability map unchanged.

IMPLEMENT / VALIDATE / REVIEW / CLOSE / AAR
- Pending. No visual success claim from source inspection. No external capability-map/issue/wiki write.
- AAR already non-clean: initial oversized instruction/search output required bounded rereads;
  guessed x4UiLayout.ts absent (actual owner x4UiLayoutProgram.ts). All required instructions reread.
  Sustain current evidence/faithful helper rules; avoid speculative renderer repair.
- Fail-first SourceEdits exit1: exact new assertion, cell height0/row1/kernel0. Initial new catalog
  lookup used wrong field ownership; corrected to provenance.callName/fields and actual
  semantics.properties.height before product change. Existing source owner untouched during fail-first.
- Real browser fail-first exit1:0passed/1failed/0flaky; BOTH attempts fail existing inner-mask helper
  with Input native content crop empty/invalid. Saved inserted screenshot actually inspected: cyan
  line, absent Input. Complete structured verdict/treeGone,46pins/19guards stable,3100untouched.
- [REPRODUCED] heightless palette Input uses faithful zero-height Helper rules; empty sibling gives
  row1. One existing payload now appends ordinary literal height25; standalone exact-source oracle
  updated to that exact call. No renderer/kernel/imported-source alteration.
- First product selftest run stopped at an older explicit omission assertion in BOM Input test.
  Reconciliation amendment: that assertion must now require literal height25, not be removed; same
  creator/source/CRLF/CAS checks retained. Heightless imported-source negative remains separate.
- Final full SourceEdits PASS170/170 (all earlier168 plus fresh height and imported heightless controls),
  full mounted SourceEditor exit0, whole tsc0, strict3file lint0, pre-unit complete diff/whitespace reviewed.
  Graphify AST exit0,11522nodes/29037edges/349communities,5000-node HTML guard retained.
- Fresh-eye review: exact source serializer change only; escaping, scopes, CAS and actor authority are
  untouched. Old BOM omission check now asserts25; no test deleted. Real mask ignores colored diagnostics
  and CSS selection. Automated reviewctl unavailable, checked. No unrelated production-file churn.
- Final six-case run TERMINAL exit0,PASS6/6,0flakes,1.9min,all terminal,unchanged60s case limits.
  Actual inserted AND edited screenshots inspected: fresh-row Input visible and text changes correctly.
  Native inner mask573->785 neutral-light pixels, same278x24crop, different mask signatures.
- Independent authoring verifier PASS:3row recoveries,14history checkpoints/9exact inverses,
  11movement checkpoints/8exact inverses. Input verifier PASS: exact previous real same-menu Lua plus
  only height25, text masks positive/changed, safety/verdict intact. Sources/artifacts in receipt.json.
- Final safety12:23:39Z:46pins/19guards stable,zero added/deleted,HEAD unchanged,treeGone,0runners,
  3200/3201free,Deckwright3100PID30164 unchanged. No release/install/Git/real-mod/config/external writes.
- CLOSE VERIFIED for this explicit insertion repair; all9journeys/numeric/scenarios/full/native gates
  still required. Height catalog editability is proven; no new primary-height manipulation claimed.
- AAR: old omission oracle corrected explicitly, not deleted. Later optional PowerShell regex quoting
  error also banked; bounded literal lookup used. Repeated avoidable lookup/schema mistakes triggered
  degradation checkpoint after all verification. Fresh continuation before another change.
- Commit point: fix(ui): give newly inserted Inputs a usable height (not committed; no interim push).
