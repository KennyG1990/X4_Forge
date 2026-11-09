/** Pure advisory lint for explicit reference literals not reliably schema-typed (notably Lua). */
import { parse } from 'luaparse';
import { createSourcePositionLocator } from './xmlSourceSpans';

export interface ReferenceLiteralSets {
  factions?: Set<string>;
  wares?: Set<string>;
  macros?: Set<string>;
  sectors?: Set<string>;
}

export interface ReferenceLiteralFinding {
  code: 'reference.unknown_faction' | 'reference.unknown_ware' | 'reference.unknown_macro' | 'reference.unknown_sector';
  severity: 'warning';
  kind: 'faction' | 'ware' | 'macro' | 'sector';
  id: string;
  filePath?: string;
  line: number;
  column: number;
  suggestions: string[];
  message: string;
}

function editDistance(a: string, b: string, cap: number): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i; let best = row[0];
    for (let j = 1; j <= b.length; j++) {
      const old = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = old; best = Math.min(best, row[j]);
    }
    if (best > cap) return cap + 1;
  }
  return row[b.length];
}

function suggest(id: string, values: Set<string> | undefined): string[] {
  if (!values?.size) return [];
  const clean = id.toLowerCase().replace(/^faction\./, '');
  const candidates = [...values]
    .map(v => v.toLowerCase().replace(/^faction\./, ''))
    .filter((v, i, all) => all.indexOf(v) === i)
    .map(v => ({ v, d: editDistance(clean, v, 3) }))
    .filter(x => x.d <= 3)
    .sort((a, b) => a.d - b.d || a.v.localeCompare(b.v))
    .slice(0, 3)
    .map(x => x.v);
  return candidates;
}

function maskComments(content: string, isLua: boolean): string {
  const keepLines = (s: string) => s.replace(/[^\r\n]/g, ' ');
  return isLua
    ? content.replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, keepLines).replace(/--[^\r\n]*/g, keepLines)
    : content.replace(/<!--[\s\S]*?-->/g, keepLines);
}

interface LuaReferenceNode {
  type: string;
  name?: string;
  isLocal?: boolean;
  value?: unknown;
  raw?: string;
  range?: [number, number];
  operator?: string;
  base?: LuaReferenceNode;
  identifier?: LuaReferenceNode;
  index?: LuaReferenceNode;
  left?: LuaReferenceNode;
  right?: LuaReferenceNode;
  argument?: LuaReferenceNode;
  arguments?: LuaReferenceNode[];
  variables?: LuaReferenceNode[];
}

type LuaFactionConsumer = 'GetFactionData' | 'GetComponentData';

function globalLuaName(node: LuaReferenceNode | undefined): string | undefined {
  return node?.type === 'Identifier' && node.isLocal === false ? node.name : undefined;
}

function isGlobalEnvironment(node: LuaReferenceNode | undefined): boolean {
  const name = globalLuaName(node);
  return name === '_G' || name === '_ENV';
}

function globalLuaWrite(node: LuaReferenceNode | undefined): unknown {
  if (node?.type === 'MemberExpression' && isGlobalEnvironment(node.base)) return node.identifier?.name;
  if (node?.type === 'IndexExpression' && isGlobalEnvironment(node.base)) return node.index?.value;
  return globalLuaName(node);
}

function luaFactionLiterals(content: string): Array<{ id: string; offset: number }> {
  if (!content.includes('GetFactionData') && !content.includes('GetComponentData')) return [];
  const hits: Array<{ consumer: LuaFactionConsumer; id: string; offset: number }> = [];
  const rebound = new Set<LuaFactionConsumer>();
  let changedEnvironment = false;
  const markWrite = (name: unknown) => {
    if (name === '_ENV') changedEnvironment = true;
    if (name === 'GetFactionData' || name === 'GetComponentData') rebound.add(name);
  };
  const record = (consumer: LuaFactionConsumer, node: LuaReferenceNode | undefined) => {
    if (node?.type !== 'StringLiteral' || typeof node.value !== 'string' || !node.range || !node.raw
      || !/^[A-Za-z_][\w.-]*$/.test(node.value)) return;
    const opening = node.raw.match(/^(?:\[=*\[(?:\r\n|\n\r|\r|\n)?|["'])/);
    if (opening) hits.push({ consumer, id: node.value, offset: node.range[0] + opening[0].length });
  };
  const returnsOwner = (node: LuaReferenceNode | undefined) => node?.type === 'CallExpression'
    && globalLuaName(node.base) === 'GetComponentData' && node.arguments?.[1]?.value === 'owner';
  try {
    // Preserve UTF-16 offsets while giving luaparse a byte-string-compatible input.
    // A substituted character cannot be part of an ASCII faction ID.
    parse(content.replace(/^\uFEFF/, ' ').replace(/[\u0100-\uffff]/g, '?'), {
      comments: false, ranges: true, scope: true, luaVersion: '5.2', encodingMode: 'pseudo-latin1',
      onLocalDeclaration(name: string) {
        if (name === '_ENV') changedEnvironment = true;
      },
      onCreateNode(node: LuaReferenceNode) {
        if (node.type === 'AssignmentStatement') {
          for (const variable of node.variables ?? []) markWrite(globalLuaWrite(variable));
        } else if (node.type === 'FunctionDeclaration') {
          markWrite(globalLuaWrite(node.identifier));
        } else if (node.type === 'CallExpression' || node.type === 'StringCallExpression') {
          const callee = globalLuaName(node.base);
          if (callee === 'GetFactionData') record(callee, node.arguments?.[0] ?? node.argument);
          if (callee === 'rawset' && isGlobalEnvironment(node.arguments?.[0])) markWrite(node.arguments?.[1]?.value);
        } else if (node.type === 'BinaryExpression' && (node.operator === '==' || node.operator === '~=')) {
          if (returnsOwner(node.left)) record('GetComponentData', node.right);
          if (returnsOwner(node.right)) record('GetComponentData', node.left);
        }
      },
    });
  } catch { return []; } // A partial parse cannot establish the consumer.
  return changedEnvironment ? [] : hits.filter(hit => !rebound.has(hit.consumer));
}

export function lintReferenceLiterals(
  content: string,
  references: ReferenceLiteralSets,
  opts: { filePath?: string; kind?: string } = {},
): ReferenceLiteralFinding[] {
  if (!content || (!references.factions?.size && !references.wares?.size && !references.macros?.size && !references.sectors?.size)) return [];
  const isLua = opts.kind === 'lua' || /\.lua$/i.test(opts.filePath || '');
  const masked = maskComments(content, isLua);
  const locate = createSourcePositionLocator(content);
  const findings: ReferenceLiteralFinding[] = [];
  const seen = new Set<string>();
  const add = (kind: ReferenceLiteralFinding['kind'], values: Set<string>, rawId: string, offset: number) => {
    const id = rawId.toLowerCase();
    if (values.has(id) || (kind === 'faction' && values.has(`faction.${id}`))) return;
    const key = `${kind}:${id}:${offset}`;
    if (seen.has(key)) return;
    seen.add(key);
    const suggestions = suggest(id, values);
    const suffix = suggestions.length ? ` Did you mean ${suggestions.join(', ')}?` : '';
    findings.push({
      code: `reference.unknown_${kind}`,
      severity: 'warning', kind, id, filePath: opts.filePath, ...locate(offset), suggestions,
      message: `${kind} reference "${id}" is not present in the configured canonical X4 corpus.${suffix}`,
    });
  };
  const scan = (kind: ReferenceLiteralFinding['kind'], values: Set<string> | undefined, pattern: RegExp, capture = 1) => {
    if (!values?.size) return;
    for (const match of masked.matchAll(pattern)) {
      const offset = match.indices?.[capture]?.[0];
      if (offset !== undefined) add(kind, values, match[capture], offset);
    }
  };

  // Root keyword expressions, also used in Lua strings sent to MD. A word
  // boundary alone matches the property suffix in $object.ware.name (and even
  // the variable $ware.name); neither is a literal corpus reference.
  if (!isLua) scan('faction', references.factions, /(?<![\w$.\]])faction\.([A-Za-z_][\w-]*)\b/gd);
  scan('ware', references.wares, /(?<![\w$.\]])ware\.([A-Za-z_][\w-]*)\b/gd);
  scan('macro', references.macros, /(?<![\w$.\]])macro\.([A-Za-z_][\w-]*)\b/gd);

  if (isLua) {
    // Corpus-proven literal APIs. Variable first arguments are intentionally skipped.
    scan('ware', references.wares, /\bGetWareData\s*\(\s*(["'])([^"']+)\1\s*,/gd, 2);
    if (references.factions?.size) {
      for (const hit of luaFactionLiterals(content)) add('faction', references.factions, hit.id, hit.offset);
    }
    scan('macro', references.macros, /\bGetMacroData\s*\(\s*(["'])([^"']+)\1\s*,/gd, 2);
  } else {
    // Schema validation remains primary; these explicit attributes keep checks armed on
    // schema-less installs and for diff payloads whose domain schema is wrapper-only.
    scan('ware', references.wares, /\bware\s*=\s*(["'])([A-Za-z_][\w-]*)\1/gd, 2);
    scan('macro', references.macros, /\bmacro\s*=\s*(["'])([A-Za-z_][\w-]*_macro)\1/gd, 2);
    scan('sector', references.sectors || references.macros, /\bsector\s*=\s*(["'])([A-Za-z_][\w-]*_macro)\1/gd, 2);

    // B94 (phantom ids in list literals) was ATTEMPTED here and REVERTED 2026-07-26 — see BACKLOG.
    // The "a list containing a known faction proves a faction position" heuristic FAILED its bar:
    // it flagged `broker` in the real mod's ai_influence_chat.xml (real lists mix faction ids with
    // role/tag tokens) and still missed the target `riptide`, which lives in an XML attribute as
    // &apos;-escaped text. Shipping a lint that cries wolf is worse than shipping none.
  }
  return findings;
}

export function runReferenceLiteralLintSelftest() {
  const refs = {
    factions: new Set(['argon', 'faction.argon', 'fallensplit', 'faction.fallensplit']),
    wares: new Set(['energycells', 'water']),
    macros: new Set(['ship_arg_l_destroyer_01_a_macro', 'cluster_01_sector001_macro']),
    sectors: new Set(['cluster_01_sector001_macro']),
  };
  const xml = '<do_if value="faction.argonn.name"/><set_value exact="ware.energcells"/><ware ware="energcells"/><create_ship macro="ship_arg_l_destroyer_01_a_macro"/><find_sector sector="cluster_01_sector002_macro"/>';
  const lua = '-- GetWareData("boguscomment", "name")\nlocal n=GetWareData("waterr", "name")';
  const findings = [...lintReferenceLiterals(xml, refs, { filePath: 'md/test.xml', kind: 'md' }), ...lintReferenceLiterals(lua, refs, { filePath: 'ui/test.lua', kind: 'lua' })];
  const mixed = '<!-- ware.wrong\r\nware.wrong -->\r<r value="ware.wrong + ware.wrong" ware=\r\n  "wrong" />';
  const positions = lintReferenceLiterals(mixed, refs).map(finding => `${finding.line}:${finding.column}`);
  const luaMixed = '--[=[GetWareData("wrong", "name")\r]=]\rlocal n=GetWareData(\r\n  "wrong", "name")';
  const luaPositions = lintReferenceLiterals(luaMixed, refs, { kind: 'lua' }).map(finding => `${finding.line}:${finding.column}`);
  const factionIds = (source: string) => lintReferenceLiterals(source, refs, { kind: 'lua' })
    .filter(finding => finding.kind === 'faction').map(finding => finding.id).join(',');
  const benign = [
    'local ordinary = "faction.service"', 'local registry = {["faction.rivals"] = true}',
    'local text = [[GetFactionData("fakecall", "name")]]', '-- GetFactionData("fakecomment", "name")',
    'local alias = GetFactionData; alias("fakeref")', '_G.GetFactionData("environment_member")',
    'object.GetFactionData("fakemember")', 'local direct = GetFactionData("argon", "name")',
    'do local GetFactionData; function GetFactionData() end; GetFactionData("fakelocal") end',
    'do local _G = {}; _G.GetFactionData = function() end end',
    'local real = GetFactionData("actual")',
  ].join('\n');
  const direct = '\uFEFFlocal label = "🚀"\r\nGetFactionData("\\110otafaction", "name")\r'
    + 'local long = GetFactionData([=[\r\n  invalid]=], "name")\n'
    + 'local exact = GetFactionData[=[\r\nlongid]=]\n';
  const directFindings = lintReferenceLiterals(direct, refs, { kind: 'lua' });
  const ownerCompare = [
    'local a = GetComponentData(0, "owner", "name") == "badowner"',
    'local b = "reversed" ~= GetComponentData(0, "owner")',
    'local c = GetComponentData(0, "name", "owner") == "displayname"',
    'local d = GetComponentData(0, "owner") == runtimeValue',
  ].join('\n');
  const rebound = [
    'GetFactionData = function() end', 'function GetFactionData() end',
    'function _G.GetFactionData() end', '_ENV["GetFactionData"] = function() end',
    'rawset(_G, "GetFactionData", function() end)',
  ];
  const checks = [
    { name: 'bad faction warned with suggestion', pass: findings.some(f => f.kind === 'faction' && f.id === 'argonn' && f.suggestions.includes('argon')) },
    { name: 'bad XML ware warned', pass: findings.some(f => f.kind === 'ware' && f.id === 'energcells') },
    { name: 'bad expression ware warned', pass: findings.some(f => f.kind === 'ware' && f.id === 'energcells' && f.suggestions.includes('energycells')) },
    { name: 'bad sector uses sector catalog', pass: findings.some(f => f.kind === 'sector' && f.id === 'cluster_01_sector002_macro') },
    { name: 'bad Lua literal ware warned', pass: findings.some(f => f.kind === 'ware' && f.id === 'waterr') },
    { name: 'Lua comment ignored', pass: !findings.some(f => f.id === 'boguscomment') },
    { name: 'known macro clean', pass: !findings.some(f => f.kind === 'macro') },
    { name: 'same-line and multiline XML IDs use the capture coordinates', pass: positions.join(',') === '3:16,3:29,4:4' },
    { name: 'Lua multiline API location keeps original lines across block comments', pass: luaPositions.join(',') === '4:4' },
    { name: 'nested property and variable roots remain outside reference lint', pass: !lintReferenceLiterals('$x.ware.id + $ware.name + $x.{1}.ware.id', refs).length },
    { name: 'only direct engine-shaped calls bypass the string and shadow exclusions', pass: factionIds(benign) === 'actual' },
    { name: 'escaped and long Lua literals retain exact raw coordinates', pass: directFindings.map(finding =>
      `${finding.id}:${finding.line}:${finding.column}`).join(',') === 'notafaction:2:17,longid:6:1' },
    { name: 'only comparisons to the first owner result are checked on either side', pass: factionIds(ownerCompare) === 'badowner,reversed' },
    { name: 'global rebinding disables only the affected consumer', pass: rebound.every(write =>
      factionIds(`${write}\nGetFactionData('fake')\n${ownerCompare}`) === 'badowner,reversed') },
    { name: 'local environment and malformed Lua do not publish speculative findings', pass:
      !factionIds(`local _ENV = {}; GetFactionData('fake')\n${ownerCompare}`) && !factionIds("GetFactionData('fake'); local broken = )") },
  ];
  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, pass: passed === checks.length, passed, total: checks.length, checks };
}
