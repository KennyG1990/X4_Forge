/** Native Mission Director navigation entry point. Authored parsing and binding live in the shared resolver. */
import { planMdRename, readMdDefinitionDocument, resolveMdDefinition, resolveMdReferences,
  type MdDefinitionDocument, type MdRenamePlan, type MdRenameSource } from "../../shared/mdScriptNavigation";
export { planMdRename, readMdDefinitionDocument, resolveMdDefinition, resolveMdReferences };
export { MAX_MD_DEFINITION_SOURCE } from "../../shared/mdScriptNavigation";
export type { DefinitionLocation, MdDefinitionDocument, MdRenameEdit, MdRenamePlan, MdRenameSource } from "../../shared/mdScriptNavigation";

/* ------------------------------------------------------------------ *
 * Selftest — run headlessly: npx tsx vscode-extension/src/langNav.ts
 * ------------------------------------------------------------------ */

export function runLangNavSelftest() {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, ...(detail ? { detail } : {}) });

  const doc = `<mdscript name="Setup" xmlns:xsi="x">\n  <cues>\n    <cue name="Start" instantiate="true">\n      <actions><signal_cue_instantly cue="md.Setup.Start"/></actions>\n    </cue>\n  </cues>\n</mdscript>`;
  const local = (value: string) => doc.replace('cue="md.Setup.Start"', `cue="${value}"`);
  const other = readMdDefinitionDocument("other.xml", '<mdscript name="Other"><cues><cue name="Start"/><library name="Template"/></cues></mdscript>')!;
  const find = (source: string, caret: string, siblings?: MdDefinitionDocument[]) => {
    const parsed = readMdDefinitionDocument("setup.xml", source, source.indexOf(caret) + caret.length - 2);
    return parsed && resolveMdDefinition(parsed, siblings);
  };
  const definition = find(local("Start"), 'cue="Start"', [other]);
  ok("bare_resolves_in_own_script", JSON.stringify(definition) === JSON.stringify({ file: "setup.xml", line: 2, column: 15 }));
  ok("qualified_uses_mdscript_identity", find(local("md.Other.Start"), 'cue="md.Other.Start"', [other])?.file === "other.xml");
  ok("unknown_script_does_not_fall_back", !find(local("md.Unknown.Start"), 'cue="md.Unknown.Start"', [other]));
  ok("matching_name_with_wrong_case_is_unsupported", !find(local("start"), 'cue="start"', [other]));
  ok("computed_keyword_and_property_references_do_not_jump", ["$Start", "this", "this.Start", "parent.Start", "md.Setup.Start.status"].every(value =>
    !find(local(value), `cue="${value}"`, [other])));
  ok("duplicate_explicit_script_is_ambiguous", !find(local("md.Other.Start"), 'cue="md.Other.Start"', [other, other]));
  const duplicate = doc.replace("</cue>", '<cues><cue name="Start"/></cues></cue>');
  ok("duplicate_nested_declaration_is_ambiguous", !find(duplicate, 'cue="md.Setup.Start"'));
  const ghost = local("Ghost").replace("<cues>", '<cues><!-- <cue name="Ghost"/> --><![CDATA[<cue name="Ghost"/>]]>');
  ok("comments_and_cdata_are_not_declarations", !find(ghost, 'cue="Ghost"'));
  const ordinary = local("Start").replace('<signal_cue_instantly cue=', '<debug_text text=');
  ok("unrelated_attribute_is_not_a_reference", !find(ordinary, 'text="Start"'));

  const expressionXml = (value: string) => ordinary.replace('text="Start"', `text="${value}"`);
  const expressionDoc = (value: string, needle: string) => {
    const xml = expressionXml(value);
    return readMdDefinitionDocument("setup.xml", xml, xml.indexOf(needle) + 2, false, { expressionDefinition: true })!;
  };
  const expressionTarget = (value: string, needle: string) =>
    resolveMdDefinition(expressionDoc(value, needle), [other], { allowExpression: true });
  ok("expression_go_to_definition_uses_exact_cue", expressionTarget("md.Other.Start == null", "Start ==")?.file === "other.xml");
  ok("expression_definition_refuses_quote_and_dynamic_selector",
    !expressionTarget("&apos;md.Other.Start&apos;", "Start&apos;") && !expressionTarget("md.Other.{$Start}", "Start}"));
  ok("expression_definition_decodes_entities_at_caret",
    expressionTarget("@md&#46;Other.St&#97;rt?", "&#97;")?.file === "other.xml");
  ok("expression_does_not_yield_unapproved_definition_or_references",
    !resolveMdDefinition(expressionDoc("md.Other.Start", "Start\"/>"), [other])
      && resolveMdReferences(expressionDoc("md.Other.Start", "Start\"/>"), [other], true).length === 0);
  const foreign = local("Start").replace("<actions>", '<actions xmlns="urn:foreign">');
  ok("foreign_namespace_is_not_a_reference", !find(foreign, 'cue="Start"'));
  ok("incomplete_authored_xml_has_no_target", !find(local("Start").replace("</cues>", ""), 'cue="Start"'));
  const library = doc.replace('<cue name="Start" instantiate="true">', "<cue name='Start' ref='md.Other.Templ&#97;te'>");
  ok("single_quote_and_entity_in_library_reference", find(library, "ref='md.Other.Templ&#97;te'", [other])?.file === "other.xml");
  ok("library_reference_cannot_target_plain_cue", !find(library.replace('Templ&#97;te', 'Start'), "ref='md.Other.Start'", [other]));
  const scoped = local("Inner").replace("</cues>", '<library name="Shell"><cues><cue name="Inner"/></cues></library></cues>');
  ok("library_subcue_cannot_be_named_by_ordinary_cue", !find(scoped, 'cue="Inner"'));
  const inside = scoped.replace('<library name="Shell">', '<library name="Shell"><actions><signal_cue cue="Inner"/></actions>');
  ok("library_subcue_resolves_for_own_library", !!find(inside.replace('cue="Inner"', 'cue="Absent"'), 'cue="Inner"'));
  const otherLibrary = readMdDefinitionDocument("library.xml", scoped.replace('name="Setup"', 'name="Foreign"'))!;
  ok("qualified_reference_cannot_target_foreign_library_subcue",
    !find(local("md.Foreign.Inner"), 'cue="md.Foreign.Inner"', [otherLibrary]));
  const inherited = local("Inner").replace("</cues>", '<cue name="FromLibrary" ref="Shell"><cues><cue name="Inner"/></cues></cue></cues>');
  ok("reference_instance_does_not_declare_ignored_child", !find(inherited, 'cue="Inner"'));
  const crlf = "\uFEFF" + local("Start").replaceAll("\n", "\r\n");
  ok("bom_and_crlf_keep_exact_destination", JSON.stringify(find(crlf, 'cue="Start"')) === JSON.stringify(definition));

  const one = [
    '<mdscript name="One"><cues>',
    '<cue name="Shared"/>',
    '<library name="Template"/>',
    '<cue name="Made" ref="Template"/>',
    '<cue name="Caller"><actions><signal_cue cue="Shared"/>',
    '<debug_text text="\'Shared\'"/><signal_cue cue="md.Two.Shared"/>',
    '</actions></cue></cues></mdscript>',
  ].join("\n");
  const two = [
    '<mdscript name="Two"><cues>',
    '<cue name="Shared"/>',
    '<!-- <signal_cue cue="md.One.Shared"/> -->',
    '<cue name="Caller"><actions><signal_cue cue="md&#46;One&#x2e;Shared"/>',
    '<signal_cue cue="Shared"/></actions></cue></cues></mdscript>',
  ].join("\n");
  const snapshot = (file: string, xml: string, anchor?: string) =>
    readMdDefinitionDocument(file, xml, anchor ? xml.indexOf(anchor) + anchor.length - 2 : undefined, true)!;
  const remote = snapshot("two.xml", two);
  const uses = (anchor: string, includeDeclaration = false) =>
    resolveMdReferences(snapshot("one.xml", one, anchor), [remote], includeDeclaration)
      .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  const first = [
    { file: "one.xml", line: 4, column: one.split("\n")[4].indexOf("Shared") },
    { file: "two.xml", line: 3, column: two.split("\n")[3].indexOf("Shared") },
  ];
  ok("references_scope_and_authored_name_positions", JSON.stringify(uses('name="Shared"')) === JSON.stringify(first));
  ok("references_can_start_on_a_use", JSON.stringify(uses('cue="Shared"')) === JSON.stringify(first));
  ok("references_include_declaration_on_request", JSON.stringify(uses('name="Shared"', true)) === JSON.stringify([
    { file: "one.xml", line: 1, column: 11 }, ...first,
  ]));
  ok("qualified_reference_selects_the_other_script",
    uses('cue="md.Two.Shared"').map(result => result.file + result.line).join(",") === "one.xml5,two.xml4");
  ok("references_on_library_instances_report_the_call",
    JSON.stringify(uses('name="Template"')) === JSON.stringify([{ file: "one.xml", line: 3, column: 22 }]));
  ok("quoted_expression_cannot_start_reference_lookup", uses('text="\'Shared\'"').length === 0);
  ok("duplicate_script_suppresses_reference_authority", resolveMdReferences(snapshot("one.xml", one, 'name="Shared"'),
    [remote, snapshot("other.xml", one)], true).length === 0);
  ok("duplicate_name_suppresses_reference_authority",
    resolveMdReferences(snapshot("one.xml", one.replace('<library name=', '<cue name="Shared"/><library name='), 'name="Shared"'),
      [remote], true).length === 0);
  const scopedUses = [
    '<mdscript name="LibraryScript"><cues><library name="Owner"><cues><cue name="Inner"/>',
    '<cue name="Listener"><actions><signal_cue cue="Inner"/></actions></cue></cues></library>',
    '<cue name="Outside"><actions><signal_cue cue="Inner"/></actions></cue></cues></mdscript>',
  ].join("\n");
  ok("references_respect_library_ownership",
    resolveMdReferences(snapshot("scope.xml", scopedUses, 'name="Inner"'), [], false).map(result => result.line).join() === "1");
  const schemaUses = one.replace('<signal_cue cue="Shared"/>',
    '<remove_offer cue="&#32;Shared"/><event_cue_cancelled cue="Shared"/><unknown cue="Shared"/>');
  const actual = resolveMdReferences(snapshot("one.xml", schemaUses, 'name="Shared"'), [], false);
  const useLine = schemaUses.split("\n")[4];
  ok("schema_cue_attributes_include_actions_and_events", actual.length === 2);
  ok("references_skip_encoded_leading_space",
    actual.some(result => result.column === useLine.indexOf("Shared")));

  const renameFile = "md/one.xml";
  const renameSource = "\uFEFF" + [
    '<mdscript name="One"><cues><cue name="Shared"><actions>',
    '<signal_cue cue="Shared" comment="Tell Shared to start"/><set_value name="$hint" exact="\'Shared\'"/>',
    '</actions></cue><library name="Templ&#97;te"/></cues></mdscript>',
  ].join("\r\n");
  const remoteFile = "md/two.xml";
  const remoteSource = [
    '<mdscript name="Two"><cues><cue name="Shared"><actions>',
    '<signal_cue cue="Shared"/><signal_cue cue="md.One.Sh&#97;red"/>',
    '</actions></cue><!-- Shared -->',
    "<cue name='Instance' ref='&#32;md&#46;One&#x2e;Templ&#97;te&#32;'/></cues></mdscript>",
  ].join("\r\n");
  const renameInputs = [{ file: renameFile, text: renameSource }, { file: remoteFile, text: remoteSource }];
  const plan = (newName: string, inputs = renameInputs, source = renameFile, word = 'name="Shared"') =>
    planMdRename(inputs, source, inputs.find(input => input.file === source)!.text.indexOf(word) + word.length - 2, newName);
  const apply = (result: MdRenamePlan, file: string, input: string) => {
    if ("reason" in result) return undefined;
    for (const edit of result.edits.filter(edit => edit.file === file).sort((a, b) => b.start - a.start)) {
      if (input.slice(edit.start, edit.end) !== edit.before) return undefined;
      input = input.slice(0, edit.start) + edit.after + input.slice(edit.end);
    }
    return input;
  };
  const cuePlan = plan("Renamed");
  ok("rename_cue_exact_spans_two_scripts", "edits" in cuePlan && cuePlan.edits.length === 3
    && apply(cuePlan, renameFile, renameSource) === renameSource.replace('name="Shared"', 'name="Renamed"').replace('cue="Shared"', 'cue="Renamed"')
    && apply(cuePlan, remoteFile, remoteSource) === remoteSource.replace('Sh&#97;red', 'Renamed'),
    "reason" in cuePlan ? cuePlan.reason : undefined);
  const libraryPlan = plan("NewTemplate", renameInputs, remoteFile, "Templ&#97;te");
  ok("rename_library_from_encoded_reference_preserves_instance_and_qualifiers", "edits" in libraryPlan && libraryPlan.edits.length === 2
    && apply(libraryPlan, renameFile, renameSource) === renameSource.replace('Templ&#97;te', 'NewTemplate')
    && apply(libraryPlan, remoteFile, remoteSource) === remoteSource.replace('Templ&#97;te', 'NewTemplate'),
    "reason" in libraryPlan ? libraryPlan.reason : undefined);
  const withAction = (action: string) => renameInputs.map(source => source.file === remoteFile
    ? { ...source, text: source.text.replace('<actions>', `<actions>${action}`) } : source);
  const capture = plan("Future", withAction('<signal_cue cue="md.One.Future"/>'));
  ok("rename_rejects_capture_of_previously_unresolved_reference", "reason" in capture && capture.reason.includes("binding"));
  const expression = plan("Renamed", withAction("<set_value name='$a' exact='md.One.Shared.$Value'/>"));
  ok("rename_refuses_unmodeled_property_use_in_single_quoted_xml", "reason" in expression && expression.reason.includes("unsupported use"));
  const dynamic = plan("Renamed", withAction('<signal_cue cue="$which"/>'));
  ok("rename_refuses_opaque_cue_operand", "reason" in dynamic && dynamic.reason.includes("cannot rename safely"));
  const collision = plan("Template");
  ok("rename_refuses_casefolded_collisions", "reason" in collision && collision.reason.includes("already declares"));
  ok("rename_refuses_structural_keywords", "reason" in plan("THIS"));
  const malformed = plan("Renamed", [...renameInputs, { file: "md/bad.xml", text: "<diff>" }]);
  ok("rename_refuses_uninspected_script_or_patch", "reason" in malformed && malformed.reason.includes("bad.xml"));
  const duplicatePlan = plan("Renamed", [...renameInputs, { file: "md/duplicate.xml", text: renameSource }]);
  ok("rename_refuses_duplicate_script_identity", "reason" in duplicatePlan && duplicatePlan.reason.includes("more than once"));
  const caseChange = plan("shared");
  ok("rename_accepts_unambiguous_case_only_change", "edits" in caseChange && caseChange.edits.length === 3);
  const qualifier = planMdRename(renameInputs, remoteFile, remoteSource.indexOf("md.One.") + 4, "Renamed");
  ok("rename_requires_caret_on_terminal_name", "reason" in qualifier && qualifier.reason.includes("script qualifier"));

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}

// Headless runner: `npx tsx vscode-extension/src/langNav.ts`
if (typeof process !== "undefined" && /(?:^|[\\/])langNav\.[cm]?[jt]s$/i.test(process.argv[1] || "")) {
  const r = runLangNavSelftest();
  console.log(`langNav selftest: ${r.passed}/${r.total} allPassed=${r.allPassed}`);
  for (const c of r.checks) if (!c.pass) console.log("FAIL", c.name, c.detail || "");
  process.exit(r.allPassed ? 0 : 1);
}
