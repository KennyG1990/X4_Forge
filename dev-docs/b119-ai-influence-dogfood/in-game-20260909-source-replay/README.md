# B119 installed-Forge source replay and native X4 evidence

Status: PARTIAL. Overall B119 remains IN_PROGRESS / PARTIAL.

Boundary: this folder makes the observed 2026-09-09 installed-Forge source replay,
native X4 compact/expanded interaction, current-session log, and read-only
linter finding durable. It does not establish same-state pixel parity, design
parity, universal C++ acceptance, arbitrary Lua/Helper/widget coverage, or
completion of all twelve references.

## Artifact census

| Filename | Role | Source | Bytes | SHA256 |
| --- | --- | --- | ---: | --- |
| forge-preview.png | Installed Forge preview for the pending military-request branch | The specified path was absent; exact-hash match copied from F:\DEV_ENV\X4_Forge\.playwright-mcp\x4-ui-ui-addons-ai-influence-chat-aic-menu-lua-target-ui-addons-ai-influence-chat-aic-menu-lua-8390F0B0D5D51F95F7A4005D5F8A023A2A5F3646E9C578DE-2560x1440-effective-scale-1-4.png | 190509 | 497D340E9AB29F65BC52051587E3450A4BF612976355B578F45A81AC0A33E768 |
| native-compact.jpg | Native X4 compact ordinary communication-menu state | C:\Program Files (x86)\Steam\userdata\20076855\760\remote\392160\screenshots\20260909053919_1.jpg | 328293 | 6A738BE3DEA8E1BE66BE630974543F7FA268BCBAAD43F5446EA26AAEAC356D32 |
| native-expanded.jpg | Native X4 expanded COMM state | C:\Program Files (x86)\Steam\userdata\20076855\760\remote\392160\screenshots\20260909054051_1.jpg | 280648 | F4F192A371C09A4DAACCB31E5CA589826DB4B19AD3EBAD68EF3A350E4D099BAA |
| design-reference-1d.png | Supplied 1d design reference | C:\Users\Moshi\Desktop\# AI Influence mod UI design\design_handoff_ai_influence\screenshots\1d-gate-inline-proposal.png | 423932 | 195C20E272EF09AAF00D237C84FD18EB0EF60780EB0F06E39F01EC4F20AC25B9 |
| debuglog-current-session.txt | Current-session X4 log | C:\Users\Moshi\Documents\Egosoft\X4\20076855\debuglog.txt | 308232 | BCDEE4B4A56E4580DCAFCF95F73FBA4FD066DA4741AE54D2DCB78979D3750451 |

The user-supplied Forge preview path ended in ...9A62C8BD-... and was not
present. The adjacent file used above has the expected byte count and SHA256
exactly; no uncertain bytes were copied. The destination hashes were checked
after copying.

## Forge source/target/profile/input census

- Installed Forge replay selected ui/addons/ai_influence_chat/aic_menu.lua
  and target menu.display.
- Source SHA256: 8390F0B0D5D51F95F7A4005D5F8A023A2A5F3646E9C578DE8A98D6719A62C8BD.
- Forge profile: 2560x1440, effective scale 1.4.
- Replay retained seven branch arms, loop count 3, and 31 scalar samples.
- Apply retained the selected target.
- Exported PNG retained the state Not verified in game.

## Native visual observations and interactions

The Forge preview is the pending military-request branch. The native compact and
expanded captures are the ordinary current communication-menu state, not that
same scenario.

- Compact visibly shows NPC information, transcript, three choices, edit box,
  SEND, END, and expand/dossier/end controls.
- EXPAND opened the full-screen COMM view with correspondent and leverage
  blocks, three choices, edit box, and SEND.
- END closed the overlay/conversation.

Because these captures are different scenario states, no pixel comparison between
forge-preview.png, native-compact.jpg, native-expanded.jpg, and
design-reference-1d.png is valid. The native captures prove the tested source
pipeline rendered in X4; they do not prove parity with the pending 1d branch.

## Current-session log evidence

The retained log records the following exact lines:

| Lines | Observed evidence |
| ---: | --- |
| 427 | X4 engine diagnostic for extensions\x4_ai_influence\md\ai_influence_conversation.xml(98): Neither of the attributes 'actor' and 'template' is present! |
| 855, 858 | [AICHAT][UIX] onOpenCommLink and onOpenCommLink: X4_Terminal_Menu FOUND |
| 876 | [AICHAT][UIX] OpenMenu returned OK |
| 879 | [AICHAT][MENU] display ENTER Helper=true Color=true |
| 882, 885 | reserveScrollBar diagnostics: no variable-width column and insufficient space |
| 888 | [AICHAT][MENU] display DONE (invisible overlay) |
| 1059, 1062 | Two further reserveScrollBar diagnostics |
| 1065 | [AICHAT][COMM] display DONE cite=nil |

The current log has no Failed to set up the view marker and no stack
traceback. The native compact/expanded route rendered despite the MD semantic
error and the reserve-scrollbar diagnostics. This is evidence of linter/render
orthogonality for the tested state; it is not evidence that the semantic defect
is harmless or that the whole file/frame was accepted without issue.

## Linter receipt and column calibration

The fresh read-only real-mod receipt is in
x4validate-real-mod-receipt.txt. It records exit 1, the exact summary
families, and the exact MD finding at
md/ai_influence_conversation.xml:98.

The semantic finding must block clean validation. Its presence must not be
described as whole-file or whole-frame rejection because the tested native
compact/expanded route rendered and END closed the conversation.

The calibrated table rule is:

- literal 12: clean;
- literal 13-23: nonblocking warning and game-check, because official X4 9.00
  contains valid 13-column tables;
- literal 24+: blocking, based on the reproduced whole-frame incident.

This calibration does not claim that every table above 12 fails, nor does it
turn a warning or diagnostic into a universal engine law.

Retained focused validation milestones from the observed checkpoint are MD
pitfall selftest 22/22, project-validation selftest 7/7, UI linter 153/153,
history 21/21, targeted project E2E 7/7 on 3200/3201, typecheck green, and
scoped lint green. The CLI help follow-up is verified: help exit 0, missing
input exit 2, invalid folder exit 2, real human/JSON behavior unchanged, and
typecheck/lint/diff green. These are retained receipts, not a claim that this
records-only close reran every broad gate.

Retained mod-side gate observations are commgate 5 states/0 failures,
commfullgate 6/0, vocabgate 4 surfaces plus 1 value source clean, glyphgate
5 files/0, and LuaJIT syntax 14 files/0. Source/deployed menu, comm, sheet,
uix, md, commgate, and commfullgate hashes matched at the checkpoint.

## Observed versus inferred versus not proven

### Observed

- The exact Forge source/target/profile/input census above.
- The Forge preview and native compact/expanded artifacts have the exact
  recorded identities.
- The native compact and expanded interactions and the listed log lines.
- The read-only linter exit and exact semantic finding.
- The calibrated 12 / 13-23 / 24+ table treatment.

### Inferred or narrowly interpreted

- The displayed native states show that this tested source route rendered in
  X4 even while the semantic and reserve-scrollbar diagnostics were present.
- The linter is the clean-validation referee for the semantic defect; the log
  and screenshots do not support claiming whole-file or whole-frame rejection.

### Not proven

- Same-state Forge-to-X4 pixel parity or design parity.
- Any pixel comparison across the preview, native captures, and 1d reference.
- Universal C++ acceptance; arbitrary Lua, Helper, or widget coverage.
- Full twelve-reference completion or complete current-game visual census.
- That all table counts above 12 fail, or that this one diagnostic is a
  universal engine rejection rule.
- A repair of the real-mod MD defect. The real mod remains unchanged and
  requires a fresh write-gate paragraph and explicit authorization.

## Remaining gates

1. Keep the real-mod cancel_conversation defect open until Ken is awake and
   a fresh real-mod write-gate paragraph and explicit go authorize a separate
   source correction.
2. Run the full broad validation required by the parent task, including the
   current repository oracles, full E2E, and precommit where applicable.
3. Perform the parent-owned exact-path commit/push and read back the external
   GitHub, Notion, and Drive projections.
4. Separately gate and validate the MD source correction if authorized.
5. Continue the twelve-reference, arbitrary-Lua/Helper/widget, universal-C++,
   and same-state visual census work without promoting B119 beyond
   IN_PROGRESS / PARTIAL.
