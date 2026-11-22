import { strict as assert } from 'node:assert';
import { MAX_PROJECT_XML_DEPTH } from '../../shared/xmlMarkup';
import {
  AI_SCRIPT_NAVIGATION_LIMITS, navigateAuthoredAiScriptSnapshot,
  readAiScriptNavigationDocument, resolveAiScriptDefinition, resolveAiScriptReferences,
} from './aiScriptNavigation';

const callerPath = 'aiscripts/Forge.NavCaller.xml';
const targetPath = 'aiscripts/Forge.NavTarget.xml';
const target = '<?xml version="1.0"?>\n<aiscript name="Forge.NavTarget"><attention min="unknown"><actions/></attention></aiscript>';
const caller = (content: string) =>
  `<aiscript name="Forge.NavCaller"><attention min="unknown"><actions>${content}</actions></attention></aiscript>`;
const action = (value: string) => `<run_script name="${value}"/>`;
let assertions = 0;
function selected(xml: string) {
  const cursor = xml.indexOf('|');
  assert.ok(cursor >= 0);
  return readAiScriptNavigationDocument(callerPath, xml.replace('|', ''), cursor);
}
const exact = readAiScriptNavigationDocument(targetPath, target);
const reference = selected(caller(action("'Forge.Nav|Target'")));
const expected = { file: targetPath, start: { line: 1, column: 16 }, end: { line: 1, column: 31 } };
assert.deepEqual(resolveAiScriptDefinition(reference, [reference, exact]), expected); assertions++;
const encoded = selected(caller('<do_if value="\'😀\'">' + action('&#39;Forge.Nav|Target&apos;') + '</do_if>'));
assert.deepEqual(resolveAiScriptDefinition(encoded, [encoded, exact]), expected); assertions++;
const wide = selected(caller(action("'Forge.Unrelated'").repeat(1_000) +
  '<do_if value="true">' + action("'Forge.Nav|Target'") + '</do_if>'));
assert.deepEqual(resolveAiScriptDefinition(wide, [wide, exact]), expected); assertions++;
const edited = readAiScriptNavigationDocument(targetPath, '\uFEFF<aiscript name="Forge.Nav&#84;arget">\r\n</aiscript>');
assert.deepEqual(resolveAiScriptDefinition(reference, [reference, edited]), {
  file: targetPath, start: { line: 0, column: 17 }, end: { line: 0, column: 36 },
}); assertions++;

for (const xml of [
  caller(action('$Fo|rge.Name')),
  caller(action("'Forge.Nav|Target' + 'Suffix'")),
  caller(action("|&apos;Forge.NavTarget&apos;")),
  caller(`<run_script name="'Forge.NavTarget'" chance="|50"/>`),
  caller(`<!-- ${action("'Forge.Nav|Target'")} -->`),
  caller(`<run_script xmlns="urn:foreign" name="'Forge.Nav|Target'"/>`),
  `<aiscript name="Forge.NavCaller">${action("'Forge.Nav|Target'")}</aiscript>`,
  `<diff><add sel="/aiscript">${action("'Forge.Nav|Target'")}</add></diff>`,
  caller(action("'Forge.Nav|Target'")).replace('</attention>', ''),
  caller('<do_if value="true">'.repeat(MAX_PROJECT_XML_DEPTH) + action("'Forge.Nav|Target'") +
    '</do_if>'.repeat(MAX_PROJECT_XML_DEPTH)),
  caller('<wait/>'.repeat(50_000) + action("'Forge.Nav|Target'")),
]) {
  const origin = selected(xml);
  assert.equal(resolveAiScriptDefinition(origin, [origin, exact]), undefined); assertions++;
}

for (const files of [
  [],
  [readAiScriptNavigationDocument(targetPath.toLowerCase(), target)],
  [readAiScriptNavigationDocument(targetPath, target.replace('Forge.NavTarget', 'Forge.OtherTarget'))],
  [exact, readAiScriptNavigationDocument('aiscripts/Other.xml', target)],
  [exact, readAiScriptNavigationDocument(targetPath.toLowerCase(), '<diff/>')],
  [exact, readAiScriptNavigationDocument('aiscripts/Other.xml', caller(''))],
  [readAiScriptNavigationDocument(targetPath, '<aiscript name="Forge.NavTarget"')],
]) {
  assert.equal(resolveAiScriptDefinition(reference, [reference, ...files]), undefined); assertions++;
}
const query = { name: 'Forge.NavTarget', limit: 20 };
const siblingPath = 'aiscripts/Forge.Sibling.xml';
const callerText = caller(action("'Forge.NavTarget'") +
  action("'Forge.NavTarget' + $suffix") +
  action("'forge.navtarget'") +
  '<foreign xmlns="urn:foreign"><run_script xmlns="" name="\'Forge.NavTarget\'"/></foreign>' +
  '<debug_text text="\'Forge.NavTarget\'"/>');
const siblingText = caller('<!-- ' + action("'Forge.NavTarget'") + ' -->' +
  '<do_if value="\'😀\'">' + action('&apos;Forge.NavTarget&#39;') +
  '<run_script chance="0" name="\'Forge.NavTarget\'"/></do_if>')
  .replace('Forge.NavCaller', 'Forge.Sibling');
const origin = readAiScriptNavigationDocument(callerPath, callerText, callerText.indexOf('Forge.NavTarget'), query);
const declaration = readAiScriptNavigationDocument(targetPath, target, target.indexOf('Forge.NavTarget'), query);
const other = readAiScriptNavigationDocument(siblingPath, siblingText, undefined, query);
const users = resolveAiScriptReferences(origin, [declaration, other, origin], false);
assert.deepEqual(users?.map(x => x.file), [callerPath, siblingPath, siblingPath]); assertions++;
assert.deepEqual(resolveAiScriptReferences(declaration, [other, origin, declaration], false), users); assertions++;
assert.deepEqual(resolveAiScriptReferences(declaration, [origin, declaration, other], true),
  [users?.[0], expected, users?.[1], users?.[2]]); assertions++;
assert.deepEqual(users?.map(x => ({
  line: x.start.line,
  start: x.start.column,
  value: (x.file === callerPath ? callerText : siblingText).slice(x.start.column, x.end.column),
})), [
  { line: 0, start: callerText.indexOf('Forge.NavTarget'), value: query.name },
  { line: 0, start: siblingText.indexOf('Forge.NavTarget', siblingText.indexOf('&apos;')), value: query.name },
  { line: 0, start: siblingText.lastIndexOf('Forge.NavTarget'), value: query.name },
]); assertions++;
const changed = readAiScriptNavigationDocument(siblingPath, siblingText.replaceAll('Forge.NavTarget', 'Forge.Missing'), undefined, query);
assert.deepEqual(resolveAiScriptReferences(origin, [changed, origin, declaration], false), users?.slice(0, 1)); assertions++;
const empty = readAiScriptNavigationDocument('aiscripts/Patch.xml', '<diff><add sel="/aiscript"/></diff>', undefined, query);
assert.deepEqual(resolveAiScriptReferences(origin, [empty, origin, declaration, other], false), users); assertions++;
assert.deepEqual(resolveAiScriptReferences(declaration, [declaration, changed, empty], false), []); assertions++;

for (const incomplete of [
  readAiScriptNavigationDocument(siblingPath, '<aiscript name="Forge.Sibling">', undefined, query),
  readAiScriptNavigationDocument(siblingPath, siblingText, undefined, { ...query, limit: 1 }),
  readAiScriptNavigationDocument(siblingPath, siblingText.replace('</do_if>', '</do_if>' + '<wait/>'.repeat(50_000)), undefined, query),
]) {
  assert.equal(resolveAiScriptReferences(origin, [incomplete, origin, declaration], true), undefined); assertions++;
}
const duplicate = readAiScriptNavigationDocument('aiscripts/Duplicate.xml', target, undefined, query);
assert.equal(resolveAiScriptReferences(declaration, [duplicate, declaration, origin], false), undefined); assertions++;
const dynamic = readAiScriptNavigationDocument(callerPath, callerText, callerText.indexOf('$suffix'), query);
assert.equal(resolveAiScriptReferences(dynamic, [dynamic, declaration, other], false), undefined); assertions++;

const snapshot = [
  { path: callerPath, content: callerText }, { path: targetPath, content: target },
  { path: siblingPath, content: siblingText }, { path: 'md/Other.xml', content: '<unrelated>' },
];
const cursor = callerText.indexOf('Forge.NavTarget');
const lookup = { files: snapshot, path: callerPath, offset: cursor, mode: 'definition' } as const;
assert.deepEqual(navigateAuthoredAiScriptSnapshot(lookup), { status: 'resolved', locations: [expected] }); assertions++;
assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, mode: 'references' }), { status: 'resolved', locations: users }); assertions++;
assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, mode: 'references', includeDeclaration: true }), {
  status: 'resolved', locations: [users?.[0], expected, users?.[1], users?.[2]],
}); assertions++;
const dirty = snapshot.map(file => file.path === siblingPath
  ? { ...file, content: file.content.replaceAll('Forge.NavTarget', 'Forge.Missing') } : file);
assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, files: dirty, mode: 'references' }), {
  status: 'resolved', locations: users?.slice(0, 1),
}); assertions++;
const noUsers = dirty.map(file => file.path === callerPath
  ? { ...file, content: file.content.replaceAll('Forge.NavTarget', 'Forge.Missing') } : file);
assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, files: noUsers, mode: 'references',
  path: targetPath, offset: target.indexOf('Forge.NavTarget') }), { status: 'resolved', locations: [] }); assertions++;
assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, offset: callerText.indexOf('$suffix') }), { status: 'not-a-literal' }); assertions++;
assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, files: snapshot.filter(file => file.path !== targetPath) }), { status: 'not-found' }); assertions++;
assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, files: [...snapshot, { path: 'aiscripts/Other.xml', content: target }] }),
  { status: 'ambiguous' }); assertions++;
assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, files: [...snapshot, { path: targetPath.toLowerCase(), content: target }] }),
  { status: 'unavailable', reason: 'inventory' }); assertions++;
for (const content of [undefined, '<aiscript name="Forge.Sibling">']) {
  assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, files: snapshot.map(file => file.path === siblingPath
    ? { ...file, content } : file) }), { status: 'unavailable', reason: 'source' }); assertions++;
}
for (const path of ['../aiscripts/Forge.NavCaller.xml', callerPath.toLowerCase(), callerPath + '\n']) {
  assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, path }), { status: 'unavailable', reason: 'focus' }); assertions++;
}
for (const path of ['../aiscripts/Foreign.xml', 'G:/extensions/Foreign.xml', 'aiscripts/../md/Foreign.xml', 'aiscripts/Bad|Name.xml']) {
  assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, files: [...snapshot, { path, content: target }] }),
    { status: 'unavailable', reason: 'inventory' }); assertions++;
}
assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, files: [...snapshot,
  ...Array.from({ length: AI_SCRIPT_NAVIGATION_LIMITS.files }, (_, index) => ({ path: `aiscripts/Bound.${index}.xml`, content: '<diff/>' })),
] }), { status: 'unavailable', reason: 'limit' }); assertions++;
const cappedSibling = siblingText.replace('</do_if>', action("'Forge.NavTarget'").repeat(AI_SCRIPT_NAVIGATION_LIMITS.references) + '</do_if>');
assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, mode: 'references', files: snapshot.map(file => file.path === siblingPath
  ? { ...file, content: cappedSibling } : file) }), { status: 'unavailable', reason: 'limit' }); assertions++;
assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, files: snapshot.map(file => file.path === siblingPath
  ? { ...file, content: '<!DOCTYPE aiscript>' + file.content } : file) }),
  { status: 'unavailable', reason: 'source' }, 'real document type is unavailable'); assertions++;
const tokenLimited = siblingText.replace('</actions>', '<wait/>'.repeat(AI_SCRIPT_NAVIGATION_LIMITS.markupTokensPerFile + 1) + '</actions>');
assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, files: snapshot.map(file => file.path === siblingPath
  ? { ...file, content: tokenLimited } : file) }), { status: 'unavailable', reason: 'limit' },
  'element-token budget refuses a complete valid authored document'); assertions++;

assert.deepEqual(Object.keys(reference).sort(), ['callee', 'declaration', 'name', 'path'],
  'native parser document shape is unchanged'); assertions++;
for (const inert of ['<!-- <!DOCTYPE aiscript> -->', '<![CDATA[<!DOCTYPE aiscript>]]>', '<?qa DOCTYPE="aiscript"?>']) {
  assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, files: snapshot.map(file => file.path === siblingPath
    ? { ...file, content: file.content.replace('<actions>', '<actions>' + inert) } : file) }),
  { status: 'resolved', locations: [expected] }, 'inert document-type text does not refuse a snapshot'); assertions++;
}
for (const offset of [-1, callerText.length + 1]) {
  assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, offset }),
    { status: 'unavailable', reason: 'focus' }, 'invalid raw UTF-16 focus'); assertions++;
}
const aliasedTarget = snapshot.map(file => file.path === targetPath ? { ...file, path: 'aiscripts/Alias.xml' } : file);
assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, files: aliasedTarget }),
  { status: 'not-found' }, 'declaration cannot substitute for exact target filename'); assertions++;
const wrongCaseTarget = snapshot.map(file => file.path === targetPath ? { ...file, path: targetPath.toLowerCase() } : file);
assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, files: wrongCaseTarget }),
  { status: 'not-found' }, 'folded target filename cannot substitute for exact identity'); assertions++;
const shiftedTarget = '\uFEFF<aiscript name="Forge.Nav&#84;arget">\r\n</aiscript>';
assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, files: snapshot.map(file => file.path === targetPath
  ? { ...file, content: shiftedTarget } : file) }), { status: 'resolved', locations: [{
    file: targetPath, start: { line: 0, column: 17 }, end: { line: 0, column: 36 },
  }] }, 'BOM and encoded declaration preserve original source ranges'); assertions++;
const depthLimited = siblingText.replace('<actions>', '<actions>' + '<do_if value="true">'.repeat(MAX_PROJECT_XML_DEPTH + 1))
  .replace('</actions>', '</do_if>'.repeat(MAX_PROJECT_XML_DEPTH + 1) + '</actions>');
assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, files: snapshot.map(file => file.path === siblingPath
  ? { ...file, content: depthLimited } : file) }), { status: 'unavailable', reason: 'limit' },
  'depth refuses before DOM traversal'); assertions++;
const byteLimited = '\u{1F680}'.repeat(AI_SCRIPT_NAVIGATION_LIMITS.fileBytes / 4 + 1);
assert.deepEqual(navigateAuthoredAiScriptSnapshot({ ...lookup, files: snapshot.map(file => file.path === siblingPath
  ? { ...file, content: byteLimited } : file) }), { status: 'unavailable', reason: 'limit' },
  'UTF-8 bytes are bounded even below the UTF-16 length limit'); assertions++;

console.log(`AI script navigation ${assertions} checks passed`);
