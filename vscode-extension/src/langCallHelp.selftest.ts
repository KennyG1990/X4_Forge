import { strict as assert } from "node:assert";
import {
  mdCallScriptHeader, readAiScriptCallHelpRequest, readMdCallHelpRequest, resolveAiScriptCallHelp, resolveMdCallHelp,
  type AiScriptCallHelpMode, type MdCallHelpMode,
} from "./langCallHelp";
import { readAiScriptCallDocument } from "./aiScriptNavigation";
import { readMdDefinitionDocument } from "./langNav";
import "./aiScriptNavigation.selftest";
import { runX4IdeFeaturesSelftest } from "./x4IdeFeatures.selftest";

const provider = `<mdscript name="LibraryScript"><cues>
  <library name="Task" purpose="run_actions"><params>
    <param name="First" comment="required argument"/>
    <param name="Second" default="42" comment="optional argument"/>
  </params></library>
  <library name="CueTask"><params><param name="Other" default=""/></params></library>
  <library name="Empty" purpose="run_actions"/>
</cues></mdscript>`;
const caller = (actions: string) => `<mdscript name="Caller"><cues><cue name="Test"><actions>${actions}</actions></cue></cues></mdscript>`;
const run = (argumentsXml: string, ref = "md.LibraryScript.Task") => caller(`<run_actions ref="${ref}">${argumentsXml}</run_actions>`);
const definition = (xml: string) => readMdDefinitionDocument("md/provider.xml", xml, undefined, false, { includeSignatures: true })!;
function query(source: string, providers = [definition(provider)], mode: MdCallHelpMode = "signature") {
  const cursor = source.indexOf("|");
  assert.ok(cursor >= 0);
  const text = source.slice(0, cursor) + source.slice(cursor + 1);
  const request = readMdCallHelpRequest("md/caller.xml", text, cursor, mode);
  return request ? resolveMdCallHelp(request, providers) : undefined;
}

const complete = query(run(`<param value="a > b" name='Sec|ond'/><param name="First" value="1"/>`), undefined, "completion");
assert.equal(complete?.name, "md.LibraryScript.Task");
assert.equal(complete.activeParameter, 1);
assert.deepEqual(complete.unsupplied.map(parameter => parameter.name), ["Second"]);
assert.equal(complete.parameters[0].comment, "required argument");
assert.equal(complete.parameters[1].defaultValue, "42");
assert.deepEqual(complete.parameters[1].point, { file: "md/provider.xml", line: 3, column: 17 });
const source = run(`<param value="a > b" name='Sec|ond'/>`).replace("|", "");
assert.equal(source.slice(complete.nameRange!.start, complete.nameRange!.end), "Second");

const local = provider.replace("</cues>", `<cue name="Caller"><actions><run_actions ref="Task"><param name='Sec|/></run_actions></actions></cue></cues>`);
const recovered = query(local, [], "completion");
assert.equal(recovered?.name, "md.LibraryScript.Task");
assert.equal(local.replace("|", "").slice(recovered.nameRange!.start, recovered.nameRange!.end), "Sec");
assert.deepEqual(recovered.unsupplied.map(parameter => parameter.name), ["First", "Second"]);
const reversed = definition(provider.replace(/( {4}<param name="First"[^\n]*\n)( {4}<param name="Second"[^\n]*\n)/, "$2$1"));
const ranked = query(run(`<param name='|'/>`), [reversed], "completion");
assert.deepEqual(ranked?.parameters.map(parameter => parameter.name), ["Second", "First"]);
assert.deepEqual(ranked?.unsupplied.map(parameter => parameter.name), ["First", "Second"]);

assert.equal(query(run(`<param name="Second" value='1 |`))?.activeParameter, 1);
assert.equal(query(run(`<param name="Second" value='1 |`), undefined, "completion"), undefined);
assert.deepEqual(query(run(`<param name='|'/>`, "md.LibraryScript.Empty"))?.parameters, []);
assert.deepEqual(query(`<mdscript name="Caller"><cues><cue name="Instance" ref="md.LibraryScript.CueTask"><param name='Other|'/></cue></cues></mdscript>`)?.parameters.map(parameter => parameter.defaultValue), [""]);
assert.deepEqual(query(run(`<param name='second'/><param name='|'/>`))?.unsupplied.map(parameter => parameter.name), ["First", "Second"]);
assert.equal(query(run(`<param name='|'/>`, "md.LibraryScript.CueTask")), undefined);
assert.equal(query(run(`<param name='|'/>`, "$dynamic")), undefined);
assert.equal(query(run(`<param name='|'/>`, "md.LibraryScript.task")), undefined);
assert.equal(query(run(`<param name='|'/>`), [definition(provider), definition(provider)]), undefined);
assert.equal(query(run(`<param name='|'/>`), [definition(provider.replace('<param name="Second"', '<param name="First"'))]), undefined);
assert.equal(query(run(`<param name='|'/>`), [definition(provider.replace("<params>", '<params xmlns="urn:foreign">'))]), undefined);
assert.equal(query(run(`<wrap><param name='|'/></wrap>`)), undefined);
assert.equal(query(run(`<!-- <param name='|'/> -->`)), undefined);
assert.equal(query(run(`<![CDATA[<param name='|'/>]]>`)), undefined);
assert.equal(query(run(`<?fake <param name='|'/> ?>`)), undefined);
assert.equal(query(run(`<param xmlns="urn:foreign" name='|'/>`)), undefined);
assert.equal(query(caller(`<include_actions ref="md.LibraryScript.T|ask"/>`)), undefined);
assert.equal(query(run(`<param name='First' value='1|'>`), undefined, "completion"), undefined);
assert.equal(query(provider.replace('name="First"', 'name="F|irst"')), undefined);
assert.equal(query(`<diff><add sel="/mdscript/cues/cue/actions"><run_actions ref="md.LibraryScript.Task"><param name='|'/></run_actions></add></diff>`), undefined);
assert.equal(mdCallScriptHeader(`<!-- <mdscript name='Wrong'> --><mdscript name='Library&#83;cript'><broken`), "LibraryScript");
assert.equal(mdCallScriptHeader(`<diff><mdscript name='LibraryScript'/></diff>`), undefined);
const definitionAt = (text: string, providers?: ReturnType<typeof definition>[]) =>
  query(text, providers, "definition")?.parameterLocation;
assert.deepEqual(definitionAt(run(`<param value="a > b" name='Sec|ond'/>`)),
  { file: "md/provider.xml", line: 3, column: 17 });
assert.deepEqual(definitionAt(run('<param name="Sec|&#x6f;nd" value="1"/>')),
  { file: "md/provider.xml", line: 3, column: 17 });
const cueArgument = `<mdscript name="Caller"><cues><cue name="Instance" ref="md.LibraryScript.CueTask"><param name="Oth|er" value="7"/></cue></cues></mdscript>`;
const cueDeclarationColumn = provider.split("\n")[5].indexOf('name="Other"') + 'name="'.length;
assert.deepEqual(definitionAt(cueArgument), { file: "md/provider.xml", line: 5, column: cueDeclarationColumn });
assert.equal(definitionAt(run(`<param name="Sec|ond" value="1"/>`, "md.LibraryScript.CueTask")), undefined);
assert.equal(definitionAt(run(`<param name="Sec|ond" value="1"/>`, "$dynamic")), undefined);
assert.equal(definitionAt(run(`<param name="Unk|nown" value="1"/>`)), undefined);
assert.equal(definitionAt(run(`<param name="Second" value="1|"/>`)), undefined);
assert.equal(definitionAt(run(`<param name="Sec|ond value="1"/>`)), undefined);
assert.equal(definitionAt(run(`<param name="Sec|ond" value="1"/>`), [definition(provider), definition(provider)]), undefined);
assert.equal(definitionAt(caller(`<!-- <run_actions ref="md.LibraryScript.Task"><param name="Sec|ond"/></run_actions> -->`)), undefined);
console.log("MD call help and parameter definition checks passed");

const aiDeclaration = `<aiscript name="forge.call.target"><params>
  <param name="budget" default="5" comment="Optional budget"/>
  <param name="target" comment="Required target"/>
</params></aiscript>`;
const aiDocument = readAiScriptCallDocument("aiscripts/forge.call.target.xml", aiDeclaration, { includeSignature: true });
const aiWrap = (body: string) =>
  `<aiscript name="forge.call.caller"><attention min="unknown"><actions>${body}</actions></attention></aiscript>`;
const aiCall = (body: string, target = "'forge.call.target'") =>
  aiWrap(`<run_script name="${target}">${body}</run_script>`);
function aiQuery(marked: string, mode: AiScriptCallHelpMode = "signature", siblings = [aiDocument]) {
  const cursor = marked.indexOf("|");
  assert.ok(cursor >= 0);
  const request = readAiScriptCallHelpRequest("aiscripts/forge.call.caller.xml", marked.replace("|", ""), cursor, mode);
  return request ? resolveAiScriptCallHelp(request, [request.origin, ...siblings]) : undefined;
}

const aiSignature = aiQuery(aiCall('<param name="target" value="1|"/>'));
assert.deepEqual(aiSignature?.parameters.map(parameter => [parameter.name, parameter.defaultValue]),
  [["budget", "5"], ["target", undefined]]);
assert.equal(aiSignature?.activeParameter, 1);
assert.equal(aiSignature?.parameter?.comment, "Required target");
const aiCompleted = aiQuery(aiCall('<param name="|" value="1"/>'), "completion");
assert.deepEqual(aiCompleted?.unsupplied.map(parameter => parameter.name), ["target", "budget"]);
const aiPart = aiCall('<param name="target" value="1"/><param name="bu|');
const aiPartial = aiQuery(aiPart, "completion");
assert.deepEqual(aiPartial?.unsupplied.map(parameter => parameter.name), ["budget"]);
assert.equal(aiPart.replace("|", "").slice(aiPartial!.nameRange!.start, aiPartial!.nameRange!.end), "bu");
const aiName = aiQuery(aiCall('<param name="tar|&#103;et" value="1"/>'), "definition");
assert.deepEqual(aiName?.parameterLocation,
  { file: "aiscripts/forge.call.target.xml", start: { line: 2, column: 15 }, end: { line: 2, column: 21 } });
assert.equal(aiQuery(aiCall('<param name="target" value="1|"/>').replace("<run_script ", '<run_script chance="0" '))?.activeParameter, 1);
assert.equal(aiQuery(aiCall('<param name="target" value="1|"/>', "$dynamic")), undefined);
assert.equal(aiQuery(aiCall('<param name="target" value="1|"/>'), "signature", [aiDocument, { ...aiDocument, path: "aiscripts/another.xml" }]), undefined);
assert.equal(aiQuery(aiCall('<param xmlns="urn:foreign" name="tar|get" value="1"/>'), "hover"), undefined);
assert.equal(aiQuery(aiCall('<wrap><param name="tar|get" value="1"/></wrap>'), "definition"), undefined);
assert.equal(aiQuery(aiCall('<param name="target" value="1|"/>'), "completion"), undefined);
const duplicateAiParam = aiCall('<param name="target" value="1"/><param name="tar|get" value="2"/>');
assert.deepEqual(aiQuery(duplicateAiParam, "completion")?.unsupplied.map(parameter => parameter.name), ["budget"]);
assert.equal(aiQuery(duplicateAiParam, "definition"), undefined);
const foldedAiParam = aiCall('<param name="TARGET" value="1"/><param name="tar|get" value="2"/>');
assert.deepEqual(aiQuery(foldedAiParam, "completion")?.unsupplied.map(parameter => parameter.name), ["budget"]);
assert.equal(aiQuery(foldedAiParam, "definition"), undefined);
console.log("AI call help, completion and parameter location checks passed");

const ideFeaturesRes = runX4IdeFeaturesSelftest();
assert.equal(ideFeaturesRes.allPassed, true, `x4IdeFeatures selftest failed: ${JSON.stringify(ideFeaturesRes.checks.filter(c => !c.pass))}`);
console.log(`x4IdeFeatures checks passed (${ideFeaturesRes.passed}/${ideFeaturesRes.total})`);
