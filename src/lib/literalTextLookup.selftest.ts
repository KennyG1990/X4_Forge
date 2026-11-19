import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LITERAL_TEXT_MAX_FILES,
  literalTextFilenameLanguage,
  resolveLiteralText,
  type LiteralTextDocument,
  type LiteralTextLookupRequest,
} from './literalTextLookup';

function languageFile(ids: string, language = 44, page = 77558): string {
  return `<language id="${language}"><page id="${page}">${ids}</page></language>`;
}

export function runLiteralTextLookupSelftest() {
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
  function test(name: string, assertion: () => void) {
    try { assertion(); checks.push({ name, pass: true }); }
    catch (error) { checks.push({ name, pass: false, detail: String(error) }); }
  }
  const reference: LiteralTextLookupRequest = { scope: 'reference', page: 77558, id: 1, language: 44 };
  const english: LiteralTextDocument = {
    path: 't/0001-l044.xml',
    content: ['\uFEFF<language id="44">', '  <page id="077558">', '    <t id="001">Steel &amp;  Glass</t>',
      '    <t id="2">Nested {77558,1} (Editor comment)</t>', '    <t id="3"/>',
      '    <t id="4">Missing child {77558,999}</t>', '    <t id="5">{77558,6}</t>',
      '    <t id="6">{77558,5}</t>', '    <t id="7"> (Note {77558,999}) \\(displayed\\)</t>',
      '  </page>', '</language>'].join('\r\n'),
  };
  const german: LiteralTextDocument = {
    path: 't/0001-l049.xml', content: languageFile('<t id="1">Stahl &amp; Glas</t>', 49),
  };
  const officialDlc: LiteralTextDocument = {
    path: 'extensions/ego_dlc_split/t/0001-l044.xml',
    content: languageFile('<t id="1">Competing definition</t>'),
  };
  const query = (id: number, language = 44) => resolveLiteralText([english, german], { ...reference, language, id });

  test('same pair carries exact language, authored representation and CRLF/BOM source point', () => {
    assert.deepEqual(query(1), {
      ...reference, status: 'found', selectedLanguage: 44, authored: 'Steel &amp;  Glass',
      text: 'Steel &  Glass', source: { file: english.path, line: 3, column: 5 },
    });
    assert.equal(query(1, 49).text, 'Stahl & Glas');
    assert.equal(query(1, 49).source?.file, german.path);
  });
  test('declared language controls unsuffixed XML and a generated workspace projection is attested', () => {
    const result = resolveLiteralText([{ ...german, path: 't/Übersetzung.xml', representation: 'generated' }],
      { ...reference, scope: 'workspace', language: 49 });
    assert.equal(result.text, 'Stahl & Glas');
    assert.equal(result.source?.representation, 'generated');
    assert.equal(result.source?.file, 't/Übersetzung.xml');
  });
  test('padded filename languages agree with the explicit language root', () => {
    assert.equal(literalTextFilenameLanguage('t/0004-L00044.xml'), 44);
    assert.equal(literalTextFilenameLanguage('t/custom-texts.xml'), undefined);
    assert.equal(literalTextFilenameLanguage('t/0004-l1000.xml'), 0);
    assert.equal(resolveLiteralText([{ ...english, path: 't/0004-L00044.xml' }], reference).status, 'found');
    for (const path of ['t/0004-L00049.xml', 't/0004-l1000.xml']) {
      assert.equal(resolveLiteralText([{ ...english, path }], reference).reason, 'incomplete-coverage');
    }
  });
  test('found empty, missing entry and unavailable language are distinct', () => {
    assert.deepEqual([query(3).status, query(3).text, query(3).authored], ['found', '', '']);
    assert.deepEqual([query(999).status, query(999).selectedLanguage], ['missing', 44]);
    assert.deepEqual([query(1, 33).status, query(1, 33).selectedLanguage, query(1, 33).reason],
      ['unavailable', undefined, 'language-unavailable']);
  });
  test('existing XML entity and X4 comment handling preserves significant whitespace', () => {
    const result = query(2);
    assert.equal(result.authored, 'Nested {77558,1} (Editor comment)');
    assert.equal(result.text, 'Nested Steel &  Glass ');
    assert.equal(query(7).text, '  (displayed)');
  });
  test('XML 1.0 keeps authored Unicode line separators and normalizes only raw CR line endings', () => {
    const first = '<t id="4">café \u0085 雪 \u2028 \u2029</t>';
    const value = 'before\u0085\u2028\u2029\r\nnext\rend &amp; &#x1f603; &#13; \uFFFD';
    const content = '\uFEFF<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<language id="44">\r\n'
      + `  <page id="77558">${first}<t id="1">${value}</t></page>\r\n</language>`;
    const result = resolveLiteralText([{ ...english, content }], reference);
    assert.equal(result.status, 'found');
    assert.equal(result.authored, value);
    assert.equal(result.text, 'before\u0085\u2028\u2029\nnext\nend & 😃 \r \uFFFD');
    assert.deepEqual(result.source, { file: english.path, line: 3, column: 20 + first.length });
  });
  test('found entry with missing reference retains the unresolved marker and original definition', () => {
    const result = query(4);
    assert.equal(result.status, 'unresolved');
    assert.equal(result.reason, 'missing-reference');
    assert.equal(result.text, 'Missing child {77558,999}');
    assert.equal(result.source?.file, english.path);
  });
  test('cycle is reported rather than repeatedly expanding', () => {
    const result = query(5);
    assert.equal(result.reason, 'cycle');
    assert.equal(result.status, 'unresolved');
  });
  test('duplicate definitions preserve competing relative provenance across official sources', () => {
    const result = resolveLiteralText([english, officialDlc], reference);
    assert.equal(result.status, 'ambiguous');
    assert.deepEqual(result.sources?.map(source => source.file), [english.path, officialDlc.path]);
    assert.equal(result.text, undefined);
    assert.equal(resolveLiteralText([english, officialDlc], { ...reference, id: 2 }).reason, 'ambiguous-reference');
  });
  test('workspace scope and incomplete providers fail closed', () => {
    assert.equal(resolveLiteralText([officialDlc], { ...reference, scope: 'workspace' }).reason, 'incomplete-coverage');
    assert.equal(resolveLiteralText([english], reference, false).status, 'unavailable');
    assert.equal(resolveLiteralText([{ ...english, path: '../t/0001-l044.xml' }], reference).status, 'unavailable');
  });
  test('ambiguous case-only file aliases never masquerade as two independent sources', () => {
    const result = resolveLiteralText([english, { ...english, path: 'T/0001-L044.XML' }], reference);
    assert.equal(result.reason, 'incomplete-coverage');
  });
  test('malformed XML, conflicting language and unsupported patches hide no negative result', () => {
    const inputs = [
      '<language id="44"><page id="77558"><t id="1">bad</page></language>',
      languageFile('<t id="1">wrong-language</t>', 49),
      '<diff><add sel="/language"><page id="77558"/></add></diff>',
      '<!DOCTYPE language [<!ENTITY x "unsafe">]><language id="44"><page id="77558"><t id="1">&x;</t></page></language>',
      languageFile('<t id="1"><nested/></t>'),
      languageFile('unexpected character data<t id="1">a</t>'),
    ];
    for (const content of inputs) {
      assert.equal(resolveLiteralText([{ ...english, content }], reference).reason, 'incomplete-coverage');
    }
  });
  test('unsupported encodings and invalid XML characters or references refuse coverage', () => {
    for (const value of ['\u0000', '\u0001', '\uD800', '\uFFFF', '&#0;', '&#xD800;', '&#xFFFE;', '&#x110000;', '&#;', 'x & y']) {
      const content = languageFile(`<t id="1">${value}</t>`);
      assert.equal(resolveLiteralText([{ ...english, content }], reference).reason, 'incomplete-coverage');
    }
    for (const declaration of ['<?xml version="1.1"?>', '<?xml version="1.0" encoding="ISO-8859-1"?>']) {
      const content = declaration + languageFile('<t id="1">café</t>');
      assert.equal(resolveLiteralText([{ ...english, content }], reference).reason, 'incomplete-coverage');
    }
  });
  test('opaque markup cannot introduce entries or nested references and literal braces remain readable', () => {
    const content = languageFile('<!-- <!DOCTYPE language><t id="1">not an entry</t> &#0; -->' +
      '<t id="1">value: <![CDATA[<!DOCTYPE language> {label} &#0;]]></t>');
    const result = resolveLiteralText([{ ...english, content }], reference);
    assert.equal(result.text, 'value: <!DOCTYPE language> {label} &#0;');
    assert.equal(result.authored, 'value: <![CDATA[<!DOCTYPE language> {label} &#0;]]>');
  });
  test('fan-out, raw result and file counts are bounded', () => {
    const content = languageFile(`<t id="1">${'{77558,2}'.repeat(200)}</t><t id="2">ok</t>`);
    assert.equal(resolveLiteralText([{ ...english, content }], reference).reason, 'limit');
    const tooLong = languageFile(`<t id="1">${'a'.repeat(16_385)}</t>`);
    assert.equal(resolveLiteralText([{ ...english, content: tooLong }], reference).reason, 'limit');
    assert.equal(resolveLiteralText(Array.from({ length: LITERAL_TEXT_MAX_FILES + 1 }, () => english), reference).status, 'unavailable');
  });

  return { pass: checks.every(check => check.pass), passed: checks.filter(check => check.pass).length, total: checks.length, checks };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runLiteralTextLookupSelftest();
  console.log(JSON.stringify(result));
  if (!result.pass) process.exitCode = 1;
}
