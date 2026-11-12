import React from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Maximize2, Minus, Plus, RefreshCw, Search } from 'lucide-react';
import type { ModWorkspace, PassthroughFile } from '../types';
import type { XmlReferenceEdge, XmlReferenceFile, XmlReferenceFocus, XmlReferenceMapResult, XmlReferenceMapRequest } from '../lib/xmlReferenceGraph';
import { fetchJson } from '../lib/apiHelper';
import { openInNativeEditor } from '../lib/nativeEditor';
import { fnvHash, stableStringify } from '../lib/workspaceIdentity';

// Keep the current draft's compiler inputs, without sending textures, archives or
// base64 payloads. Omitted XML remains visible to the server's coverage accounting.
function xmlWorkspace(workspace: ModWorkspace): ModWorkspace {
  const xmlRows = <T extends PassthroughFile,>(rows: T[] | undefined): T[] | undefined => rows
    ?.filter(file => /\.xml$/i.test(file.path))
    .map(file => file.reason === 'binary' || file.contentEncoding === 'base64'
      ? { ...file, content: undefined, contentEncoding: undefined, omitted: true }
      : file);
  return { ...workspace, templates: undefined,
    originalFiles: workspace.originalFiles?.filter(file => /\.xml$/i.test(file.path)),
    passthroughFiles: xmlRows(workspace.passthroughFiles), uiSourceFiles: xmlRows(workspace.uiSourceFiles) };
}

const fileLabel = (file: Pick<XmlReferenceFile, 'origin' | 'path'>) =>
  `${file.origin === 'project' ? 'Mod' : 'Game / DLC'}: ${file.path}`;
const statuses = new Set(['resolved', 'missing', 'ambiguous', 'dynamic', 'unsupported', 'incomplete']);
const fileShape = (value: unknown): value is XmlReferenceFile => {
  if (!value || typeof value !== 'object') return false;
  const file = value as XmlReferenceFile;
  return typeof file.id === 'string' && !!file.id && typeof file.path === 'string' && !!file.path && typeof file.sha256 === 'string'
    && (file.origin === 'project' || file.origin === 'reference')
    && (file.locationKind === 'authored' || file.locationKind === 'effective')
    && typeof file.available === 'boolean' && typeof file.complete === 'boolean'
    && (!file.available || /^[a-f0-9]{64}$/i.test(file.sha256));
};
function coverageShape(value: unknown): value is XmlReferenceMapResult['coverage'] {
  if (!value || typeof value !== 'object') return false;
  const coverage = value as XmlReferenceMapResult['coverage'];
  const counts = [coverage.scannedFiles, coverage.scannedProjectFiles, coverage.scannedReferenceFiles,
    coverage.knownProjectFiles, coverage.unsupported, coverage.incomplete];
  const limits = coverage.limits;
  return typeof coverage.scope === 'string' && typeof coverage.incomingScope === 'string'
    && typeof coverage.truncated === 'boolean' && counts.every(count => Number.isSafeInteger(count) && count >= 0)
    && Array.isArray(coverage.reasons) && coverage.reasons.every(reason => typeof reason === 'string')
    && !!limits && typeof limits === 'object' && Number.isSafeInteger(limits.maxDepth) && limits.maxDepth >= 0
    && [limits.maxNodes, limits.maxEdges, limits.maxDocuments, limits.maxDocumentBytes,
      limits.maxTotalBytes, limits.maxPreviewChars, limits.maxResponseBytes].every(limit => Number.isSafeInteger(limit) && limit > 0);
}
function mapShape(value: unknown): value is XmlReferenceMapResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as XmlReferenceMapResult;
  return result.schemaVersion === 'forge.xml-reference-map.v1' && typeof result.ok === 'boolean'
    && typeof result.signature === 'string' && !!result.signature
    && Array.isArray(result.files) && result.files.every(fileShape)
    && Array.isArray(result.nodes) && result.nodes.every(fileShape)
    && Array.isArray(result.edges) && result.edges.every(edge => edge && typeof edge.id === 'string'
      && typeof edge.sourceId === 'string' && Array.isArray(edge.targetIds)
      && edge.targetIds.every(id => typeof id === 'string') && statuses.has(edge.status)
      && typeof edge.symbol === 'string' && typeof edge.kind === 'string'
      && edge.location && typeof edge.location.path === 'string')
    && coverageShape(result.coverage)
    && (!result.preview || (typeof result.preview.content === 'string'
      && typeof result.preview.fileId === 'string' && typeof result.preview.sha256 === 'string' && /^[a-f0-9]{64}$/i.test(result.preview.sha256)
      && result.preview.locationKind === 'authored' && Number.isInteger(result.preview.startLine) && result.preview.startLine >= 1
      && [...result.files, ...result.nodes].some(file => file.id === result.preview!.fileId
        && file.available && file.origin === result.preview!.origin && file.path === result.preview!.path && file.sha256 === result.preview!.sha256)));
}

interface PlacedFile { file: XmlReferenceFile; x: number; y: number }
const NODE_W = 292;
const NODE_H = 74;
function placeFiles(files: XmlReferenceFile[], edges: XmlReferenceEdge[], focusId: string): PlacedFile[] {
  const outgoing = new Set(edges.filter(edge => edge.sourceId === focusId).flatMap(edge => edge.targetIds));
  const incoming = new Set(edges.filter(edge => edge.targetIds.includes(focusId)).map(edge => edge.sourceId));
  const groups = [files.filter(file => file.id !== focusId && incoming.has(file.id) && !outgoing.has(file.id)),
    files.filter(file => file.id === focusId), files.filter(file => file.id !== focusId && outgoing.has(file.id)),
    files.filter(file => file.id !== focusId && !incoming.has(file.id) && !outgoing.has(file.id))];
  const rows = Math.max(1, ...groups.map(group => group.length));
  return groups.flatMap((group, column) => group.map((file, row) => ({ file, x: column * 350 + 28,
    y: 32 + (row + (rows - group.length) / 2) * 106 })));
}

interface FileGraphProps {
  result: XmlReferenceMapResult;
  focusId: string;
  onInspect: (file: XmlReferenceFile) => void;
}
function FileGraph({ result, focusId, onInspect }: FileGraphProps) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const [size, setSize] = React.useState({ width: 900, height: 350 });
  const [camera, setCamera] = React.useState({ x: 0, y: 0, zoom: 1 });
  const [keyboardFile, setKeyboardFile] = React.useState('');
  const drag = React.useRef<{ pointer: number; x: number; y: number; panX: number; panY: number } | null>(null);
  const placed = React.useMemo(() => placeFiles(result.nodes, result.edges, focusId), [result, focusId]);
  const byId = React.useMemo(() => new Map(placed.map(node => [node.file.id, node])), [placed]);
  const fit = React.useCallback(() => {
    if (!placed.length) return;
    const minX = Math.min(...placed.map(node => node.x));
    const hasSelfReference = result.edges.some(edge => edge.targetIds.includes(edge.sourceId));
    const minY = Math.min(...placed.map(node => node.y)) - (hasSelfReference ? 90 : 0);
    const width = Math.max(...placed.map(node => node.x + NODE_W)) - minX + (hasSelfReference ? 80 : 0);
    const height = Math.max(...placed.map(node => node.y + NODE_H)) - minY;
    const zoom = Math.max(0.08, Math.min(1.15, (size.width - 44) / width, (size.height - 44) / height));
    setCamera({ x: (size.width - width * zoom) / 2 - minX * zoom,
      y: (size.height - height * zoom) / 2 - minY * zoom, zoom });
  }, [placed, size, result.edges]);
  React.useEffect(fit, [fit]);
  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect?.width && rect.height) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  const zoomAt = React.useCallback((factor: number, x: number, y: number) => setCamera(previous => {
    const zoom = Math.max(0.08, Math.min(2.5, previous.zoom * factor));
    return { zoom, x: x - (x - previous.x) * zoom / previous.zoom,
      y: y - (y - previous.y) * zoom / previous.zoom };
  }), []);
  React.useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      zoomAt(event.deltaY < 0 ? 1.12 : 1 / 1.12, event.clientX - rect.left, event.clientY - rect.top);
    };
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => svg.removeEventListener('wheel', wheel);
  }, [zoomAt]);
  const markerId = `xml-reference-arrow-${React.useId().replace(/:/g, '')}`;
  return <section className="min-w-0 rounded border border-white/10 bg-black/30" aria-label="XML file reference graph">
    <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 text-[11px]">
      <span className="mr-auto text-slate-300">Arrows: source uses target · dashed: candidate</span>
      <button type="button" aria-label="Zoom out reference graph" onClick={() => zoomAt(1 / 1.2, size.width / 2, size.height / 2)} className="rounded p-1.5 hover:bg-white/10"><Minus className="h-4 w-4" /></button>
      <span className="min-w-10 text-center font-mono">{Math.round(camera.zoom * 100)}%</span>
      <button type="button" aria-label="Zoom in reference graph" onClick={() => zoomAt(1.2, size.width / 2, size.height / 2)} className="rounded p-1.5 hover:bg-white/10"><Plus className="h-4 w-4" /></button>
      <button type="button" onClick={fit} className="inline-flex items-center gap-1 rounded px-2 py-1.5 hover:bg-white/10"><Maximize2 className="h-3.5 w-3.5" /> Fit</button>
    </div>
    <svg ref={svgRef} data-testid="xml-reference-graph" className="h-[350px] w-full cursor-grab touch-none focus:outline-cyan-400"
      viewBox={`0 0 ${size.width} ${size.height}`} tabIndex={0} role="group" aria-label="File graph. Drag to pan; use arrows to pan, plus or minus to zoom, Home to fit. Select a file to inspect."
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Home') { event.preventDefault(); fit(); }
        else if (['+', '=', '-'].includes(event.key)) { event.preventDefault(); zoomAt(event.key === '-' ? 1 / 1.2 : 1.2, size.width / 2, size.height / 2); }
        else if (event.key.startsWith('Arrow')) { event.preventDefault(); setCamera(previous => ({ ...previous,
          x: previous.x + (event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0),
          y: previous.y + (event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0) })); }
      }}
      onPointerDown={event => {
        if (event.button !== 0 || (event.target as Element).closest('[data-xml-file-node]')) return;
        drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, panX: camera.x, panY: camera.y };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => { const start = drag.current; if (start?.pointer === event.pointerId) setCamera(previous => ({ ...previous,
        x: start.panX + event.clientX - start.x, y: start.panY + event.clientY - start.y })); }}
      onPointerUp={event => { if (drag.current?.pointer === event.pointerId) { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); } }}
      onPointerCancel={() => { drag.current = null; }}>
      <defs><marker id={markerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" /></marker></defs>
      <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.zoom})`}>
        {result.edges.flatMap(edge => edge.targetIds.map(targetId => {
          const from = byId.get(edge.sourceId); const to = byId.get(targetId);
          if (!from || !to) return null;
          const right = to.x >= from.x;
          const x1 = from.x + (right ? NODE_W : 0); const x2 = to.x + (right ? 0 : NODE_W);
          const y1 = from.y + NODE_H / 2; const y2 = to.y + NODE_H / 2;
          const middle = (x1 + x2) / 2;
          const d = from === to ? `M ${x1} ${y1} C ${x1 + 75} ${y1 - 110} ${x1 - 90} ${y1 - 110} ${from.x + NODE_W / 2} ${from.y}`
            : `M ${x1} ${y1} C ${middle} ${y1} ${middle} ${y2} ${x2} ${y2}`;
          return <path key={`${edge.id}:${targetId}`} d={d} fill="none" stroke="#94a3b8" strokeWidth="1.7"
            strokeDasharray={edge.status === 'resolved' ? undefined : '6 5'} markerEnd={`url(#${markerId})`}>
            <title>{`${edge.kind}: ${edge.symbol} (${edge.status})`}</title>
          </path>;
        }))}
        {placed.map(({ file, x, y }) => <g key={file.id} data-xml-file-node={file.id} role="button" tabIndex={0}
          aria-label={`Inspect ${fileLabel(file)}`} aria-pressed={file.id === focusId} className="cursor-pointer outline-none"
          onFocus={() => setKeyboardFile(file.id)} onBlur={() => setKeyboardFile('')}
          onClick={() => onInspect(file)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onInspect(file); } }}>
          <title>{`${fileLabel(file)}${file.reason ? ` — ${file.reason}` : ''}`}</title>
          <rect x={x} y={y} width={NODE_W} height={NODE_H} rx="8" fill={file.id === focusId ? '#123242' : '#141c29'}
            stroke={file.id === keyboardFile ? '#ffffff' : file.id === focusId ? '#67e8f9' : '#64748b'} strokeWidth={file.id === keyboardFile ? 3 : file.id === focusId ? 2.5 : 1.2} />
          <text x={x + 12} y={y + 19} fill="#94a3b8" fontSize="10">{file.origin === 'project' ? 'MOD XML' : 'GAME / DLC · READ ONLY'}{file.id === focusId ? ' · SELECTED' : ''}{!file.available ? ' · UNAVAILABLE' : !file.complete ? ' · INCOMPLETE' : ''}</text>
          <text x={x + 12} y={y + 40} fill="#e2e8f0" fontSize="12" fontFamily="monospace">{file.path.split('/').pop()?.slice(0, 36)}</text>
          <text x={x + 12} y={y + 59} fill="#94a3b8" fontSize="9" fontFamily="monospace">{file.path.length > 44 ? `…${file.path.slice(-43)}` : file.path}</text>
        </g>)}
      </g>
    </svg>
    <p className="border-t border-white/5 px-3 py-1.5 text-[10px] text-slate-500">Drag or scroll to explore. All files and source remain unchanged. Directional lists below expose unresolved references.</p>
  </section>;
}

interface Selection { authority: string; focus?: XmlReferenceFocus; notice?: string }
interface MapState { key: string; result?: XmlReferenceMapResult; error?: string }
export default function XmlReferenceView({ workspace, schemaConfigVersion = 0 }: { workspace: ModWorkspace; schemaConfigVersion?: number }) {
  const projectedWorkspace = React.useMemo(() => xmlWorkspace(workspace), [workspace]);
  const inputFingerprint = React.useMemo(() => fnvHash(stableStringify(projectedWorkspace)), [projectedWorkspace]);
  const context = window.__X4_WORKSPACE_CONTEXT__;
  const workspaceId = context?.getWorkspaceId() || '';
  const revision = context?.getSelectionRevision() || 0;
  // A configured schema/corpus change invalidates both the selected file and its
  // displayed snapshot before paint; the request key also aborts the old load.
  const authority = `${workspaceId}|${revision}|${schemaConfigVersion}|${inputFingerprint}`;
  const [selection, setSelection] = React.useState<Selection>({ authority });
  const [state, setState] = React.useState<MapState>({ key: '' });
  const [search, setSearch] = React.useState('');
  const [depth, setDepth] = React.useState(1);
  const [refresh, setRefresh] = React.useState(0);
  const [nativeMessage, setNativeMessage] = React.useState<{ key: string; message: string } | null>(null);
  const sourceRef = React.useRef<HTMLDivElement>(null);
  const activeSelection = selection.authority === authority ? selection : { authority };
  const requestKey = `${authority}|${stableStringify(activeSelection.focus)}|${depth}|${refresh}`;
  const currentKey = React.useRef(requestKey);
  currentKey.current = requestKey;
  const data = state.key === requestKey ? state.result : undefined;
  const error = state.key === requestKey ? state.error : undefined;
  const busy = !data && !error;
  React.useEffect(() => {
    const controller = new AbortController();
    const stillCurrent = () => !controller.signal.aborted && currentKey.current === requestKey
      && (window.__X4_WORKSPACE_CONTEXT__?.getWorkspaceId() || '') === workspaceId
      && (window.__X4_WORKSPACE_CONTEXT__?.getSelectionRevision() || 0) === revision;
    const timer = window.setTimeout(() => {
      const body: XmlReferenceMapRequest = { workspace: projectedWorkspace, focus: activeSelection.focus,
        maxDepth: depth, maxNodes: 60, maxEdges: 180, includeSource: true };
      fetchJson<unknown>('/api/agent/project/xml-references', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal }, 'Could not analyze XML references.')
        .then(result => {
          if (!stillCurrent()) return;
          if (!mapShape(result)) throw new Error('The server returned an unsupported or malformed XML reference map.');
          if (result.context?.workspaceId && result.context.workspaceId !== workspaceId) throw new Error('The XML reference map belongs to another workspace. Refresh this project.');
          setState({ key: requestKey, result });
        }).catch(cause => { if (stillCurrent()) setState({ key: requestKey,
          error: cause instanceof Error ? cause.message : 'Could not analyze XML references.' }); });
    }, 120);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [projectedWorkspace, workspaceId, revision, requestKey, activeSelection.focus, depth]);

  const files = React.useMemo(() => {
    const known = new Map<string, XmlReferenceFile>();
    for (const file of [...(data?.files || []), ...(data?.nodes || [])]) known.set(file.id, file);
    return [...known.values()].sort((a, b) => a.origin.localeCompare(b.origin) || a.path.localeCompare(b.path));
  }, [data]);
  const fileById = React.useMemo(() => new Map(files.map(file => [file.id, file])), [files]);
  const selected = data?.preview ? fileById.get(data.preview.fileId)
    : files.find(file => file.origin === activeSelection.focus?.origin && file.path === activeSelection.focus.path) || data?.nodes[0];
  const query = search.trim().toLowerCase();
  const matchingFiles = files.filter(file => fileLabel(file).toLowerCase().includes(query));
  const options = selected && !matchingFiles.some(file => file.id === selected.id) ? [selected, ...matchingFiles] : matchingFiles;
  const outgoing = data?.edges.filter(edge => edge.sourceId === selected?.id) || [];
  const incoming = data?.edges.filter(edge => edge.targetIds.includes(selected?.id || '')) || [];
  const inspect = (file: XmlReferenceFile, focus?: XmlReferenceFocus, notice?: string) => {
    setNativeMessage(null);
    setSelection({ authority, focus: focus || { origin: file.origin, path: file.path }, notice });
  };
  const inspectSource = (edge: XmlReferenceEdge) => {
    const authored = edge.location.kind === 'authored';
    setNativeMessage(null);
    setSelection({ authority, focus: { origin: edge.location.origin, path: edge.location.path,
      ...(authored && edge.location.line ? { line: edge.location.line, column: edge.location.column } : {}) },
    notice: authored ? undefined : 'This reference comes from effective XML. Its exact position in the raw source is not verified.' });
  };
  const preview = data?.preview;
  React.useEffect(() => {
    const container = sourceRef.current;
    if (!container) return;
    const line = container.querySelector<HTMLElement>('[data-source-highlight="true"]');
    container.scrollTop = line ? line.offsetTop - container.offsetTop - container.clientHeight / 2 : 0;
  }, [preview]);
  const renderRelations = (edges: XmlReferenceEdge[], direction: 'Uses' | 'Used by') => <section className="min-w-0 rounded border border-white/10 bg-black/20 p-3" aria-label={direction}>
    <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-200">{direction === 'Uses' ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}{direction} <span className="text-slate-500">({edges.length})</span></h3>
    {edges.length === 0 ? <p className="text-[11px] text-slate-400">No {direction === 'Uses' ? 'outgoing' : 'incoming'} references found within the reported scan scope.</p>
      : <ul className="max-h-80 space-y-2 overflow-auto">{edges.map(edge => <li key={edge.id} data-testid={`xml-reference-edge-${edge.id}`} className="rounded border border-white/10 bg-white/[0.02] p-2 text-[11px]">
        <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-cyan-200">{edge.kind}: {edge.symbol || '(empty)'}</span>
          <span data-reference-status={edge.status} className={`rounded border px-1.5 py-0.5 text-[10px] ${edge.status === 'resolved' ? 'border-emerald-500/25 text-emerald-300' : 'border-amber-500/30 text-amber-200'}`}>{edge.status}</span></div>
        {edge.reason && <p className="mt-1 break-words text-slate-400">{edge.reason}</p>}
        <button type="button" onClick={() => inspectSource(edge)} className="mt-1 text-left text-slate-300 underline decoration-slate-600 hover:text-white">
          Inspect reference source: {edge.location.path}{edge.location.kind === 'authored'
            ? edge.location.line ? `:${edge.location.line}${edge.location.column ? `:${edge.location.column}` : ''}` : ' (raw position unavailable)'
            : ' (effective; raw position unavailable)'}
        </button>
        <div className="mt-1 flex flex-col items-start gap-1">{(direction === 'Used by' ? [edge.sourceId] : edge.targetIds).map(id => {
          const target = fileById.get(id);
          return target ? <button key={id} type="button" onClick={() => inspect(target)} className="max-w-full break-all text-left text-cyan-300 underline decoration-cyan-800 hover:text-cyan-100">
            {edge.status === 'ambiguous' && direction === 'Uses' ? 'Inspect candidate: ' : 'Inspect file: '}{fileLabel(target)}
          </button> : <span key={id} className="text-amber-200">Target is outside the displayed file scope.</span>;
        })}</div>
      </li>)}</ul>}
  </section>;

  return <div data-testid="xml-reference-view" className="space-y-3 text-slate-200">
    <div className="flex flex-wrap items-center gap-2">
      <p className="mr-auto text-xs text-slate-400">Follow XML files across this mod and the configured game / DLC corpus.</p>
      <label className="flex items-center gap-2 text-[11px] text-slate-400">Link depth <select aria-label="Reference graph depth" value={depth} onChange={event => setDepth(Number(event.target.value))} className="rounded border border-white/15 bg-[#101722] px-2 py-1 text-slate-200"><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option></select></label>
      <button type="button" onClick={() => { setNativeMessage(null); setRefresh(value => value + 1); }} className="flex items-center gap-1 rounded border border-white/15 px-2 py-1 text-[11px] hover:bg-white/5"><RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> Refresh</button>
    </div>
    {busy && <p role="status" data-testid="xml-reference-loading" className="rounded border border-cyan-500/20 bg-cyan-500/5 p-4 text-xs text-cyan-200">Analyzing XML references{activeSelection.focus ? ` for ${activeSelection.focus.path}` : ' in the current mod'}…</p>}
    {error && <div role="alert" data-testid="xml-reference-error" className="rounded border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{error} <button type="button" onClick={() => setRefresh(value => value + 1)} className="ml-2 underline">Retry</button></div>}
    {data && <>
      <div className="grid gap-2 md:grid-cols-[minmax(160px,1fr)_minmax(260px,2fr)]">
        <label className="relative block"><span className="sr-only">Search XML files</span><Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-slate-500" /><input aria-label="Search XML files" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search XML files…" className="w-full rounded border border-white/15 bg-[#101722] py-2 pl-7 pr-2 text-xs" /></label>
        <label className="block"><span className="sr-only">XML file</span><select aria-label="XML file" data-testid="xml-reference-file-picker" value={selected?.id || ''} onChange={event => { const file = fileById.get(event.target.value); if (file) inspect(file); }} className="w-full rounded border border-white/15 bg-[#101722] px-2 py-2 text-xs font-mono">
          {!options.length && <option value="">No matching XML files</option>}{options.map(file => <option key={file.id} value={file.id}>{fileLabel(file)}{file.available ? '' : ' [unavailable]'}</option>)}
        </select></label>
      </div>
      <div data-testid="xml-reference-coverage" className="rounded border border-white/10 bg-white/[0.02] p-3 text-[11px] text-slate-400">
        <p className="text-slate-200">{data.ok ? 'Analysis returned' : 'Analysis incomplete'} · {data.coverage.scannedProjectFiles} mod XML + {data.coverage.scannedReferenceFiles} game / DLC XML scanned · {data.nodes.length} displayed files · {data.edges.length} references</p>
        <p className="mt-1">{data.coverage.scope} Incoming links: {data.coverage.incomingScope}</p>
        <p className="mt-1">{matchingFiles.length} matching known files. {data.coverage.unsupported} unsupported · {data.coverage.incomplete} incomplete.{data.coverage.truncated ? ' Results reached a limit; follow a file or reduce depth to inspect a smaller neighborhood.' : ''}</p>
        {data.coverage.reasons.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-amber-200">Coverage limits and unresolved scope ({data.coverage.reasons.length})</summary><ul className="mt-1 list-disc space-y-1 pl-4">{data.coverage.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></details>}
        <details className="mt-2"><summary className="cursor-pointer">Analysis identity and bounds</summary><p className="mt-1 break-all font-mono">Map {data.signature}</p><p className="break-all">Corpus {data.context?.corpusSignature || data.context?.corpusGeneration || 'unavailable'}</p><p>Depth {data.coverage.limits.maxDepth} · nodes {data.coverage.limits.maxNodes} · edges {data.coverage.limits.maxEdges} · documents {data.coverage.limits.maxDocuments}</p></details>
      </div>
      {data.nodes.length > 0 ? <FileGraph result={data} focusId={selected?.id || ''} onInspect={inspect} />
        : <p className="rounded border border-white/10 p-4 text-xs text-slate-400">No XML files are available in this analysis. The reported coverage describes what was checked.</p>}
      <div className="grid gap-3 lg:grid-cols-2">{renderRelations(outgoing, 'Uses')}{renderRelations(incoming, 'Used by')}</div>
      <section data-testid="xml-reference-source" className="min-w-0 overflow-hidden rounded border border-white/10 bg-black/30" aria-label="Read-only XML source">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 text-[11px]">
          <h3 className="font-semibold">Read-only source</h3><span className="min-w-0 flex-1 break-all font-mono text-slate-400">{preview ? fileLabel(preview) : selected?.path || 'No file selected'}</span>
          <button type="button" disabled={!preview || preview.origin !== 'project' || !data.context?.nativeSourceFolder}
            title={!data.context?.nativeSourceFolder ? 'Native opening requires a server-verified saved source folder. Inspect the analyzed XML here.' : 'Request this source file in the installed editor; the host confirms opening separately.'}
            onClick={() => {
              if (!preview || !data.context?.nativeSourceFolder) return;
              const dispatched = openInNativeEditor(preview.path, preview.line ? { line: preview.line - 1, column: Math.max(0, (preview.column || 1) - 1) } : undefined, data.context.nativeSourceFolder);
              setNativeMessage({ key: requestKey, message: dispatched ? 'Native editor request sent. Opening has not been confirmed by the host.' : 'Native tabs require the installed extension. The analyzed source is available below.' });
            }} className="inline-flex items-center gap-1 rounded border border-white/15 px-2 py-1 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"><ExternalLink className="h-3.5 w-3.5" /> Request native editor</button>
        </div>
        {preview && (preview.origin === 'reference' || !data.context?.nativeSourceFolder) && <p className="px-3 py-2 text-[11px] text-slate-400">
          {preview.origin === 'reference' ? 'Game and DLC source is inspected here as read-only XML.' : 'Native opening is unavailable for this draft. Inspect the analyzed XML below.'}
        </p>}
        {activeSelection.notice && <p className="border-b border-amber-500/20 px-3 py-2 text-[11px] text-amber-200">{activeSelection.notice}</p>}
        {nativeMessage?.key === requestKey && <p role="status" className="px-3 py-2 text-[11px] text-slate-300">{nativeMessage.message}</p>}
        {preview ? <>
          <p className="border-b border-white/5 px-3 py-1.5 text-[10px] text-slate-500">Authored XML · SHA-256 <span className="font-mono">{preview.sha256}</span>{preview.line ? ` · line ${preview.line}${preview.column ? `, column ${preview.column}` : ''}` : ''}{preview.truncated ? ' · bounded excerpt' : ''}</p>
          <div ref={sourceRef} role="region" tabIndex={0} className="relative max-h-[430px] overflow-auto py-2 font-mono text-[11px] leading-5" aria-label={`Authored XML for ${preview.path}`}>
            <pre className="min-w-max">{preview.content.split(/\r\n?|\n/).map((line, index) => {
              const number = preview.startLine + index; const highlighted = number === preview.line;
              const column = highlighted && preview.column ? preview.column - 1 : -1;
              return <span key={number} data-source-line={number} data-source-highlight={highlighted ? 'true' : undefined} className={`flex pr-4 ${highlighted ? 'bg-cyan-500/15 text-cyan-100' : 'text-slate-300'}`}>
                <span className="mr-4 w-14 shrink-0 select-none border-r border-white/5 pr-3 text-right text-slate-600" aria-hidden="true">{number}</span>
                <code>{column >= 0 && column < line.length ? <>{line.slice(0, column)}<mark className="bg-cyan-200 text-slate-950">{line[column]}</mark>{line.slice(column + 1)}</> : line || ' '}</code>
              </span>;
            })}</pre>
          </div>
        </> : <p className="p-4 text-xs text-slate-400">{selected?.reason || 'Raw XML source is unavailable for this selection.'}</p>}
      </section>
    </>}
  </div>;
}
