import assert from 'node:assert/strict';
import { WIKI_TOPICS } from '../../lib/forgeKnowledge';
import { MOD_PATTERNS, buildPatternWorkspace } from '../../lib/modPatterns';
import { LUA_SNIPPETS } from '../../lib/luaSnippets';
import { generateMDXML } from '../../types';
import {
  parseInlineMarkdown,
  parseMarkdownBlocks,
  tokenizeCode,
  type InlineToken,
} from './docsRenderer';

function collectPlainText(tokens: InlineToken[]): string {
  return tokens
    .map(tok => {
      if (tok.kind === 'strong') return collectPlainText(tok.children);
      return tok.text;
    })
    .join('');
}

const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
function check(name: string, fn: () => void) {
  try {
    fn();
    checks.push({ name, pass: true });
  } catch (error) {
    checks.push({ name, pass: false, detail: error instanceof Error ? error.stack || error.message : String(error) });
  }
}

check('mdscript_basics parses heading, bullets, bold, and inline code without residual **', () => {
  const basics = WIKI_TOPICS.find(topic => topic.id === 'mdscript_basics');
  assert.ok(basics);
  const blocks = parseMarkdownBlocks(basics.content);
  assert.ok(blocks.some(b => b.kind === 'heading' && b.text === '1. The Cue Hierarchy'));
  assert.ok(blocks.some(b => b.kind === 'ul' && b.items.length >= 2));
  for (const block of blocks) {
    const texts = block.kind === 'ul' || block.kind === 'ol' ? block.items : [block.text];
    for (const entry of texts) {
      const tokens = parseInlineMarkdown(entry);
      const rendered = collectPlainText(tokens);
      assert.equal(rendered.includes('**'), false, `Residual ** found in: ${rendered}`);
    }
  }
  const nested = parseInlineMarkdown('**`<conditions>`**: Triggers');
  assert.equal(nested[0].kind, 'strong');
  if (nested[0].kind === 'strong') {
    assert.equal(nested[0].children[0].kind, 'code');
    if (nested[0].children[0].kind === 'code') {
      assert.equal(nested[0].children[0].text, '<conditions>');
    }
  }
});

check('bullets preserve internal hyphens and numbered ordered lists parse cleanly', () => {
  const blocks = parseMarkdownBlocks('### Proven Guards\n- foo-bar: keeps hyphen\n\n1. First step-one\n2. Second step');
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].kind, 'heading');
  assert.equal(blocks[1].kind, 'ul');
  if (blocks[1].kind === 'ul') assert.equal(blocks[1].items[0], 'foo-bar: keeps hyphen');
  assert.equal(blocks[2].kind, 'ol');
  if (blocks[2].kind === 'ol') assert.deepEqual(blocks[2].items, ['First step-one', 'Second step']);
});

check('negative inputs: empty, unclosed markdown, and malformed XML do not throw or drop text', () => {
  assert.deepEqual(parseMarkdownBlocks(''), []);
  assert.deepEqual(parseMarkdownBlocks('   \n  '), []);
  assert.equal(collectPlainText(parseInlineMarkdown('unclosed **bold and `code')), 'unclosed **bold and `code');
  const malformedXml = '<cue name="broken" attr="unterminated';
  const xmlTokens = tokenizeCode(malformedXml, 'xml');
  assert.equal(xmlTokens.map(t => t.text).join(''), malformedXml);
});

check('tokenizeCode is 100% lossless across all WIKI_TOPICS, MOD_PATTERNS XML, and LUA_SNIPPETS', () => {
  for (const topic of WIKI_TOPICS) {
    if (!topic.codeTemplate) continue;
    const lang = topic.category === 'luaui' ? 'lua' : 'xml';
    const tokens = tokenizeCode(topic.codeTemplate, lang);
    assert.equal(tokens.map(t => t.text).join(''), topic.codeTemplate, `Lossy token split on topic ${topic.id}`);
  }
  for (const pattern of MOD_PATTERNS) {
    const xml = generateMDXML(buildPatternWorkspace(pattern.id));
    const tokens = tokenizeCode(xml, 'xml');
    assert.equal(tokens.map(t => t.text).join(''), xml, `Lossy XML token split on pattern ${pattern.id}`);
  }
  for (const snippet of LUA_SNIPPETS) {
    const tokens = tokenizeCode(snippet.lua, 'lua');
    assert.equal(tokens.map(t => t.text).join(''), snippet.lua, `Lossy Lua token split on snippet ${snippet.id}`);
    assert.ok(tokens.some(t => t.kind === 'placeholder'), `Expected <PLACEHOLDER> token in ${snippet.id}`);
  }
});

const passed = checks.filter(c => c.pass).length;
const ok = passed === checks.length;
console.log(JSON.stringify({ ok, passed, total: checks.length, checks }, null, 2));
if (!ok) process.exit(1);
