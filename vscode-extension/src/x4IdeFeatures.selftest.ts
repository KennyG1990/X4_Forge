import {
  computeXmlFoldingRanges,
  computeX4DocumentSymbols,
  computeX4SemanticTokens,
  computeX4InlayHints,
  computeX4CodeLenses,
  computeFormatSignatureHelp,
  resolveLuaReadTextAtCursor,
  findTFileEntryLocation,
  completeLuaReadText,
  planX4SymbolRename,
  computeXmlQuickFixes,
} from './x4IdeFeatures';

export function runX4IdeFeaturesSelftest() {
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const ok = (name: string, pass: boolean, detail?: string) =>
    checks.push({ name, pass, ...(detail ? { detail } : {}) });

  const sampleMd = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<mdscript name="DemoScript">',
    '  <!-- #region Setup -->',
    '  <cues>',
    '    <library name="HelperLib" purpose="run_actions">',
    '      <params><param name="Ship" type="ship"/></params>',
    '      <actions>',
    '        <debug_text text="{998801, 1}"/>',
    '      </actions>',
    '    </library>',
    '    <cue name="Start" instantiate="true" namespace="this">',
    '      <actions>',
    '        <find_ship name="$s" space="player.sector"/>',
    '        <run_actions ref="HelperLib"><param name="Ship" value="$s"/></run_actions>',
    '        <debug_text text="\'%s in %s\'.[$s.knownname, player.sector.knownname]"/>',
    '      </actions>',
    '    </cue>',
    '  </cues>',
    '  <!-- #endregion -->',
    '</mdscript>',
  ].join('\n');

  // 1. Folding ranges
  const folds = computeXmlFoldingRanges(sampleMd);
  ok('folding_detects_region_and_elements',
    folds.some(f => f.kind === 'region') && folds.filter(f => f.kind === 'element').length >= 4);

  // 2. Document symbols (Outline)
  const symbols = computeX4DocumentSymbols('md/demo.xml', sampleMd);
  ok('outline_builds_hierarchy_with_cues_libs_and_vars',
    symbols.length === 1
      && symbols[0].name === 'DemoScript'
      && symbols[0].children.some(c => c.name === 'HelperLib')
      && symbols[0].children.some(c => c.name === 'Start' && c.children.some(v => v.name === '$s')));

  const diffSymbols = computeX4DocumentSymbols('md/gm_patrol.xml', '<diff>\n  <replace sel="/mdscript/cues/cue[@name=\'A\']"/>\n</diff>');
  ok('outline_supports_diff_operations', diffSymbols.length === 1 && diffSymbols[0].name.includes('replace'));

  // 3. Semantic tokens
  const sem = computeX4SemanticTokens('md/demo.xml', sampleMd);
  ok('semantic_tokens_emits_encoded_5tuples', sem.tokens.length >= 6 && sem.data.length === sem.tokens.length * 5);

  // 4. Inlay hints
  const hints = computeX4InlayHints('md/demo.xml', sampleMd, {
    resolveText: (p, id) => (p === '998801' && id === '1' ? 'Patrol Ready' : null),
    variableTypes: { '$s': 'ship' },
  });
  ok('inlay_hints_resolves_text_and_guessed_var_type',
    hints.some(h => h.kind === 'Text' && h.label.includes('Patrol Ready'))
      && hints.some(h => h.kind === 'Type' && h.label === ': ship?'));

  // 5. Reference CodeLenses
  const lenses = computeX4CodeLenses('md/demo.xml', sampleMd);
  const libLens = lenses.find(l => l.symbolName === 'HelperLib');
  ok('codelens_counts_library_references', Boolean(libLens && libLens.referenceCount === 1));

  // 6. Format SignatureHelp
  const fmtAnchor = sampleMd.indexOf('player.sector.knownname');
  const fmtSig = computeFormatSignatureHelp(sampleMd, fmtAnchor);
  ok('format_signature_help_highlights_second_arg',
    Boolean(fmtSig && fmtSig.parameters.length === 2 && fmtSig.activeParameter === 1));

  // 7. Lua ReadText definition & completion
  const luaSrc = 'local PAGE = 998801\nlocal txt = ReadText(PAGE, 1)\nlocal inc = ReadText(998801, ';
  const rtCall = resolveLuaReadTextAtCursor(luaSrc, luaSrc.indexOf('PAGE, 1') + 2);
  ok('lua_readtext_resolves_local_constant_page', rtCall?.page === '998801' && rtCall?.id === '1');
  const tFileXml = '<language id="44">\n  <page id="998801">\n    <t id="1">Patrol Ready</t>\n  </page>\n</language>';
  const tLoc = findTFileEntryLocation([{ file: 't/0001-l044.xml', text: tFileXml }], '998801', '1');
  ok('lua_readtext_locates_tfile_line', tLoc?.file === 't/0001-l044.xml' && tLoc.line === 2 && tLoc.text === 'Patrol Ready');
  const pagesMap = new Map([['998801', new Map([['1', 'Patrol Ready'], ['2', 'Sector Clear']])]]);
  const rtComp = completeLuaReadText(luaSrc, luaSrc.length, pagesMap);
  ok('lua_readtext_completes_entry_ids', rtComp.length === 2 && rtComp[0].label === '1');

  // 8. Native F2 Rename (cues + local $vars + AIScript labels)
  const varRename = planX4SymbolRename([{ file: 'md/demo.xml', text: sampleMd }], 'md/demo.xml', sampleMd.indexOf('$s.knownname') + 1, '$targetShip');
  ok('rename_updates_all_local_var_occurrences', 'edits' in varRename && varRename.edits.length === 3);
  const libRename = planX4SymbolRename([{ file: 'md/demo.xml', text: sampleMd }], 'md/demo.xml', sampleMd.indexOf('HelperLib"') + 2, 'RenamedLib');
  ok('rename_updates_md_library_and_call', 'edits' in libRename && libRename.edits.length === 2);

  // 9. XML Quick Fixes (typo + missing required attr + Create Cue)
  const typoXml = '<mdscript name="T"><cues><cue name="C"><actions><set_valeu exact="1"/><signal_cue cue="NewCue"/></actions></cue></cues></mdscript>';
  const typoFixes = computeXmlQuickFixes(typoXml, typoXml.indexOf('set_valeu') + 3, {
    knownElements: ['set_value', 'signal_cue', 'debug_text'],
  });
  ok('quickfix_repairs_misspelled_element', typoFixes.some(f => f.preferred && f.edits[0].newText === 'set_value'));
  const createFixes = computeXmlQuickFixes(typoXml, typoXml.indexOf('NewCue') + 2, {
    knownCues: new Set(['C']),
  });
  ok('quickfix_offers_create_missing_cue', createFixes.some(f => f.title === 'Create cue "NewCue"'));

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, pass: passed === checks.length, passed, total: checks.length, checks };
}

if (typeof process !== 'undefined' && /(?:^|[\\/])x4IdeFeatures\.selftest\.[cm]?[jt]s$/i.test(process.argv[1] || '')) {
  const res = runX4IdeFeaturesSelftest();
  console.log(`x4IdeFeatures selftest: ${res.passed}/${res.total} allPassed=${res.allPassed}`);
  for (const c of res.checks) if (!c.pass) console.error('FAIL:', c.name, c.detail || '');
  process.exit(res.allPassed ? 0 : 1);
}
