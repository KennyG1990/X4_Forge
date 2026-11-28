/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  AlertTriangle,
  Compass,
  Filter,
  GitBranch,
  MessageSquare,
  Play,
  Repeat,
  Zap,
  X,
} from 'lucide-react';
import type { MDNode, Port } from '../../types';
import type { LiveNodeBadge } from '../../lib/liveCanvasTelemetry';
import { isContainerTag } from '../../lib/portSemantics';

interface CanvasNodeCardProps {
  node: MDNode;
  compactGridView: boolean;
  zoom: number;
  isSelected: boolean;
  isGlowActive: boolean;
  simActive: boolean;
  nodeDiag?: { severity: string; messages: string[] };
  liveBadge?: LiveNodeBadge;
  linking: { nodeId: string; portId: string; type: string } | null;
  onMouseDown: (nodeId: string, e: React.MouseEvent) => void;
  onPortClick: (nodeId: string, port: Port, e: React.MouseEvent) => void;
  onDeleteNode: (nodeId: string, e: React.MouseEvent) => void;
  onTriggerSimulator: (nodeId: string) => void;
  onEditComment: (node: MDNode, mode: 'prompt' | 'sticky') => void;
  onDeleteComment: (node: MDNode) => void;
}

function readCueMeta(node: MDNode): {
  isLibrary: boolean;
  libPurpose: string;
  patchSinceVersion: string;
  cueVersion: string;
} {
  if (node.type !== 'cue') {
    return { isLibrary: false, libPurpose: '', patchSinceVersion: '', cueVersion: '' };
  }
  const props = node.properties || {};
  const isLibrary = props.isLibrary === 'true' || props.isLibrary === true;
  const libPurpose = String(props.libPurpose || props.purpose || '').trim();
  const patchAttr = String(props.patchSinceVersion || '').trim();
  const tailMatch = String(props.cueTailXml || props.rawXml || '').match(/sinceversion\s*=\s*["'](\d+)["']/i);
  const patchSinceVersion = patchAttr || (tailMatch ? tailMatch[1] : '');
  const cueVersion = String(props.version || '').trim();
  return { isLibrary, libPurpose, patchSinceVersion, cueVersion };
}

const CanvasNodeCard: React.FC<CanvasNodeCardProps> = React.memo(({
  node,
  compactGridView,
  zoom,
  isSelected,
  isGlowActive,
  simActive,
  nodeDiag,
  liveBadge,
  linking,
  onMouseDown,
  onPortClick,
  onDeleteNode,
  onTriggerSimulator,
  onEditComment,
  onDeleteComment,
}) => {
  const isLowDetail = zoom < 0.45;
  const { isLibrary, libPurpose, patchSinceVersion, cueVersion } = readCueMeta(node);

  let surfaceClass = 'border-[#262c36] bg-[#11141a]';
  if (node.type === 'cue') surfaceClass = 'border-[#332a47] bg-[#12131b]';
  else if (node.type === 'event') surfaceClass = 'border-[#3b2f1e] bg-[#141317]';
  else if (node.type === 'condition') surfaceClass = 'border-[#25354d] bg-[#10141c]';
  else if (node.type === 'action') surfaceClass = 'border-[#1f3b31] bg-[#0f1615]';

  const topAccent = isContainerTag(node.xmlTag)
    ? 'bg-indigo-500'
    : node.type === 'cue'
      ? 'bg-purple-500'
      : node.type === 'event'
        ? 'bg-amber-500'
        : node.type === 'condition'
          ? 'bg-[#3b82f6]'
          : 'bg-emerald-500';

  const stickyAnnotation = node.comment ? (
    <div
      style={{
        position: 'absolute',
        left: node.x + (compactGridView ? 200 : 248),
        top: node.y,
        width: '190px',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      className="bg-amber-950/90 border border-amber-500/45 text-amber-100 p-2.5 rounded-lg shadow-lg font-sans text-[11px] leading-relaxed z-20 flex flex-col gap-1.5 cursor-default text-left select-text"
    >
      <div className="flex items-center justify-between border-b border-amber-500/25 pb-1 select-none font-semibold text-[11px] text-amber-300">
        <span>Sticky Note</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEditComment(node, 'sticky');
            }}
            className="text-[11px] text-amber-200 hover:text-white cursor-pointer"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteComment(node);
            }}
            className="text-[11px] text-rose-300 hover:text-rose-200 cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>
      <p className="whitespace-pre-wrap leading-relaxed text-[#eef2f7] select-text text-[11px]">{node.comment}</p>
    </div>
  ) : null;

  if (isLowDetail) {
    return (
      <>
        <div
          data-node-id={node.id}
          data-node-type={node.type}
          data-node-label={node.label}
          data-testid={`canvas-node-${node.id}`}
          onMouseDown={(e) => onMouseDown(node.id, e)}
          style={{ left: node.x, top: node.y }}
          className={`absolute ${compactGridView ? 'w-48 h-20' : 'w-60 h-24'} rounded-lg border flex flex-col justify-between font-mono text-[11px] p-2.5 select-none shadow-md transition-colors ${surfaceClass} ${
            isSelected ? 'ring-2 ring-[#3b82f6]/80 border-[#3b82f6] z-10' : 'hover:border-[#3b4759]'
          } ${isGlowActive ? 'border-[#60a5fa] z-30' : ''}`}
        >
          <div className="flex-1 flex items-center justify-center text-center">
            <span className={`font-semibold text-xs truncate ${compactGridView ? 'w-36' : 'w-48'} text-[#eef2f7]`}>
              {node.label}
            </span>
          </div>
          <div className="text-[11px] text-[#687385] text-center truncate border-t border-white/[0.06] pt-1">
            {node.type}: &lt;{node.xmlTag}&gt;
          </div>
        </div>
        {stickyAnnotation}
      </>
    );
  }

  return (
    <>
      <div
        data-node-id={node.id}
        data-node-type={node.type}
        data-node-label={node.label}
        data-compact-node={compactGridView ? 'true' : 'false'}
        data-testid={`canvas-node-${node.id}`}
        onMouseDown={(e) => onMouseDown(node.id, e)}
        style={{ left: node.x, top: node.y }}
        className={`absolute ${compactGridView ? 'w-48' : 'w-60'} rounded-lg border flex flex-col font-mono text-[11px] shadow-md transition-colors ${surfaceClass} ${
          isSelected ? 'ring-2 ring-[#3b82f6]/80 border-[#3b82f6]' : 'hover:border-[#3b4759]'
        } ${isGlowActive ? 'border-[#60a5fa] z-30 ring-2 ring-[#60a5fa]/40' : ''} ${
          nodeDiag
            ? nodeDiag.severity === 'error'
              ? 'ring-2 ring-rose-500/85 !border-rose-500/80 z-20'
              : 'ring-2 ring-amber-400/80 !border-amber-400/75 z-20'
            : ''
        }`}
      >
        {liveBadge && (
          <div
            title={liveBadge.state === 'erroring'
              ? `${liveBadge.cueName}: ${liveBadge.errors} error(s) in the game log (line ~${liveBadge.lastLineNo}), ${liveBadge.hits} hit(s)`
              : `${liveBadge.cueName}: fired ${liveBadge.hits}× in the game log (line ~${liveBadge.lastLineNo})`}
            onMouseDown={(e) => e.stopPropagation()}
            className={`absolute -top-2.5 -left-2.5 z-40 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-semibold font-mono shadow cursor-help select-none ${
              liveBadge.state === 'erroring' ? 'bg-rose-600 text-white' : 'bg-emerald-500 text-slate-950'
            }`}
          >
            {liveBadge.state === 'erroring' ? `✗ ${liveBadge.errors}` : `▶ ${liveBadge.hits}`}
          </div>
        )}

        {nodeDiag && (
          <div
            title={nodeDiag.messages.join('\n')}
            onMouseDown={(e) => e.stopPropagation()}
            className={`absolute -top-2.5 -right-2.5 z-40 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] font-semibold font-mono shadow cursor-help select-none ${
              nodeDiag.severity === 'error' ? 'bg-rose-600 text-white' : 'bg-amber-400 text-slate-950'
            }`}
          >
            <AlertTriangle className="w-3 h-3" />
            {nodeDiag.messages.length > 1 ? nodeDiag.messages.length : ''}
          </div>
        )}

        <div className={`h-[2px] rounded-t-lg w-full ${topAccent}`} />

        {/* Node Header */}
        <div className={`${compactGridView ? 'px-2 py-1.5' : 'px-2.5 py-2'} flex items-center justify-between border-b border-white/[0.06] cursor-grab active:cursor-grabbing bg-[#171b23]/55`}>
          <div className="flex items-center gap-1.5 min-w-0">
            {simActive && isGlowActive && (
              <span className="w-2 h-2 rounded-full bg-[#60a5fa] inline-block shrink-0" />
            )}
            {node.type === 'cue' && <Compass className="w-3.5 h-3.5 text-purple-400 shrink-0" />}
            {node.type === 'event' && <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
            {node.type === 'condition' && <Filter className="w-3.5 h-3.5 text-[#60a5fa] shrink-0" />}
            {node.type === 'action' && (
              isContainerTag(node.xmlTag)
                ? ((node.xmlTag === 'do_while' || node.xmlTag === 'do_for_each')
                    ? <Repeat className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
                    : <GitBranch className="w-3.5 h-3.5 text-indigo-300 shrink-0" />)
                : <Play className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
            <span className="font-sans font-semibold text-[11px] truncate text-[#eef2f7]">{node.label}</span>
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onEditComment(node, 'prompt');
              }}
              title="Attach sticky-note annotation"
              className={`p-1 rounded transition-colors cursor-pointer ${
                node.comment
                  ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                  : 'hover:bg-white/5 text-[#687385] hover:text-amber-300'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </button>
            {node.type === 'event' && (
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onTriggerSimulator(node.id);
                }}
                title="Simulate Event from this step specifically"
                className="p-1 rounded hover:bg-emerald-500/15 text-emerald-400 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => onDeleteNode(node.id, e)}
              title="Delete Node"
              className="p-1 rounded hover:bg-rose-500/15 text-[#687385] hover:text-rose-300 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* X4 9.00 MD Domain Pills (<library purpose>, <patch sinceversion>, version) */}
        {(isLibrary || patchSinceVersion || cueVersion) && (
          <div className="px-2 pt-1.5 flex flex-wrap gap-1 select-none">
            {isLibrary && (
              <span
                data-testid="cue-library-purpose-badge"
                className="rounded border border-purple-500/35 bg-purple-500/10 px-1.5 py-0.5 text-[11px] font-mono text-purple-200"
              >
                {libPurpose ? `library · ${libPurpose}` : 'library'}
              </span>
            )}
            {patchSinceVersion && (
              <span
                data-testid="cue-patch-version-badge"
                className="rounded border border-amber-500/35 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-mono text-amber-200"
              >
                patch v{patchSinceVersion}
              </span>
            )}
            {cueVersion && (
              <span className="rounded border border-[#262c36] bg-[#0a0c10] px-1.5 py-0.5 text-[11px] font-mono text-[#a0aab8]">
                v{cueVersion}
              </span>
            )}
          </div>
        )}

        {/* Properties Preview */}
        {!compactGridView && (
          <div
            data-testid="canvas-props-preview"
            className="p-2 bg-[#0a0c10] text-[#a0aab8] space-y-1 select-none border border-white/[0.05] font-mono text-[11px] rounded m-1.5"
          >
            {Object.entries(node.properties || {})
              .filter(([key, val]) => !key.startsWith('__') && val !== '' && val !== undefined)
              .slice(0, 3)
              .map(([key, val]) => (
                <div key={key} className="flex justify-between gap-2 leading-snug">
                  <span className="text-[#687385] truncate">{key}</span>
                  <span className="text-[#eef2f7] truncate max-w-[130px] text-right" title={String(val)}>
                    {String(val)}
                  </span>
                </div>
              ))}
            {Object.values(node.properties || {}).filter(v => v !== '' && v !== undefined).length === 0 && (
              <div className="text-[#687385] text-[11px] text-center">No properties configured</div>
            )}
          </div>
        )}

        {/* Ports */}
        <div className={`${compactGridView ? 'px-2 py-1.5 space-y-1' : 'p-2 space-y-1.5'} bg-[#0a0c10]/45 rounded-b-lg font-sans`}>
          {(node.inputs || []).map((port) => (
            <div key={port.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => onPortClick(node.id, port, e)}
                data-testid={`canvas-port-${node.id}-${port.id}`}
                className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors cursor-pointer ${
                  linking?.nodeId === node.id && linking?.portId === port.id
                    ? 'bg-[#3b82f6] border-white ring-2 ring-[#3b82f6]'
                    : 'bg-emerald-500/20 hover:bg-emerald-500/55 border-emerald-400/50'
                }`}
                title={`Connector terminal: ${port.name}`}
              />
              <span className="text-[11px] text-[#a0aab8]">{port.name}</span>
            </div>
          ))}

          {(node.outputs || []).map((port) => (
            <div key={port.id} className="flex items-center justify-end gap-2 text-right w-full">
              <span className="text-[11px] text-[#a0aab8]">{port.name}</span>
              <button
                type="button"
                onClick={(e) => onPortClick(node.id, port, e)}
                data-testid={`canvas-port-${node.id}-${port.id}`}
                className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-colors cursor-pointer ${
                  linking?.nodeId === node.id && linking?.portId === port.id
                    ? 'bg-[#3b82f6] border-white ring-2 ring-[#3b82f6]'
                    : 'bg-[#3b82f6]/20 hover:bg-[#3b82f6]/55 border-[#3b82f6]/55'
                }`}
                title={`Connector terminal: ${port.name}`}
              />
            </div>
          ))}
        </div>
      </div>
      {stickyAnnotation}
    </>
  );
});

CanvasNodeCard.displayName = 'CanvasNodeCard';

export default CanvasNodeCard;
