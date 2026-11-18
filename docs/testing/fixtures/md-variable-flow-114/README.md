# Mission Director variable lookup fixture for #114

This standalone extension writes only local cue variables and debug markers. Only Claude installs, drives X4 and cleans up. Use the exact three payload files pinned by SHA256.json and the successor batch on the existing Agent Board row.

## Install and observation window

At the next permitted cold restart with deploy lock free, require forge_qa114_md_variables absent, verify source hashes, install only that folder and verify every installed path/hash. Use a disposable fresh Young Gun game and fresh debug log, with no campaign load or save. Record X4 version/build and enabled extensions. Retain the log through player control plus 120 seconds.

The NamespaceOwner parent now delays1s so its two child completion listeners have a chance to activate. Each child logs an unconditional ENTRY before any lookup. Keep the actual game result separate from this scheduling hypothesis.

## Required evidence

Require exactly one occurrence of each original positive/control marker:

- FORGE_MD114_CONTROLS_BEGIN and FORGE_MD114_CONTROLS_END
- FORGE_MD114_PRIOR_OK, FORGE_MD114_GUARD_OK, FORGE_MD114_SUPPRESS_OK, and FORGE_MD114_LITERAL $Qa114Quoted
- FORGE_MD114_STRICT_LOADED, FORGE_MD114_NAMESPACE_OWNER_OK and FORGE_MD114_INHERITED_OK
- FORGE_MD114_REMOVAL_VALUE_OK and FORGE_MD114_REMOVAL_ABSENT_OK

Also require exactly one FORGE_MD114_INHERITED_ENTRY and FORGE_MD114_OWN_ENTRY. The owner marker must precede both child entries. INHERITED_ENTRY must precede INHERITED_OK; this equality result is the positive witness for inherited41. The unconditional owner marker proves only that its action line ran. Any inherited error or INHERITED_UNEXPECTED is an unresolved positive control.

Require one BEFORE per strict case, followed by its exact missing-variable diagnostic in the named cue. Capture raw chronology and record whether its optional AFTER appears; LATER_AFTER follows the later write.

| Marker prefix | Cue in ForgeQa114Strict | Expected missing variable |
| --- | --- | --- |
| FORGE_MD114_UNSET | ReadUnset | $Qa114NeverWritten |
| FORGE_MD114_LATER | ReadBeforeWrite | $Qa114LaterWrite |
| FORGE_MD114_REMOVED | ReadAfterRemoval | $Qa114Removed |
| FORGE_MD114_OWN | ReadOwnNamespace | $Qa114NamespaceValue |

For the own-namespace case require OWN_ENTRY -> OWN_BEFORE -> exact missing $Qa114NamespaceValue diagnostic in ReadOwnNamespace. Record whether OWN_AFTER follows; it remains a continuation observation. Preserve the original inherited/default namespace versus explicit namespace=this experiment and all three other strict negatives.

Root cues may interleave. Keep CONTROLS_BEGIN before its controls and CONTROLS_END after them. Keep raw markers/errors in chronological order; grouped marker and error lists cannot prove BEFORE-to-error ordering.

Missing/repeated required marker, missing child ENTRY by player-control+120s, SKIP, UNEXPECTED, fixture parse/load fault, positive-control error or missing/ambiguous strict diagnostic leaves the affected case unresolved. Do not count a child that never entered as a namespace verdict. Post per-case raw results on [#114](https://github.com/KennyG1990/X4_Forge/issues/114) and return VERIFIED or FIX on the existing board row.

## Cleanup

Exit without saving. After X4 closes, the existing batch runner verifies exactly the three installed paths and hashes before removal. Refuse drift, extra files or links. Only Claude removes the verified folder and confirms absence. Source fixture files stay pinned while the request is READY.
