# B48 · Retire the hand-rolled code editor (Monaco core swap + real-estate pass) — SPECIFIED 2026-07-15

Lane: FULL. Ken's framing: "heart surgery — lots of elements baked into this UI element";
goals = stop maintaining a from-scratch editor AND reclaim screen real estate for the canvas.

## Reconcile — the surgery is smaller than feared (verified 2026-07-15)
- The entire editor is **ONE component**: `src/components/CodePreview.tsx` (1,255 lines),
  rendered at exactly **one mount** (App.tsx:1916), with a ~20-prop contract.
- The shared state that "bakes it in" (`activeEditorFile`/`EditorFile`) is referenced by only
  App.tsx (4 refs) + CodePreview itself (38). SnapshotManager feeds `snapshotDiffWorkspace`
  through props. **No other component touches editor internals.**
- Everything Ken fears losing (tabs, Compile, Apply-back, Copy, Download, diff toggle,
  snapshot diff, topBar portal, auto-save) is CHROME inside CodePreview — it survives; only
  the text-rendering + diff CORE gets replaced.
- ⇒ This is a **valve replacement inside one organ**, not open-heart: swap the internals,
  keep the shell, props, and every pipeline wire (apply→validate→CAS untouched).

## PRESERVATION CONTRACT (Ken, 2026-07-15 — "make sure we don't lose these other elements")
Inventoried from CodePreview.tsx source; EVERY item below must exist and work after the swap.
Post-swap acceptance = walk this list in the rendered UI, item by item:

1. **File tabs** (MD.xml / UI_LAYOUT.xml / per-file) incl. the `topBarTarget` portal mode
   (tabs+actions can render into the persistent top bar, editor stays code-only).
2. **Toolbar actions**: Diff viewer toggle (on/off) · Diff mode switch · "View all scripts
   together, or one at a time" · **Compile whole workspace** · **Apply edited XML back into
   the workspace** · Copy active code · Download active file.
3. **Diff views**: side-by-side AND unified modes, with per-line change coloring.
4. **Minimap** (the code-strips overview, right edge) incl. the G8b behavior: auto-hides when
   the panel is narrower than 560px. (Monaco has a native minimap — G8b width rule must be
   re-applied to it.)
5. **Status bar**: UTF-8 · XML/STRUCT vs JSON per file type · line count.
6. **"generated xml is editable" badge** + editable-generated-XML behavior itself.
7. **Auto-save** (prop-controlled or local toggle) with its checkpoint path.
8. **Snapshot diff** input (`snapshotDiffWorkspace` → diff against a snapshot, with clear).
9. Line numbers, XML syntax coloring, horizontal scroll for wide lines, aria labels
   (`Editing <file>`), collapse/expand (`codeCollapsed`).
10. Compile status/diagnostics display fed by `compileStatus`/`diagnostics` props.

Anything NOT on this list found during implementation gets ADDED here before it is touched.

## Phase 1 — core swap (Monaco)
- Add `monaco-editor` (local npm; fits the posture). Replace CodePreview's hand-rolled text
  area + custom diff renderer with Monaco Editor + Monaco DiffEditor (the literal VS Code
  editor component — kills lag/draw bugs class-wide, in BOTH shells incl. standalone).
- Keep: props contract, tab bar, action buttons, apply-back path (all writes still go
  through the existing apply→validate→CAS pipeline — the editor stays a VIEW; no second
  write path). XML syntax highlighting via Monaco's built-in xml language.
- Bundle note: +~3-4MB to the vite bundle (local app — acceptable; lazy-load the editor
  chunk via dynamic import so canvas-only users never pay it).
- Oracle/validation: existing compile/apply e2e paths must stay green; visual pass on the
  editor + diff; negative: apply of invalid XML still rejected by the pipeline.

## Phase 2 — real estate ("for the important shit")
- Default the code pane COLLAPSED (`codeCollapsed` prop already exists) with a slim toggle;
  canvas gets the width back.
- Extension shell bonus: "Open in IDE editor" — virtual FileSystemProvider
  (`x4forge://<mod>/…`) + `vscode.diff` for native side-by-side; saves round-trip through
  the same apply API. In IDE mode the in-app pane can stay collapsed by default.
- Both IDEs verified to bundle the native editor/diff (trivially — it's the editor itself).

## Order & risk
Phase 1 before B46 or after — independent surfaces (editor UI vs validation core); do NOT
run both in one session. Riskiest edge: Monaco inside the IDE webview-in-iframe (keyboard
focus, clipboard) — validate in both IDEs early in Phase 1. Rollback = revert; CodePreview
shell keeps the old renderer behind a flag for one release if wanted.
