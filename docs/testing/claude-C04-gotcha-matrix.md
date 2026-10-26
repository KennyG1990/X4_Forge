# C04 validation and gotcha scope

This matrix distinguishes validation support from X4 execution proof. Test outcomes are recorded
in claude-C04-validation.json when the unit closes. No game was operated in this unit.
The source incident list is Claude's x4-engine-gotchas.md, frozen for this run; its historic
"no gate catches Lua syntax" statement is superseded by current full-file parser evidence.

## Concrete validation cases

| Case | Authority and test boundary |
| --- | --- |
| transporttag, waretransport, nested cargo.free selectors | Actual libraries/scriptproperties.xml; known paths pass, fabricated path warns |
| ware.id/name on an object | Property read is not a root ware literal; fabricated literal ware.id/name still warns |
| get_safe_pos | Actual aiscripts.xsd/common.xsd and vanilla use; independent lxml positive and unknown-action/attribute negative controls |
| Existing listeners | Actual XML tree/entity decoding; comments/CDATA do not count; true literal absence still fails |
| Registrations and aliases | Immutable local alias and one unconditional forwarding call supported; mutated/ambiguous/dynamic/prefix-only evidence explicitly unverified |
| Large Lua files / 33 files | Full parser, tail registration and syntax failure, all file counts; no claim every dynamic UI operation is verified |
| Button text complex property | Vanilla helper.lua model plus existing button-text suite, setter/structured-table recovery and unsupported dynamic values |
| ui.xml | Existing source-domain/manifest integrity proof; never treated as Lua; referenced-file and preservation negatives retained |
| products? | Prior station probe #635 plus corpus products=warelist/pseudo=true; advisory only, counts replacement, XML/MD quoting and decoy negatives |
| Existing pitfalls | Retain one-shot root UI listener, keyword offer-accepted cue, union-aware param3 barekey and cancel_conversation target rules, with existing exclusions |

## Every recovered gotcha: disposition, not a blanket correctness claim

| Incident / request | Disposition |
| --- | --- |
| New MD file not registered by refreshmd | Runtime lifecycle; C07 must prove capability/postconditions. Not inferable from a file's syntax |
| Refreshmd does not rerun completed cues | Runtime state; C07. No static claim that a cue has executed |
| Root check_value versus event condition | Unsupported general lifecycle/condition inference here; do not ban normal condition-driven cues from an incident shorthand |
| Mixed param3/param source, truthy empty table | Mod-specific payload/data-flow semantics; unverified. Existing exact indexed-payload checks remain bounded |
| Non-instantiated load setup fires once | Runtime lifecycle; broad no-instantiate heuristic was falsified by vanilla. Existing narrowly scoped UI listener rule only |
| Repeated signal requires appropriate listeners | Existing cue/library target and UI listener checks cover named shapes; repetition and runtime cue state unverified |
| Integer division truncation | General MD expression semantics unverified; do not flag intentional integer arithmetic as a mod error |
| Prefer faction/ship engine properties to maps | Corpus property checks tested; design quality or completeness of author maps is not validation |
| delay inside actions | Game XSD negative control; legal wait/cue delay remain separate |
| Apostrophe after XML entity decoding | General MD expression grammar not certified. Products advisory uses DOM decoding and string exclusion; that is not a general string parser |
| Inline elseif | General MD expression grammar unverified; no universal parser-correctness claim |
| Time literal units such as 45sec | General expression/type execution unverified; no guessed unit allowlist added |
| Combining @ and ? | General expression grammar unverified; no broad regex ban over literals, XML or unrelated operators |
| Faction display-name stringification | Runtime value/formatting; named test-mod probes in C07, not static syntax |
| Claimed four-key event payload limit | RETRACTED by source record; explicitly excluded. No payload-size heuristic added |
| Lua syntax and invalid escapes | Full-file Lua parser and tail-negative controls; former claim that Forge is blind is obsolete |
| Lazy JSON module initialization | Mod-specific initialization/data flow; unverified, not a global ban on JSON handlers |
| Save load re-executes UI Lua | Runtime lifecycle; C07 game test required |
| Callback upvalue limit | Compiler/runtime resource limit not certified by the AST syntax parser; unsupported coverage |
| find groupname accumulates | common.xsd describes append behavior; intent/initialization is data-flow dependent, so no noisy blanket warning |
| Defence drone is ship_s/unit | Corpus classification is not proof that every mod's fleet filter is wrong; domain-specific filter semantics unverified |
| Dynamic MD table key needs appropriate key type | General dynamic expression semantics unverified; existing param3 barekey rule covers its narrow observed case only |
| Newly added toggle absent after refreshmd | Mod state/save migration plus runtime lifecycle; C07, no default-on/off policy invented |
| API discovery FATAL/retry and source-to-target parity | Existing exact-byte deploy/identity guards; API availability does not prove deployment. C06 wider API census remains open |
| Log spans save loads and abandoned timelines | Existing synthetic freshness protocol; real A-to-B save proof belongs to C07 |
| Byte-cut UTF-8 sent to MD/save | Newly recovered #62/#832 incident; arbitrary text-flow/save validity is unverified. No game/save mutation or repair in C04 |
| Console/focus timing, log sweep and zero-UI probes | Operator/runtime concerns; no keyboard fallback. C07 owns paired helper and explicit completion evidence |

Bounded completion means the concrete validator regressions above have executable evidence and
unsupported behavior is named, not that every row has acquired a new static rule. The station
probe is prior user-project evidence, not a fresh observation or a universal pseudo-type theorem.
