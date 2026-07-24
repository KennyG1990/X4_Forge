import { getReferenceCorpus } from '../src/lib/referenceCorpus';

const root = process.env.X4_REFERENCE_ROOT || 'F:\\Downskies\\x4unpackersuiteV1\\X4 unpacked 9.00';
const corpus = getReferenceCorpus(root, true);
const macroSourceFiles = corpus.sourceFiles.filter((file) => file.toLowerCase().endsWith('index/macros.xml'));
const requiredFactions = ['fallensplit', 'kaori', 'holyorderfanatic', 'loanshark', 'trinity'];
const checks = [
  { name: 'exact faction count', pass: corpus.factions.length === 32, detail: String(corpus.factions.length) },
  ...requiredFactions.map((id) => ({ name: `faction ${id}`, pass: corpus.factions.some((faction) => faction.id === id), detail: '' })),
  { name: 'riptide absent', pass: !corpus.factions.some((faction) => faction.id === 'riptide'), detail: '' },
  { name: 'base macro index discovered', pass: macroSourceFiles.includes('index/macros.xml'), detail: macroSourceFiles.join(', ') },
  { name: 'base ship macro indexed', pass: corpus.references.macros.has('ship_arg_l_destroyer_01_a_macro'), detail: String(corpus.references.macros.size) },
  { name: 'base station macro indexed', pass: corpus.references.macros.has('defence_arg_tube_01_macro'), detail: String(corpus.references.macros.size) },
];

for (const check of checks) console.log(`${check.pass ? 'PASS' : 'FAIL'} ${check.name}${check.detail ? ` (${check.detail})` : ''}`);
console.log(`[reference-corpus-check] ${checks.filter((check) => check.pass).length}/${checks.length} PASS; sources=${corpus.sourceFiles.length} wares=${corpus.wares.length} sectors=${corpus.sectors.length} macros=${corpus.references.macros.size}`);
process.exit(checks.every((check) => check.pass) ? 0 : 1);
