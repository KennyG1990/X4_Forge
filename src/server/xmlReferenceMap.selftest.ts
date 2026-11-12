/** Real contained corpus fixtures; no running Forge, game, user mod or schema state. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeXmlReferenceMap, type XmlReferenceMapInput } from './xmlReferenceMap';
import { analyzeXmlReferenceDocument, xmlCatalogNameMatches, type XmlReferenceMapResult } from '../lib/xmlReferenceGraph';
import { getReferenceCorpus, clearReferenceCorpusCache } from '../lib/referenceCorpus';
import { getReferenceLanguageResources, clearReferenceLanguageCaches } from '../lib/referenceLanguage';
import { runReferenceBindingsSelftest, typedReferenceKind } from '../lib/referenceBindings';

export function runXmlReferenceMapSelftest() {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-xml-reference-map-'));
  const root = path.join(temporary, 'corpus');
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const check = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, ...(detail ? { detail } : {}) });
  const write = (relative: string, content: string) => { const target = path.join(root, ...relative.split('/')); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content, 'utf8'); };
  const macro = (name: string, body = '') => `<macros><macro name="${name}">${body}</macro></macros>`;
  const ship = macro('custom_ship', '<component ref="ship_component"/><connections><connection ref="weapon"><macro ref="weapon"/></connection></connections>');
  const projectFiles = [
    { path: 'assets/custom_ship.xml', content: ship },
    { path: 'libraries/wares.xml', content: '<wares><ware id="custom_ware"><component ref="custom_ship"/></ware></wares>' },
    { path: 'index/macros.xml', content: '<index><entry name="custom_ship" value="assets\\custom_ship"/></index>' },
  ];
  const analyze = (extra: Partial<XmlReferenceMapInput> = {}) => analyzeXmlReferenceMap({ projectFiles, referenceRoot: root,
    focus: { origin: 'project', path: 'assets/custom_ship.xml' }, maxDepth: 4, ...extra });
  const hasEdge = (result: XmlReferenceMapResult, symbol: string, status = 'resolved') => result.edges.some(edge => edge.symbol === symbol && edge.status === status);
  try {
    write('index/macros.xml', '<index><entry name="weapon" value="assets/weapon"/><entry name="bullet" value="assets/bullet"/><entry name="bullet_b" value="assets/bullet_b"/><entry name="patterned_*" value="assets/pattern"/><entry name="wrong" value="assets/wrong"/></index>');
    write('index/components.xml', '<index><entry name="ship_component" value="assets/ship_component"/><entry name="weapon_component" value="assets/weapon_component"/></index>');
    write('assets/ship_component.xml', '<components><component name="ship_component"><connections><connection name="weapon"/></connections></component></components>');
    write('assets/weapon_component.xml', '<components><component name="weapon_component"/></components>');
    write('assets/weapon.xml', macro('weapon', '<component ref="weapon_component"/><properties><bullet class="bullet"/></properties>'));
    write('assets/bullet.xml', macro('bullet'));
    write('assets/bullet_b.xml', macro('bullet_b'));
    write('assets/pattern.xml', macro('patterned_one'));
    write('assets/wrong.xml', macro('different_definition'));
    write('libraries/wares.xml', '<wares><ware id="energycells"/><ware id="removed_ware"/><ware id="rename_ware"/></wares>');
    const full = analyze();
    check('real ship macro to component and weapon file chain', hasEdge(full, 'ship_component') && hasEdge(full, 'weapon') && full.nodes.some(file => file.path === 'assets/weapon.xml'));
    check('real weapon bullet and component file chain', hasEdge(full, 'bullet') && hasEdge(full, 'weapon_component'));
    check('ware component uses macro namespace', hasEdge(full, 'custom_ship') && full.edges.some(edge => edge.symbol === 'custom_ship' && edge.kind === 'macro'));
    check('index entry resolves actual project definition', full.edges.some(edge => edge.kind === 'index-file' && edge.symbol === 'custom_ship' && edge.targetId === 'project:assets/custom_ship.xml'));
    check('local connection collision is never global weapon edge', full.edges.some(edge => edge.kind === 'local-connection' && edge.symbol === 'weapon' && edge.status === 'unsupported' && !edge.targetIds.length));
    check('incoming scope is explicit and bounded', full.coverage.incomingScope.includes('not every corpus file') && full.edges.some(edge => edge.sourceId === 'project:libraries/wares.xml' && edge.targetId === 'project:assets/custom_ship.xml'));
    check('selected neighborhood omits unrelated project files', !analyze({ projectFiles: [...projectFiles, { path: 'unrelated.xml', content: '<unrelated/>' }] }).nodes.some(file => file.path === 'unrelated.xml'));
    check('raw preview is exact authored source', full.preview?.content === ship && full.preview.locationKind === 'authored');
    check('includeSource false omits preview', !analyze({ includeSource: false }).preview);
    const unknown = analyze({ projectFiles: [{ path: 'ship.xml', content: macro('ship', '<connections><connection ref="local"><macro ref="absent"/><macro ref="$runtime"/><unknown ref="weapon"/><macro ref="wrong"/></connection></connections>') }], focus: { origin: 'project', path: 'ship.xml' } });
    check('missing literal remains missing in complete catalogs', hasEdge(unknown, 'absent', 'missing'));
    check('catalog mapping must contain actual expected definition', hasEdge(unknown, 'wrong', 'missing'));
    check('dynamic and unknown contexts stay distinct', hasEdge(unknown, '$runtime', 'dynamic') && hasEdge(unknown, 'weapon', 'unsupported'));
    const omitted = analyze({ projectFiles: [{ path: 'index/macros.xml', content: '<index><entry name="omitted" value="assets/omitted"/></index>' },
      { path: 'assets/omitted.xml', content: undefined }], focus: { origin: 'project', path: 'index/macros.xml' } });
    check('known omitted project XML prevents an absence verdict', hasEdge(omitted, 'omitted', 'incomplete') && omitted.coverage.knownProjectFiles === 2
      && omitted.coverage.incomplete > 0 && omitted.coverage.reasons.some(reason => reason.includes('assets/omitted.xml')));
    const duplicates = analyze({ projectFiles: [...projectFiles, { path: 'other/custom_ship.xml', content: ship }], focus: { origin: 'project', path: 'libraries/wares.xml' } });
    check('duplicate defining files retain all candidates', duplicates.edges.some(edge => edge.symbol === 'custom_ship' && edge.status === 'ambiguous' && edge.targetIds.length === 2 && !edge.targetId));
    const duplicatePaths = analyze({ projectFiles: [{ path: 'same.xml', content: macro('same') }, { path: 'same.xml', content: macro('same', '<properties/>') }], focus: { origin: 'project', path: 'same.xml' } });
    check('conflicting path variants remain distinct with no preview winner', duplicatePaths.files.length === 2 && new Set(duplicatePaths.files.map(file => file.id)).size === 2 && !duplicatePaths.preview);
    const twoBasenames = analyze({ projectFiles: [{ path: 'one/same.xml', content: macro('one') }, { path: 'two/same.xml', content: macro('two') }], focus: { origin: 'project', path: 'one/same.xml' } });
    check('same basename preserves complete path identity', twoBasenames.files.some(file => file.path === 'one/same.xml') && twoBasenames.files.some(file => file.path === 'two/same.xml'));
    check('wildcard catalog names verify target definition', hasEdge(analyze({ projectFiles: [{ path: 'ship.xml', content: macro('ship', '<connections><connection><macro ref="patterned_one"/></connection></connections>') }], focus: { origin: 'project', path: 'ship.xml' } }), 'patterned_one'));
    check('wildcard matching handles overlap and bounded adversarial segments', xmlCatalogNameMatches('patterned_*', 'patterned_one') && !xmlCatalogNameMatches('a*a', 'a')
      && !xmlCatalogNameMatches('*a'.repeat(250) + 'b', 'a'.repeat(500)) && xmlCatalogNameMatches('a**b', 'ab'));
    const malformed = analyze({ projectFiles: [{ path: 'bad.xml', content: '<macros><macro name="bad"></macros>' }], focus: { origin: 'project', path: 'bad.xml' } });
    check('malformed XML exposes incomplete coverage', malformed.coverage.incomplete > 0 && malformed.coverage.reasons.some(reason => reason.includes('parser')));
    const source = '\uFEFF<macros>\r\n<!-- 😀 -->\r\n<macro name="probe"><connections><connection><macro ref="weap&#111;n"/></connection></connections></macro>\r\n</macros>';
    const extracted = analyzeXmlReferenceDocument({ origin: 'project', path: 'unicode.xml', content: source });
    const positioned = extracted.references.find(reference => reference.kind === 'macro');
    const rawLine = source.split('\r\n')[2];
    check('BOM CRLF unicode entity uses exact original attribute position', positioned?.value === 'weapon' && positioned.location.line === 3 && positioned.location.column === rawLine.indexOf('weap&#111;n') + 1);
    check('comments do not create file edges', analyzeXmlReferenceDocument({ origin: 'project', path: 'comment.xml', content: macro('comment', '<!-- <component ref="ghost"/> -->') }).references.length === 0);
    check('DTD/entity source is refused before navigation parsing', !analyzeXmlReferenceDocument({ origin: 'project', path: 'entity.xml', content: '<!DOCTYPE macros [<!ENTITY x "payload">]><macros/>' }).complete);
    let refused = false;
    try { analyze({ focus: { origin: 'reference', path: '../outside.xml' } }); } catch { refused = true; }
    check('traversal focus refuses before file access', refused);
    const outside = path.join(temporary, 'outside'); fs.mkdirSync(outside); fs.writeFileSync(path.join(outside, 'source.xml'), macro('outside'));
    fs.symlinkSync(outside, path.join(root, 'assets', 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    const escaped = analyze({ focus: { origin: 'reference', path: 'assets/escape/source.xml' } });
    check('physical symlink escape is never returned', !escaped.ok && !escaped.preview && escaped.coverage.reasons.some(reason => reason.includes('containment')));
    const originalCatalog = fs.readFileSync(path.join(root, 'index', 'macros.xml'), 'utf8');
    write('index/macros.xml', originalCatalog.replace('</index>', '<entry name="outside" value="assets/escape/source"/></index>'));
    const failedTarget = analyze({ projectFiles: [{ path: 'ship.xml', content: macro('ship', '<connections><connection><macro ref="outside"/></connection></connections>') }], focus: { origin: 'project', path: 'ship.xml' } });
    check('unreadable known target is incomplete rather than missing', hasEdge(failedTarget, 'outside', 'incomplete'));
    write('index/macros.xml', originalCatalog);
    check('zero depth has one focus and an explicit boundary', analyze({ maxDepth: 0 }).nodes.length === 1 && analyze({ maxDepth: 0 }).coverage.truncated);
    const incomingLeaf = analyze({ projectFiles: [{ path: 'leaf.xml', content: macro('leaf') },
      { path: 'caller.xml', content: macro('caller', '<connections><connection><macro ref="leaf"/></connection></connections>') }],
      focus: { origin: 'project', path: 'leaf.xml' }, maxDepth: 0 });
    check('zero-depth leaf reports omitted known incoming references', incomingLeaf.nodes.length === 1 && incomingLeaf.coverage.truncated && incomingLeaf.coverage.reasons.some(reason => reason.includes('incoming')));
    const limited = analyze({ maxNodes: 1, maxEdges: 1 });
    check('node and edge caps remain enforced', limited.nodes.length <= 1 && limited.edges.length <= 1 && limited.coverage.truncated);
    const responseBound = analyze({ context: { inputMode: 'x'.repeat(2 * 1024 * 1024) } });
    check('final JSON byte cap fails closed on oversized trusted context', Buffer.byteLength(JSON.stringify(responseBound)) <= responseBound.coverage.limits.maxResponseBytes && responseBound.coverage.truncated && !responseBound.context);
    const oversized = analyze({ projectFiles: [{ path: 'large.xml', content: ' '.repeat(2 * 1024 * 1024 + 1) }], focus: { origin: 'project', path: 'large.xml' } });
    check('oversized source is explicit unscanned coverage', !oversized.ok && oversized.coverage.truncated && oversized.coverage.reasons.some(reason => reason.includes('budget')));
    const cyclic = analyze({ projectFiles: [{ path: 'a.xml', content: macro('a', '<connections><connection><macro ref="b"/></connection></connections>') }, { path: 'b.xml', content: macro('b', '<connections><connection><macro ref="a"/></connection></connections>') }], focus: { origin: 'project', path: 'a.xml' } });
    check('cyclic references terminate and retain both directions', cyclic.nodes.length === 2 && cyclic.edges.filter(edge => edge.status === 'resolved').length === 2);
    write('extensions/ego_dlc_fixture/content.xml', '<content id="ego_dlc_fixture"/>');
    write('extensions/ego_dlc_fixture/index/macros.xml', '<index><entry name="dlc_ship" value="extensions\\ego_dlc_fixture\\assets\\dlc_ship"/></index>');
    write('extensions/ego_dlc_fixture/assets/dlc_ship.xml', macro('dlc_ship'));
    const macroConsumer = '<macros>\r\n<macro name="ship"><component ref="ship_component"/><component ref="unknown_component_clean"/><connections><connection><macro ref="dlc_ship"/><macro ref="weapon"/><macro ref="project_only"/><macro ref="unknown_macro_with_collection"/></connection></connections></macro>\r\n</macros>';
    const macroInputs = [{ path: 'ship.xml', content: macroConsumer }, { path: 'project_only.xml', content: macro('project_only') }];
    const dlc = analyze({ projectFiles: macroInputs, focus: { origin: 'project', path: 'ship.xml' } });
    const dlcShip = dlc.edges.find(edge => edge.sourceId === 'project:ship.xml' && edge.symbol === 'dlc_ship');
    const baseWeapon = dlc.edges.find(edge => edge.sourceId === 'project:ship.xml' && edge.symbol === 'weapon');
    check('DLC root-prefixed catalog candidate stays navigable but unqualified', dlcShip?.status === 'incomplete' && !!dlcShip.reason?.includes('#11')
      && dlcShip.targetIds.length === 1 && dlcShip.targetId === 'reference:extensions/ego_dlc_fixture/assets/dlc_ship.xml'
      && dlcShip.candidates?.[0]?.path === 'extensions/ego_dlc_fixture/assets/dlc_ship.xml'
      && dlc.files.some(file => file.id === dlcShip.targetId && file.complete && file.available), JSON.stringify(dlcShip));
    check('full DLC macro index retains base candidate without asserting its active identity', baseWeapon?.status === 'incomplete' && !!baseWeapon.reason?.includes('#11')
      && baseWeapon.targetIds.length === 1 && baseWeapon.targetId === 'reference:assets/weapon.xml', JSON.stringify(baseWeapon));
    check('unqualified macro candidate source positions stay exact and authored', [dlcShip, baseWeapon].every(edge => edge
      && edge.location.origin === 'project' && edge.location.path === 'ship.xml' && edge.location.kind === 'authored'
      && edge.location.line === 2 && edge.location.column === macroConsumer.split('\r\n')[1].indexOf(`ref="${edge.symbol}"`) + 6));
    check('full macro index does not taint complete component or independent project definitions', dlc.edges.some(edge =>
      edge.sourceId === 'project:ship.xml' && edge.symbol === 'ship_component' && edge.status === 'resolved' && edge.targetId === 'reference:assets/ship_component.xml')
      && dlc.edges.some(edge => edge.sourceId === 'project:ship.xml' && edge.symbol === 'project_only' && edge.status === 'resolved' && edge.targetId === 'project:project_only.xml'));
    check('unqualified macro absence stays incomplete while complete component absence stays missing', dlc.edges.some(edge =>
      edge.sourceId === 'project:ship.xml' && edge.symbol === 'unknown_macro_with_collection' && edge.status === 'incomplete' && !!edge.reason?.includes('#11') && edge.targetIds.length === 0)
      && dlc.edges.some(edge => edge.sourceId === 'project:ship.xml' && edge.symbol === 'unknown_component_clean' && edge.status === 'missing'));
    const rawIndex = analyze({ focus: { origin: 'reference', path: 'index/macros.xml' } });
    check('canonical catalog focus and preview describe the same raw contributor', rawIndex.edges.some(edge => edge.kind === 'index-file' && edge.symbol === 'weapon')
      && !rawIndex.edges.some(edge => edge.sourceId === 'reference:index/macros.xml' && edge.symbol === 'dlc_ship') && rawIndex.preview?.content.includes('name="weapon"'));
    const directDlcIndex = analyze({ projectFiles: [], focus: { origin: 'reference', path: 'extensions/ego_dlc_fixture/index/macros.xml' } });
    check('authored full DLC index file link retains independent real-file resolution', directDlcIndex.edges.some(edge =>
      edge.sourceId === 'reference:extensions/ego_dlc_fixture/index/macros.xml' && edge.kind === 'index-file' && edge.symbol === 'dlc_ship'
      && edge.status === 'resolved' && edge.targetId === 'reference:extensions/ego_dlc_fixture/assets/dlc_ship.xml'
      && edge.location.kind === 'authored' && edge.location.line === 1));
    check('authored base index file link is not downgraded by the full DLC catalog', rawIndex.edges.some(edge =>
      edge.sourceId === 'reference:index/macros.xml' && edge.kind === 'index-file' && edge.symbol === 'weapon' && edge.status === 'resolved' && edge.targetId === 'reference:assets/weapon.xml'));
    write('extensions/ego_dlc_fixture/assets/duplicate_weapon.xml', macro('weapon'));
    write('extensions/ego_dlc_fixture/index/macros.xml', '<index><entry name="dlc_ship" value="extensions/ego_dlc_fixture/assets/dlc_ship"/><entry name="weapon" value="extensions/ego_dlc_fixture/assets/duplicate_weapon"/></index>');
    const multipleCatalog = analyze({ projectFiles: macroInputs, focus: { origin: 'project', path: 'ship.xml' } });
    const multipleWeapon = multipleCatalog.edges.find(edge => edge.sourceId === 'project:ship.xml' && edge.symbol === 'weapon');
    check('unqualified catalog ambiguity preserves every candidate without a winner', multipleWeapon?.status === 'incomplete' && !!multipleWeapon.reason?.includes('#11')
      && !!multipleWeapon.reason?.includes('Multiple') && !multipleWeapon.targetId && multipleWeapon.targetIds.length === 2 && multipleWeapon.candidates?.length === 2
      && multipleWeapon.targetIds.includes('reference:assets/weapon.xml') && multipleWeapon.targetIds.includes('reference:extensions/ego_dlc_fixture/assets/duplicate_weapon.xml'), JSON.stringify(multipleWeapon));
    // End the full-collection fixture without removing the DLC asset used by the
    // later ware contributor. This grounded add uses the existing interpreter.
    write('extensions/ego_dlc_fixture/index/macros.xml', '<diff><add sel="/index"><entry name="dlc_ship" value="extensions/ego_dlc_fixture/assets/dlc_ship"/></add></diff>');
    write('extensions/ego_dlc_fixture/assets/dlc_component.xml', '<components><component name="dlc_component"/></components>');
    write('extensions/ego_dlc_fixture/index/components.xml', '<index><entry name="dlc_component" value="extensions/ego_dlc_fixture/assets/dlc_component"/></index>');
    const componentConsumer = '<macros>\r\n<macro name="ship"><component ref="dlc_component"/><component ref="ship_component"/><component ref="project_component"/><component ref="unknown_component_with_collection"/><connections><connection><macro ref="weapon"/><macro ref="unknown_macro_clean"/></connection></connections></macro>\r\n</macros>';
    const componentDlc = analyze({ projectFiles: [{ path: 'ship.xml', content: componentConsumer },
      { path: 'own_component.xml', content: '<components><component name="project_component"/></components>' }], focus: { origin: 'project', path: 'ship.xml' } });
    const dlcComponent = componentDlc.edges.find(edge => edge.sourceId === 'project:ship.xml' && edge.symbol === 'dlc_component');
    const baseComponent = componentDlc.edges.find(edge => edge.sourceId === 'project:ship.xml' && edge.symbol === 'ship_component');
    check('full DLC component index qualifies real DLC and retained base candidates separately from macros', dlcComponent?.status === 'incomplete'
      && !!dlcComponent.reason?.includes('#11') && dlcComponent.targetIds.length === 1 && dlcComponent.targetId === 'reference:extensions/ego_dlc_fixture/assets/dlc_component.xml'
      && baseComponent?.status === 'incomplete' && !!baseComponent.reason?.includes('#11') && baseComponent.targetIds.length === 1 && baseComponent.targetId === 'reference:assets/ship_component.xml', JSON.stringify([dlcComponent, baseComponent]));
    check('unqualified component candidate positions stay exact and authored', [dlcComponent, baseComponent].every(edge => edge
      && edge.location.origin === 'project' && edge.location.path === 'ship.xml' && edge.location.kind === 'authored'
      && edge.location.line === 2 && edge.location.column === componentConsumer.split('\r\n')[1].indexOf(`ref="${edge.symbol}"`) + 6));
    check('full component index does not taint complete macro or independent project definitions', componentDlc.edges.some(edge =>
      edge.sourceId === 'project:ship.xml' && edge.symbol === 'weapon' && edge.status === 'resolved' && edge.targetId === 'reference:assets/weapon.xml')
      && componentDlc.edges.some(edge => edge.sourceId === 'project:ship.xml' && edge.symbol === 'project_component' && edge.status === 'resolved' && edge.targetId === 'project:own_component.xml'));
    check('unqualified component absence stays incomplete while complete macro absence stays missing', componentDlc.edges.some(edge =>
      edge.sourceId === 'project:ship.xml' && edge.symbol === 'unknown_component_with_collection' && edge.status === 'incomplete' && !!edge.reason?.includes('#11') && edge.targetIds.length === 0)
      && componentDlc.edges.some(edge => edge.sourceId === 'project:ship.xml' && edge.symbol === 'unknown_macro_clean' && edge.status === 'missing'));
    write('extensions/ego_dlc_fixture/index/components.xml', '<diff/>');
    const wareConsumer = (id: string) => `<wares><ware id="consumer"><production><primary><ware ware="${id}" amount="1"/></primary></production></ware></wares>`;
    const canonicalWare = analyze({ projectFiles: [{ path: 'consumer.xml', content: wareConsumer('energycells') }], focus: { origin: 'project', path: 'consumer.xml' } });
    check('canonical ware links the actual libraries source', canonicalWare.edges.some(edge => edge.kind === 'ware' && edge.symbol === 'energycells' && edge.status === 'resolved'
      && edge.targetId === 'reference:libraries/wares.xml'));
    write('extensions/ego_dlc_fixture/libraries/wares.xml', '<diff><add sel="/wares"><ware id="dlc_fuel"><component ref="dlc_ship"/></ware></add></diff>');
    const dlcWare = analyze({ projectFiles: [{ path: 'consumer.xml', content: wareConsumer('dlc_fuel') }], focus: { origin: 'project', path: 'consumer.xml' } });
    check('DLC diff ware has an actual contributor source', dlcWare.edges.some(edge => edge.kind === 'ware' && edge.symbol === 'dlc_fuel' && edge.status === 'resolved'
      && edge.targetId === 'reference:extensions/ego_dlc_fixture/libraries/wares.xml')
      && dlcWare.edges.some(edge => edge.sourceId === 'reference:extensions/ego_dlc_fixture/libraries/wares.xml' && edge.kind === 'macro'
        && edge.symbol === 'dlc_ship' && edge.status === 'resolved' && edge.targetId === 'reference:extensions/ego_dlc_fixture/assets/dlc_ship.xml'));
    const ownWare = analyze({ projectFiles: [{ path: 'consumer.xml', content: wareConsumer('energycells') },
      { path: 'libraries/wares.xml', content: '<wares><ware id="energycells" name="Authored override"/></wares>' }], focus: { origin: 'project', path: 'consumer.xml' } });
    check('project logical ware override keeps its source authority', ownWare.edges.some(edge => edge.symbol === 'energycells' && edge.status === 'resolved' && edge.targetId === 'project:libraries/wares.xml'));
    write('extensions/ego_dlc_fixture/libraries/wares.xml', '<diff><add sel="/wares"><ware id="dlc_fuel"/></add><remove sel="/wares/ware[@id=\'removed_ware\']"/><replace sel="/wares/ware[@id=\'rename_ware\']/@id">renamed_ware</replace></diff>');
    for (const historical of ['removed_ware', 'rename_ware']) {
      const historicalWare = analyze({ projectFiles: [{ path: 'consumer.xml', content: wareConsumer(historical) }], focus: { origin: 'project', path: 'consumer.xml' } });
      check(`historical ${historical} is not an active resolved ware`, historicalWare.edges.some(edge => edge.symbol === historical && edge.status === 'incomplete'
        && edge.reason?.includes('historical')));
    }
    const renamedWare = analyze({ projectFiles: [{ path: 'consumer.xml', content: wareConsumer('renamed_ware') }], focus: { origin: 'project', path: 'consumer.xml' } });
    check('active rename without raw declaration attribution is never missing', hasEdge(renamedWare, 'renamed_ware', 'incomplete') && !hasEdge(renamedWare, 'renamed_ware', 'missing'));
    write('extensions/ego_dlc_fixture/libraries/wares.xml', '<wares><ware id="full_collection_fuel"/></wares>');
    const fullWareCollection = analyze({ projectFiles: [{ path: 'consumer.xml', content: wareConsumer('energycells') }], focus: { origin: 'project', path: 'consumer.xml' } });
    check('unqualified full collection composition retains incomplete source candidate', hasEdge(fullWareCollection, 'energycells', 'incomplete') && fullWareCollection.coverage.reasons.some(reason => reason.includes('#11')));
    fs.unlinkSync(path.join(root, 'extensions', 'ego_dlc_fixture', 'libraries', 'wares.xml'));
    write('assets/many_refs.xml', macro('many_refs', '<connections><connection>'.concat('<macro ref="bullet"/>'.repeat(2001), '</connection></connections>')));
    const incompleteProject = analyze({ projectFiles: [{ path: 'assets/many_refs.xml', content: '<diff><add sel="/macros/macro/properties"><property/></add></diff>' },
      { path: 'consumer.xml', content: macro('consumer', '<connections><connection><macro ref="unknown_with_effective_gap"/></connection></connections>') }], focus: { origin: 'project', path: 'consumer.xml' } });
    check('incomplete effective project inventory prevents unrelated false missing', hasEdge(incompleteProject, 'unknown_with_effective_gap', 'incomplete'));
    const extensions = path.join(root, 'extensions');
    const movedExtensions = path.join(root, 'extensions-owned-backup');
    fs.renameSync(extensions, movedExtensions);
    fs.writeFileSync(extensions, 'not a directory');
    try {
      const unreadableDlcDirectory = analyze({ projectFiles: [{ path: 'consumer.xml', content: macro('consumer', '<connections><connection><macro ref="unknown_with_dlc_gap"/></connection></connections>') }], focus: { origin: 'project', path: 'consumer.xml' } });
      check('non-ENOENT DLC enumeration failure prevents absence verdict', hasEdge(unreadableDlcDirectory, 'unknown_with_dlc_gap', 'incomplete') && unreadableDlcDirectory.coverage.reasons.some(reason => reason.includes('enumerated')));
    } finally { fs.unlinkSync(extensions); fs.renameSync(movedExtensions, extensions); }
    write('extensions/ego_dlc_fixture/assets/weapon.xml', '<diff><replace sel="/macros/macro/properties/bullet/@class">bullet_b</replace></diff>');
    const overlay = analyze({ focus: { origin: 'reference', path: 'assets/weapon.xml' } });
    check('official overlay uses existing composition and truthful positions', overlay.edges.some(edge => edge.symbol === 'bullet_b' && edge.status === 'resolved' && edge.location.kind === 'effective' && edge.location.line === undefined) && overlay.preview?.content.includes('class="bullet"'));
    const patch = '<diff>\r\n<replace sel="/macros/macro/properties/bullet/@class">bullet</replace>\r\n</diff>';
    const patched = analyze({ projectFiles: [{ path: 'assets/weapon.xml', content: patch }], focus: { origin: 'project', path: 'assets/weapon.xml' } });
    const patchEdge = patched.edges.find(edge => edge.kind === 'bullet');
    check('project diff written attribute retains exact authored patch coordinate', patchEdge?.symbol === 'bullet' && patchEdge.location.kind === 'authored' && patchEdge.location.line === 2 && patchEdge.location.column === patch.split('\r\n')[1].indexOf('>bullet') + 2 && patched.preview?.content.includes('<replace'));
    check('inherited project diff edges have no invented raw patch coordinate', patched.edges.some(edge => edge.kind === 'component' && edge.location.kind === 'effective' && edge.location.line === undefined));
    const catalogPatch = analyze({ projectFiles: [{ path: 'index/macros.xml', content: '<diff><replace sel="/index/entry[@name=\'weapon\']/@value">assets/weapon</replace></diff>' }], focus: { origin: 'project', path: 'index/macros.xml' } });
    check('project index diff operates on base plus DLC candidate registry', catalogPatch.edges.some(edge => edge.kind === 'index-file' && edge.symbol === 'weapon' && edge.status === 'resolved'));
    write('assets/alternative_weapon.xml', macro('weapon'));
    const variantPatch = (target: string) => `<diff><replace sel="/index/entry[@name='weapon']/@value">${target}</replace></diff>`;
    const catalogVariants = analyze({ projectFiles: [{ path: 'ship.xml', content: macro('ship', '<connections><connection><macro ref="weapon"/></connection></connections>') },
      { path: 'index/macros.xml', content: variantPatch('assets/weapon') }, { path: 'index/macros.xml', content: variantPatch('assets/alternative_weapon') }], focus: { origin: 'project', path: 'ship.xml' } });
    check('conflicting project catalog diffs retain independent candidate branches', catalogVariants.edges.some(edge => edge.symbol === 'weapon' && edge.status === 'ambiguous' && edge.targetIds.length === 2));
    write('assets/expansion.xml', macro('expansion', `<connections>${'<connection name="slot"/>'.repeat(1000)}</connections>`));
    const expansionPatch = `<diff><add sel="/macros/macro/connections/connection"><payload>${'x'.repeat(16_000)}</payload></add></diff>`;
    const expansion = analyze({ projectFiles: [{ path: 'assets/expansion.xml', content: expansionPatch }], focus: { origin: 'project', path: 'assets/expansion.xml' } });
    check('multiplying patch is refused before unbounded simulation', expansion.coverage.incomplete > 0 && expansion.files.some(file => file.reason?.includes('not executed')));
    const excessiveOperations = analyze({ projectFiles: [{ path: 'assets/weapon.xml', content: `<diff>${'<remove sel="/macros/macro/no_such_node"/>'.repeat(129)}</diff>` }], focus: { origin: 'project', path: 'assets/weapon.xml' } });
    check('composition operation count cap is explicit', excessiveOperations.coverage.incomplete > 0 && excessiveOperations.files.some(file => file.reason?.includes('not executed')));
    write('extensions/ego_dlc_fixture/assets/weapon.xml', '<diff><remove sel="//*["/></diff>');
    const incompleteOverlay = analyze({ focus: { origin: 'reference', path: 'assets/weapon.xml' } });
    const failedOverlayId = 'reference:assets/weapon.xml';
    const failedOverlayFile = incompleteOverlay.files.find(file => file.id === failedOverlayId);
    const failedOutgoing = incompleteOverlay.edges.filter(edge => edge.sourceId === failedOverlayId);
    check('failed official overlay retains explicit incomplete source and refusal evidence', failedOverlayFile?.complete === false
      && failedOverlayFile.available && !!failedOverlayFile.reason?.includes('composition') && incompleteOverlay.coverage.incomplete > 0);
    check('failed official overlay never produces resolved outgoing edges', failedOutgoing.length === 2
      && failedOutgoing.some(edge => edge.kind === 'component' && edge.symbol === 'weapon_component')
      && failedOutgoing.some(edge => edge.kind === 'bullet' && edge.symbol === 'bullet')
      && failedOutgoing.every(edge => edge.status === 'incomplete' && edge.targetIds.length === 0));
    check('failed official overlay retains an incomplete navigable incoming candidate', incompleteOverlay.edges.some(edge =>
      edge.sourceId === 'project:assets/custom_ship.xml' && edge.symbol === 'weapon' && edge.status === 'incomplete' && edge.targetIds.includes(failedOverlayId)));
    check('failed official overlay preserves independently resolved complete neighbors', incompleteOverlay.edges.some(edge =>
      edge.sourceId === 'project:assets/custom_ship.xml' && edge.symbol === 'ship_component' && edge.status === 'resolved'
      && edge.targetIds.includes('reference:assets/ship_component.xml'))
      && incompleteOverlay.edges.some(edge => edge.sourceId === 'project:index/macros.xml' && edge.symbol === 'custom_ship'
        && edge.status === 'resolved' && edge.targetIds.includes('project:assets/custom_ship.xml')));
    write('libraries/probe.xsd', '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:simpleType name="macroname"><xs:restriction base="xs:string"/></xs:simpleType><xs:simpleType name="factionlookup"><xs:restriction base="xs:string"/></xs:simpleType><xs:element name="probe"><xs:complexType><xs:attribute name="target" type="macroname"/><xs:attribute name="owner" type="factionlookup"/></xs:complexType></xs:element></xs:schema>');
    clearReferenceCorpusCache(); clearReferenceLanguageCaches();
    const corpus = getReferenceCorpus(root);
    const schemaBound = analyze({ projectFiles: [{ path: 'probe.xml', content: '<probe xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="probe.xsd" target="bullet" owner="argon"/>' }], focus: { origin: 'project', path: 'probe.xml' },
      schemaForDocument: (filePath, content) => getReferenceLanguageResources(corpus, { path: filePath, content }) });
    check('existing configured schema registry supplies typed asset binding', hasEdge(schemaBound, 'bullet'));
    check('schema-bound out-of-scope namespace is explicit unsupported', schemaBound.edges.some(edge => edge.symbol === 'argon' && edge.status === 'unsupported' && edge.reason?.includes('schema')));
    check('shared contextual binding controls pass and legacy completion stays unchanged', runReferenceBindingsSelftest().allPassed && typedReferenceKind('component') === 'macro');
    const externalIndex = path.join(temporary, 'external-index'); fs.mkdirSync(externalIndex);
    fs.writeFileSync(path.join(externalIndex, 'macros.xml'), '<index><entry name="unreadable" value="private"/></index>');
    write('extensions/ego_dlc_unreadable/content.xml', '<content id="ego_dlc_unreadable"/>');
    fs.symlinkSync(externalIndex, path.join(root, 'extensions', 'ego_dlc_unreadable', 'index'), process.platform === 'win32' ? 'junction' : 'dir');
    const catalogGap = analyze({ projectFiles: [{ path: 'ship.xml', content: macro('ship', '<connections><connection><macro ref="unknown_with_catalog_gap"/></connection></connections>') }], focus: { origin: 'project', path: 'ship.xml' } });
    check('unreadable optional DLC catalog prevents false missing', hasEdge(catalogGap, 'unknown_with_catalog_gap', 'incomplete') && catalogGap.coverage.incomplete > 0);
  } catch (error) { check('selftest fixture completed', false, error instanceof Error ? error.message : String(error)); }
  finally {
    clearReferenceCorpusCache(); clearReferenceLanguageCaches();
    if (path.dirname(path.resolve(temporary)) !== path.resolve(os.tmpdir()) || !path.basename(temporary).startsWith('forge-xml-reference-map-')) {
      check('selftest fixture cleanup containment', false, 'Refusing unsafe XML reference fixture cleanup.');
    } else {
      try { fs.rmSync(temporary, { recursive: true, force: true }); }
      catch (error) { check('selftest fixture cleanup completed', false, error instanceof Error ? error.message : String(error)); }
    }
  }
  return { pass: checks.every(item => item.pass), passed: checks.filter(item => item.pass).length, total: checks.length, checks };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = runXmlReferenceMapSelftest();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.pass) process.exitCode = 1;
}
