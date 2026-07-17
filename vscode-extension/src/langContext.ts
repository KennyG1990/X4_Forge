/**
 * langContext.ts — B56s3 (2026-07-17): vscode-free cursor-context parser for the X4
 * IntelliSense providers. Lightweight backward scan — never a full DOM parse per
 * keystroke (the provider budget is <100ms warm; the server does the schema work).
 */

export interface XmlCursorContext {
  /** nearest still-open ancestor element at the cursor (null at document root) */
  parentTag: string | null;
  /** when the cursor sits INSIDE an open tag `<name …|`, that tag's name */
  inTag: string | null;
  /** attribute name when the cursor is inside its ="…" value (implies inTag) */
  inAttrValue: string | null;
  /** true when the cursor is right after `<` (element-name position) */
  elementStart: boolean;
  /** root element name of the document, when one exists before the cursor */
  rootTag: string | null;
}

/** Strip comments/CDATA (preserving length via spaces so offsets survive). */
function blank(text: string): string {
  return text
    .replace(/<!--[\s\S]*?(-->|$)/g, (m) => " ".repeat(m.length))
    .replace(/<!\[CDATA\[[\s\S]*?(\]\]>|$)/g, (m) => " ".repeat(m.length));
}

export function xmlCursorContext(fullText: string, offset: number): XmlCursorContext {
  const text = blank(fullText.slice(0, Math.max(0, offset)));

  // Root tag: first real element in the (blanked) prefix.
  const rootMatch = /<(?!\?|!|\/)([A-Za-z_][\w.:-]*)/.exec(text);
  const rootTag = rootMatch ? rootMatch[1].toLowerCase() : null;

  // Are we inside an open tag? Find the last '<' and check for an unclosed tag body.
  const lastLt = text.lastIndexOf("<");
  const lastGt = text.lastIndexOf(">");
  let inTag: string | null = null;
  let inAttrValue: string | null = null;
  let elementStart = false;
  if (lastLt > lastGt) {
    const body = text.slice(lastLt + 1);
    if (!body.startsWith("?") && !body.startsWith("!")) {
      const nameMatch = /^\/?([A-Za-z_][\w.:-]*)?/.exec(body);
      const name = nameMatch?.[1]?.toLowerCase() || null;
      if (/^\/?[A-Za-z_.\w:-]*$/.test(body)) {
        // still typing the element name itself: `<`, `<cre`, `</cue`
        elementStart = !body.startsWith("/");
      } else if (name) {
        inTag = name;
        // inside an attribute value? count unescaped quotes after the name
        const attrMatch = /([A-Za-z_][\w.:-]*)\s*=\s*"[^"]*$/.exec(body);
        if (attrMatch) inAttrValue = attrMatch[1].toLowerCase();
      }
    }
  }

  // Ancestor stack over COMPLETE tags in the prefix (self-closing tags pop immediately).
  const stack: string[] = [];
  const tagRe = /<(\/)?([A-Za-z_][\w.:-]*)((?:"[^"]*"|[^"<>])*?)(\/)?>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(text)) !== null) {
    const [, close, name, , selfClose] = m;
    if (close) {
      const want = name.toLowerCase();
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i] === want) { stack.length = i; break; }
      }
    } else if (!selfClose) {
      stack.push(name.toLowerCase());
    }
  }
  const parentTag = stack.length ? stack[stack.length - 1] : null;

  return { parentTag, inTag, inAttrValue, elementStart, rootTag };
}

/* ------------------------------------------------------------------ *
 * Selftest — run headlessly: npx tsx vscode-extension/src/langContext.ts
 * ------------------------------------------------------------------ */

export function runLangContextSelftest() {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, ...(detail ? { detail } : {}) });
  const at = (doc: string) => {
    const offset = doc.indexOf("|");
    return xmlCursorContext(doc.replace("|", ""), offset);
  };

  const base = '<?xml version="1.0"?><mdscript name="X"><cues><cue name="C"><actions>';
  let c = at(base + "<|");
  ok("element_start_inside_actions", c.elementStart === true && c.parentTag === "actions", JSON.stringify(c));
  c = at(base + "<set_val|");
  ok("partial_name_keeps_parent", c.elementStart === true && c.parentTag === "actions");
  c = at(base + '<set_value |');
  ok("inside_open_tag_attrs", c.inTag === "set_value" && c.elementStart === false);
  c = at(base + '<set_value name="$x" exact="|');
  ok("inside_attr_value", c.inTag === "set_value" && c.inAttrValue === "exact");
  c = at(base + '<set_value name="$x"/><|');
  ok("self_closing_pops", c.parentTag === "actions" && c.elementStart === true);
  c = at(base + "<do_if>...</do_if><|".replace("...", '<set_value name="a"/>'));
  ok("close_tag_pops", c.parentTag === "actions");
  c = at('<mdscript><cues><cue><conditions><|');
  ok("conditions_parent", c.parentTag === "conditions");
  c = at("<!-- <fake><deeper> --><mdscript><|");
  ok("comments_blanked", c.parentTag === "mdscript" && c.rootTag === "mdscript");
  c = at("|");
  ok("empty_doc_safe", c.parentTag === null && c.rootTag === null && c.inTag === null);
  c = at("<diff><add sel=\"/factions\"><|");
  ok("diff_payload_parent", c.parentTag === "add" && c.rootTag === "diff");

  const passed = checks.filter(ch => ch.pass).length;
  return { allPassed: passed === checks.length, passed, total: checks.length, checks };
}

// Headless runner: `npx tsx vscode-extension/src/langContext.ts`
if (typeof require !== "undefined" && require.main === module) {
  const r = runLangContextSelftest();
  console.log(`langContext selftest: ${r.passed}/${r.total} allPassed=${r.allPassed}`);
  for (const ch of r.checks) if (!ch.pass) console.log("FAIL", ch.name, ch.detail || "");
  process.exit(r.allPassed ? 0 : 1);
}
