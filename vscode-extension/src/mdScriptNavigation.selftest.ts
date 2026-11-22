
import assert from 'node:assert/strict';
import { navigateAuthoredMdScriptSnapshot as navigate } from '../../shared/mdScriptNavigation';
import { readWorkspaceScriptSymbols, searchWorkspaceScriptSymbols } from '../../shared/workspaceScriptSymbols';
import { runLangNavSelftest } from './langNav';
const old = runLangNavSelftest();
assert(old.allPassed, JSON.stringify(old.checks.filter(row => !row.pass)));
const src = 'md/Alias.xml';
const target = 'md/provider_does_not_match_name.xml';
const sourceText = '\uFEFF<mdscript name="Caller">\r\n<cues><cue name="Run"><actions>\r\n'
  + '<debug_text text="\u{1F680}"/><signal_cue cue=" md&#46;Provider&#46;Recl&#97;im "/>\r\n'
  + '</actions></cue><cue name="Instance" ref="md.Provider.Lib"/></cues></mdscript>';
const provider = '<mdscript name="Provider">\n<cues><cue name="Reclaim"><actions><reset_cue cue="Reclaim"/></actions></cue>\n'
  + '<cue name="Unused"/><library name="Lib"><cues><cue name="Nested"><actions>'
  + '<signal_cue cue="Nested"/></actions></cue></cues></library></cues></mdscript>';
const entries = [{ path: src, content: sourceText }, { path: target, content: provider },
  { path: 't/0001.xml' }];
const checks: string[] = [];
function check(name: string, actual: unknown, expected: unknown) {
  assert.deepEqual(actual, expected, name);
  checks.push(name);
}
const resolved = (locations: unknown[]) => ({ status: "resolved", locations });
const failure = (status: string) => ({ status });
const unavailable = (reason: string) => ({ status: "unavailable", reason });
function loc(file: string, text: string, textStart: string, needle: string) {
  const first = text.indexOf(textStart);
  assert(first >= 0);
  const offset = text.indexOf(needle, first);
  const lines = text.slice(0, offset).split(/\r\n?|\n/);
  return { file, start: { line: lines.length - 1, column: lines.at(-1)!.length },
    end: { line: lines.length - 1, column: lines.at(-1)!.length + needle.length } };
}
function query(needle: string, mode: "definition" | "references", options: {
  file?: string; text?: string; files?: typeof entries; includeDeclaration?: boolean;
} = {}) {
  const text = options.text ?? sourceText;
  const first = text.indexOf(needle);
  assert(first >= 0, needle);
  return navigate({ files: options.files ?? entries, path: options.file ?? src, offset: first + 1, mode,
    includeDeclaration: options.includeDeclaration });
}
const def = loc(target, provider, 'name="Reclaim"', "Reclaim");
const sourceRef = loc(src, sourceText, 'cue=" md', "Recl&#97;im");
const providerRef = loc(target, provider, '<reset_cue', "Reclaim");
const library = loc(target, provider, 'name="Lib"', "Lib");
check("aliased file definition with numeric entity qualifier and identifier", query("Recl&#97;im", "definition"), resolved([def]));
check("caret inside literal qualifier", query("Provider&#46;Recl", "definition"), resolved([def]));
check("references preserve raw ranges in the submitted CRLF and astral-character line", query("Recl&#97;im", "references"), resolved([sourceRef, providerRef]));
check("start from declaration and include declaration", query('Reclaim"><actions', "references", { file: target, text: provider, includeDeclaration: true }), resolved([sourceRef, def, providerRef]));
check("resolved unused declaration is distinct from missing", query('Unused"', "references", { file: target, text: provider }), resolved([]));
check("library instance resolves provider declaration", query("Lib\"", "definition"), resolved([library]));
check("library reference return range is terminal", query("Lib\"", "references"), resolved([loc(src, sourceText, 'ref="md.Provider.', "Lib")]));
check("cue reference does not escape the library", query('Nested"/></actions', "definition", { file: target, text: provider }),
  resolved([loc(target, provider, 'name="Nested"', "Nested")]));
const withNear = sourceText.replace("Recl&#97;im", "Nested");
check("qualified cue cannot escape the provider library", query("Nested", "definition", { text: withNear,
  files: [{ path: src, content: withNear }, entries[1]] }), failure("not-found"));
function replacement(name: string) {
  const changed = sourceText.replace("Recl&#97;im", name);
  return { text: changed, files: [{ path: src, content: changed }, entries[1]] };
}
check("exact-case lookup", query("reclaim", "definition", replacement("reclaim")), failure("not-found"));
check("explicit missing location", query("Absent", "definition", replacement("Absent")), failure("not-found"));
const renamed = provider.replaceAll("Reclaim", "Renamed");
const changed = sourceText.replace("Recl&#97;im", "Renamed");
check("uses both unsaved document edits", query("Renamed", "definition", { text: changed, files: [{ path: src, content: changed },
  {path: target, content: renamed}] }), resolved([loc(target, renamed, 'name="Renamed"', "Renamed")]));
check("cannot select expression or prose", query("\u{1F680}", "references"), failure("not-a-literal"));
const flags = [{ path: "md/duplicate.xml", content: '<mdscript name="provider"><cues/></mdscript>' }];
check("folded script collision", query("Recl&#97;im", "definition", { files: [...entries, ...flags] }), failure("ambiguous"));
const duplicateCue = provider.replace('<cue name="Unused"/>','<cue name="reclaim"/>');
check("folded declaration collision", query("Recl&#97;im", "references", { files: [entries[0], { path: target, content: duplicateCue }] }), failure("ambiguous"));
const wrongCaseScript = sourceText.replace("Provider&#46;Recl", "provider&#46;Recl");
check("wrong-case script does not inherit declaration ambiguity", query("Recl&#97;im", "definition", { text: wrongCaseScript,
  files: [{ path: src, content: wrongCaseScript }, { path: target, content: duplicateCue }] }), failure("not-found"));
const duplicateCaller = { path: 'md/dup-caller.xml', content: '<mdscript name="Caller"/>' };
check("qualified definition accepts unique other script from duplicate caller", query("Recl&#97;im", "definition", { files: [...entries, duplicateCaller] }), resolved([def]));
check("references refuse ambiguous caller", query("Recl&#97;im", "references", { files: [...entries, duplicateCaller] }), failure("ambiguous"));
check("MD navigation keeps control characters outside the submitted inventory", query("Recl&#97;im", "definition", {
  files: [...entries, { path: "md/forbidden\u001f.xml", content: provider }],
}), unavailable("inventory"));
check("MD navigation keeps control characters outside the focus", navigate({ files: entries, path: "md/forbidden\u0000.xml",
  offset: 0, mode: "definition" }), unavailable("focus"));
check("duplicate normalized source path", query("Recl&#97;im", "definition", { files: [...entries, { path: "MD\\Alias.xml", content: sourceText }] }), unavailable("inventory"));
check("relative traversal refuses even non-MD input", query("Recl&#97;im", "definition", { files: [...entries, { path: "../outside.xml" }] }), unavailable("inventory"));
check("missing submitted MD content", query("Recl&#97;im", "definition", { files: [...entries, { path: 'md/absent.xml' }] }), unavailable("source"));
check("broken sibling XML", query("Recl&#97;im", "references", { files: [...entries, { path: 'md/broken.xml', content: '<mdscript' }] }), unavailable("source"));
check("diff cannot silently produce empty coverage", query("Recl&#97;im", "references", { files: [...entries, { path: 'md/inherited.xml', content: '<diff/>' }] }), unavailable("source"));
check("DOCTYPE refused before DOM", query("Recl&#97;im", "definition", { files: [...entries, { path: 'md/entity.xml', content: '<!DOCTYPE mdscript SYSTEM "file:///outside"><mdscript name="Bad"/>' }] }), unavailable("source"));
check("comments are inert even when they mention a document type", query("Recl&#97;im", "definition",
  { files: [...entries, { path: 'md/comment.xml', content: '<!-- <!DOCTYPE mdscript --> <mdscript name="Comment"/>' }] }), resolved([def]));
check("missing focus", navigate({ files: entries, path: "md/missing.xml", offset: 0, mode: "references" }), unavailable("focus"));
check("invalid focus offset", navigate({ files: entries, path: src, offset: -1, mode: "definition" }), unavailable("focus"));
check("out-of-bounds focus offset", navigate({ files: entries, path: src, offset: sourceText.length + 1, mode: "definition" }), unavailable("focus"));
const deep = '<mdscript name="Deep">' + '<cues>'.repeat(258) + '</cues>'.repeat(258) + '</mdscript>';
check("depth guard before DOM", query("Recl&#97;im", "definition", { files: [...entries, { path: "md/deep.xml", content: deep }] }), unavailable("limit"));
const crowd = '<mdscript name="Other"><cues><cue name="Work"><actions>'
  + '<signal_cue cue="md.Provider.Reclaim"/>'.repeat(2049) + '</actions></cue></cues></mdscript>';
check("matching references are bounded", query("Recl&#97;im", "references", { files: [...entries, { path: "md/crowd.xml", content: crowd }] }), unavailable("limit"));
check("same-name uses in another script do not consume the query budget", query("Recl&#97;im", "references", { files: [...entries,
  { path: "md/crowd.xml", content: crowd.replace('name="Work"', 'name="Reclaim"').replaceAll("md.Provider.Reclaim", "Reclaim") }] }), resolved([sourceRef, providerRef]));
// Workspace symbol output is compared against a black-box CodeSense 1.2.0 fixture.
const symbolFiles = {
  'md/fixture.xml': '<mdscript name="ForgeIndex"><cues>\r\n  <cue name="Start">\r\n    <cues><cue name="Inner"/></cues>\r\n  </cue>\r\n  <library name="Shared"><params><param name="Rate"/></params></library>\r\n</cues></mdscript>',
  'md/other.xml': '<mdscript name="OtherIndex"><cues><cue name="Start"/></cues></mdscript>',
  'aiscripts/PilotLoop.xml': '<aiscript name="PilotLoop"><order id="QA_ORDER" name="{1,2}"/><attention min="unknown"><actions><label name="Again"/></actions></attention></aiscript>',
};
const symbols = Object.entries(symbolFiles).flatMap(([file, content]) => readWorkspaceScriptSymbols(file, content, 'forge_symbol_fixture'));
const symbolRows = (query: string) => searchWorkspaceScriptSymbols(symbols, query)
  .map(symbol => [symbol.file, symbol.kind, symbol.start.line, symbol.start.column, symbol.end.column]);
check('workspace symbols keep both unqualified Start declarations', symbolRows('Start'), [
  ['md/fixture.xml', 'cue', 1, 13, 18], ['md/other.xml', 'cue', 0, 45, 50],
]);
check('workspace symbols accept exact qualified MD names', symbolRows('md.ForgeIndex.Start'), [
  ['md/fixture.xml', 'cue', 1, 13, 18],
]);
check('workspace symbols retain authored script and nested cue spans', [symbolRows('ForgeIndex'), symbolRows('Inner')], [
  [['md/fixture.xml', 'script', 0, 16, 26]], [['md/fixture.xml', 'cue', 2, 21, 26]],
]);
check('workspace symbols retain MD library and AIScript spans', [symbolRows('Shared'), symbolRows('PilotLoop')], [
  [['md/fixture.xml', 'library', 4, 17, 23]], [['aiscripts/PilotLoop.xml', 'script', 0, 16, 25]],
]);
check('workspace symbols omit local labels and unknown names', [symbolRows('Again'), symbolRows('NoSuch')], [[], []]);
check('workspace symbols show the declaration owner', searchWorkspaceScriptSymbols(symbols, 'Start').map(symbol => symbol.container), [
  'md.ForgeIndex (forge_symbol_fixture)', 'md.OtherIndex (forge_symbol_fixture)',
]);
const entityLine = '<cues><cue name="St&#97;rt"/></cues></mdscript>';
const entity = readWorkspaceScriptSymbols('md/entity.xml', '\uFEFF<mdscript name="F&#111;rge">\r\n' + entityLine, 'fixture');
const rootSymbol = searchWorkspaceScriptSymbols(entity, 'md.Forge')[0];
const cueSymbol = searchWorkspaceScriptSymbols(entity, 'start')[0];
check('workspace symbol spans retain authored XML entities and editor BOM coordinates', [
  [rootSymbol.start.line, rootSymbol.start.column, rootSymbol.end.column],
  [cueSymbol.start.line, cueSymbol.start.column, cueSymbol.end.column],
], [[0, 16, 26], [1, entityLine.indexOf('St&#97;rt'), entityLine.indexOf('St&#97;rt') + 'St&#97;rt'.length]]);
check('invalid and unrelated source does not supply a symbol', [
  readWorkspaceScriptSymbols('md/invalid.xml', '<mdscript name="Bad">', 'fixture'),
  readWorkspaceScriptSymbols('md/diff.xml', '<diff><add sel="/"><cue name="Guess"/></add></diff>', 'fixture'),
  readWorkspaceScriptSymbols('md/doctype.xml', '<!DOCTYPE mdscript><mdscript name="Doctype"/>', 'fixture'),
  readWorkspaceScriptSymbols('aiscripts/Alias.xml', symbolFiles['aiscripts/PilotLoop.xml'], 'fixture'),
  readWorkspaceScriptSymbols('fixtures/other.xml', symbolFiles['md/other.xml'], 'fixture'),
  readWorkspaceScriptSymbols('md/bad\u001f.xml', symbolFiles['md/other.xml'], 'fixture'),
], [[], [], [], [], [], []]);
const interruptSource = '<aiscript name="interrupt.probe"><interrupts><library>\r\n'
  + '<handler name="ProbeHandler"/><conditions name="Probe&amp;Condition"/><actions name="ProbeAction"/>'
  + '<handler/><group><handler name="Nested"/></group></library><handler name="Local"/>'
  + '</interrupts><actions><label name="ScriptLabel"/></actions></aiscript>';
const interruptSymbols = readWorkspaceScriptSymbols('aiscripts/interrupt.probe.xml', interruptSource, 'Base game');
check('workspace symbols index the three global interrupt library kinds and no local entries',
  interruptSymbols.map(symbol => [symbol.name, symbol.container]), [
    ['interrupt.probe', 'Base game'],
    ['ProbeHandler', 'interrupt.probe (Base game, interrupt handler)'],
    ['Probe&Condition', 'interrupt.probe (Base game, interrupt conditions)'],
    ['ProbeAction', 'interrupt.probe (Base game, interrupt actions)'],
  ]);
const interruptCondition = interruptSymbols[2];
check('interrupt declarations keep the raw entity span with CRLF',
  [interruptCondition.start.line, interruptSource.split('\r\n')[1].slice(interruptCondition.start.column, interruptCondition.end.column)],
  [1, 'Probe&amp;Condition']);

console.log(JSON.stringify({ native: old.total, authored: checks }));
