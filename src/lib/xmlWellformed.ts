/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deterministic XML well-formedness check — the layer BELOW the graph importer.
 *
 * Why this exists: the importer parses with `@xmldom/xmldom`, which (unlike the browser's
 * native DOMParser) does NOT surface a `<parsererror>` element for a mismatched/unclosed
 * tag. It reports the problem to an error handler and then hands back a *partial* tree, so a
 * file like `<do_if>…</do_elseif>` ("Opening and ending tag mismatch", which X4 rejects on
 * load) imported "successfully" and the Forge reported it valid. This pass closes that gap.
 *
 * It is a standalone tag-stack scanner — it does not rely on any XML library's leniency, so
 * its verdict is the same on host (Node) and in the browser. It catches exactly the class
 * that bit us: mismatched closing tags, unclosed tags at EOF, and stray closing tags, while
 * correctly skipping comments, CDATA, processing instructions, declarations, and `>` chars
 * that live inside quoted attribute values.
 */

export interface XmlWellformedError {
  line: number;
  col: number;
  message: string;
}
export interface XmlWellformedResult {
  ok: boolean;
  errors: XmlWellformedError[];
}

/** Scan raw XML text and report well-formedness errors with 1-based line/col positions. */
export function checkXmlWellformed(xml: string): XmlWellformedResult {
  const text = String(xml ?? '');
  const N = text.length;
  const errors: XmlWellformedError[] = [];
  const stack: { name: string; line: number; col: number }[] = [];

  let i = 0;
  let line = 1;
  let col = 1;

  // Advance the cursor by n chars, keeping line/col in sync.
  const adv = (n: number) => {
    for (let k = 0; k < n && i < N; k++) {
      if (text[i] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };

  while (i < N) {
    if (text[i] !== '<') {
      adv(1);
      continue;
    }

    const startLine = line;
    const startCol = col;

    // <!-- comment -->
    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end === -1) {
        errors.push({ line: startLine, col: startCol, message: 'Unterminated comment (<!-- with no -->).' });
        break;
      }
      adv(end + 3 - i);
      continue;
    }
    // <![CDATA[ ... ]]>
    if (text.startsWith('<![CDATA[', i)) {
      const end = text.indexOf(']]>', i + 9);
      if (end === -1) {
        errors.push({ line: startLine, col: startCol, message: 'Unterminated CDATA section.' });
        break;
      }
      adv(end + 3 - i);
      continue;
    }
    // <!DOCTYPE ...> and other declarations
    if (text.startsWith('<!', i)) {
      const end = text.indexOf('>', i + 2);
      if (end === -1) {
        errors.push({ line: startLine, col: startCol, message: 'Unterminated declaration (<! ...).' });
        break;
      }
      adv(end + 1 - i);
      continue;
    }
    // <? processing instruction ?>
    if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2);
      if (end === -1) {
        errors.push({ line: startLine, col: startCol, message: 'Unterminated processing instruction (<? ...).' });
        break;
      }
      adv(end + 2 - i);
      continue;
    }

    // A start/end/self-closing tag. Read its name, then scan to '>' skipping quoted attr values.
    let j = i + 1;
    const isClose = text[j] === '/';
    if (isClose) j++;
    let name = '';
    while (j < N && !/[\s/>]/.test(text[j])) {
      name += text[j];
      j++;
    }

    let selfClose = false;
    let closed = false;
    while (j < N) {
      const c = text[j];
      if (c === '"' || c === "'") {
        const q = c;
        j++;
        while (j < N && text[j] !== q) j++;
        if (j >= N) break; // unterminated quote → tag won't close, handled below
        j++; // consume closing quote
        continue;
      }
      if (c === '>') {
        if (text[j - 1] === '/') selfClose = true;
        closed = true;
        j++;
        break;
      }
      j++;
    }

    if (!closed) {
      errors.push({ line: startLine, col: startCol, message: `Unterminated tag <${name || '?'}> (no closing '>').` });
      break;
    }

    adv(j - i);

    if (!name) {
      errors.push({ line: startLine, col: startCol, message: "Malformed '<' (not a valid tag start; raw '<' must be escaped as &lt;)." });
      continue;
    }

    if (isClose) {
      if (stack.length === 0) {
        errors.push({ line: startLine, col: startCol, message: `Unexpected closing tag </${name}> — no open element to close.` });
      } else {
        const top = stack[stack.length - 1];
        if (top.name !== name) {
          errors.push({
            line: startLine,
            col: startCol,
            message: `Opening and ending tag mismatch: <${top.name}> (line ${top.line}) closed by </${name}>.`,
          });
        }
        stack.pop();
      }
    } else if (!selfClose) {
      stack.push({ name, line: startLine, col: startCol });
    }
  }

  for (const el of stack) {
    errors.push({ line: el.line, col: el.col, message: `Unclosed tag <${el.name}> (opened here, never closed).` });
  }

  return { ok: errors.length === 0, errors };
}

/* ------------------------------------------------------------------ *
 * Self-test oracle. House contract: { allPassed, passed, total, checks }.
 * ------------------------------------------------------------------ */
export function runXmlWellformedSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });

  // Well-formed: nested elements, self-close, attributes containing '>' and quotes, a comment,
  // CDATA, a processing instruction. Must pass clean.
  const good = `<?xml version="1.0"?>
<mdscript name="t">
  <!-- a comment with a > and a </fake> inside it -->
  <cues>
    <cue name="c">
      <conditions><event_game_loaded /></conditions>
      <actions>
        <do_if value="$a gt 1 and $b lt 2">
          <set_value name="$x" exact="'&gt;'" />
        </do_if>
        <do_elseif value="$c">
          <debug_text text="x" />
        </do_elseif>
        <do_else>
          <debug_text text="y" />
        </do_else>
        <![CDATA[ <not a tag> ]]>
      </actions>
    </cue>
  </cues>
</mdscript>`;
  const rGood = checkXmlWellformed(good);
  ok('wellformed_clean', rGood.ok, rGood.errors);

  // The exact bug class: <do_if> closed by </do_elseif>.
  const mismatch = `<mdscript><cues><cue><actions>
    <do_if value="$a">
      <debug_text text="x" />
    </do_elseif>
  </actions></cue></cues></mdscript>`;
  const rMis = checkXmlWellformed(mismatch);
  ok('mismatch_detected', !rMis.ok && rMis.errors.some((e) => /mismatch/i.test(e.message)), rMis.errors);

  // Unclosed tag at EOF.
  const unclosed = `<mdscript><cues><cue><actions><do_if value="$a"></actions></cue></cues></mdscript>`;
  const rUn = checkXmlWellformed(unclosed);
  ok('unclosed_detected', !rUn.ok && rUn.errors.some((e) => /Unclosed|mismatch/i.test(e.message)), rUn.errors);

  // Stray closing tag with nothing open.
  const stray = `</mdscript>`;
  const rStray = checkXmlWellformed(stray);
  ok('stray_close_detected', !rStray.ok && rStray.errors.some((e) => /Unexpected closing/i.test(e.message)), rStray.errors);

  // Unterminated comment.
  const badComment = `<mdscript><!-- never ends`;
  const rBc = checkXmlWellformed(badComment);
  ok('unterminated_comment_detected', !rBc.ok && rBc.errors.some((e) => /comment/i.test(e.message)), rBc.errors);

  // A '>' inside a quoted attribute value must NOT be read as tag end.
  const attrGt = `<mdscript><cue value="a > b" /></mdscript>`;
  const rAttr = checkXmlWellformed(attrGt);
  ok('attr_gt_not_tag_end', rAttr.ok, rAttr.errors);

  const passed = checks.filter((c) => c.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}
