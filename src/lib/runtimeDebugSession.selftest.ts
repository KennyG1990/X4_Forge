/** Focused hermetic oracle for the durable runtime debug cursor/session store. */

import fs from "fs";
import os from "os";
import path from "path";
import { createHash } from "crypto";
import {
  RUNTIME_DEBUG_MAX_PENDING_NORMALIZATION_LINES,
  RuntimeDebugSessionStore,
  type RuntimeDebugFileStat,
  type RuntimeDebugIncidentInput,
  type RuntimeDebugIngestInput,
  type RuntimeDebugLine,
} from "./runtimeDebugSession";

export function runRuntimeDebugSessionSelftest(): {
  pass: boolean;
  allPassed: boolean;
  passed: number;
  total: number;
  checks: Array<{ name: string; pass: boolean; detail?: string }>;
} {
  const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
  const check = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass: Boolean(pass), detail });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "forge-runtime-debug-session-"));
  const stateRoot = path.join(root, "state");
  const fixtureRoot = path.join(root, "fixtures");
  const firstPath = path.join(fixtureRoot, "debuglog.txt");
  const secondPath = path.join(fixtureRoot, "debuglog-profile-2.txt");
  let activePath = firstPath;
  let bytes = Buffer.alloc(0);
  let identity: string | null = "file-a";
  const readRequests: Array<{ position: number; length: number }> = [];
  let clock = 1_000;

  const stat = (filePath: string): RuntimeDebugFileStat => {
    if (path.resolve(filePath) !== path.resolve(activePath)) {
      const error = Object.assign(new Error("fixture file is unavailable"), { code: "ENOENT" });
      throw error;
    }
    return { size: bytes.length, fileIdentity: identity };
  };
  const read = (filePath: string, position: number, length: number): Buffer => {
    if (path.resolve(filePath) !== path.resolve(activePath)) throw new Error("fixture path mismatch");
    readRequests.push({ position, length });
    return bytes.subarray(position, Math.min(bytes.length, position + length));
  };
  const now = () => clock++;
  const makeStore = (options: ConstructorParameters<typeof RuntimeDebugSessionStore>[0] = {}) => new RuntimeDebugSessionStore({
    root: stateRoot,
    stat,
    read,
    now,
    maxReadChunkBytes: 17,
    ...options,
  });
  const setFixture = (filePath: string, content: string | Buffer, fileIdentity: string | null) => {
    activePath = filePath;
    bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    identity = fileIdentity;
    readRequests.length = 0;
  };
  const incidentLines = (lines: readonly RuntimeDebugLine[], key = "startup-error"): RuntimeDebugIncidentInput[] => lines
    .filter(line => line.text.includes("STARTUP_ERROR") || line.text.includes("INCIDENT"))
    .map(line => ({
      key,
      summary: line.text,
      classification: "engine",
      severity: "error",
      reason: "fixture evidence",
      evidence: [line.text],
      position: line,
    }));

  const workspace = "ws_runtime_session_a";
  const utfWorkspace = "ws_runtime_session_utf8";
  const segmentWorkspace = "ws_runtime_session_segments";
  const capWorkspace = "ws_runtime_session_caps";
  const largeWorkspace = "ws_runtime_session_large";
  const deployWorkspace = "ws_runtime_session_deploy";
  const tokenCapWorkspace = "ws_runtime_session_token_cap";

  try {
    // Explicit baseline offsets are honored, and only bytes after that baseline are read.
    setFixture(firstPath, "skip-this-line\nKEEP_THIS_LINE\n", "baseline-file");
    const baselineStore = makeStore();
    const baseline = baselineStore.ingest({
      workspaceId: "ws_runtime_session_baseline",
      logPath: firstPath,
      profileId: "profile-a",
      baselineOffset: Buffer.byteLength("skip-this-line\n", "utf8"),
    });
    check("explicit_baseline_offset_starts_reader_at_requested_byte", baseline.ok && baseline.lines.length === 1 && baseline.lines[0].text === "KEEP_THIS_LINE", JSON.stringify(baseline));
    check("bounded_reader_never_requests_more_than_configured_chunk", readRequests.every(request => request.length <= 17), JSON.stringify(readRequests.slice(0, 3)));

    // A startup incident survives well beyond the old 256 KiB tail and is never replaced by raw noise.
    setFixture(firstPath, "STARTUP_ERROR: failed to load module\n", "file-a");
    const store = makeStore();
    const startup = store.ingest({
      workspaceId: workspace,
      logPath: firstPath,
      profileId: "profile-a",
      baselineOffset: 0,
      normalizeLines: lines => incidentLines(lines),
    });
    const startupSegment = startup.ok ? startup.snapshot.currentSegmentId : "";
    const noise = Buffer.from("ordinary noise\n".repeat(24_000), "utf8");
    bytes = Buffer.concat([bytes, noise]);
    const afterNoise = store.ingest({ workspaceId: workspace, logPath: firstPath, profileId: "profile-a" });
    const retainedAfterNoise = afterNoise.ok && afterNoise.snapshot.incidents.some(incident => incident.key === "startup-error" && incident.segmentId === startupSegment);
    check("startup_incident_retained_after_more_than_256kib_noise", Boolean(retainedAfterNoise && afterNoise.ok && afterNoise.bytesRead > 256 * 1024), afterNoise.ok === true ? `${afterNoise.bytesRead}` : afterNoise.error);
    const persistedAfterNoise = fs.readFileSync(store.storagePathFor(workspace), "utf8");
    check("raw_log_noise_is_not_persisted", !persistedAfterNoise.includes("ordinary noise") && persistedAfterNoise.length < noise.length, `${persistedAfterNoise.length}/${noise.length}`);

    // A fresh object reopens the same document and resumes from the committed cursor.
    const restartStore = makeStore();
    const restart = restartStore.ingest({ workspaceId: workspace, logPath: firstPath, profileId: "profile-a" });
    check("restart_reopens_persisted_cursor_without_reread", restart.ok && restart.bytesRead === 0 && restart.lines.length === 0, JSON.stringify(restart));
    bytes = Buffer.concat([bytes, Buffer.from("AFTER_RESTART\n", "utf8")]);
    const afterRestart = restartStore.ingest({ workspaceId: workspace, logPath: firstPath, profileId: "profile-a" });
    check("restart_reads_only_new_bytes_once", afterRestart.ok && afterRestart.bytesRead === Buffer.byteLength("AFTER_RESTART\n", "utf8") && afterRestart.lines.map(line => line.text).join("\n") === "AFTER_RESTART", JSON.stringify(afterRestart));

    // A normalized suffix is a bounded raw-byte reference, independent of the partial line.
    const pendingPrefix = Buffer.concat([Buffer.from("OPEN_WIDGET "), Buffer.from([0xff]), Buffer.from("\r\nTRACEBACK\n")]);
    const pendingInput: RuntimeDebugIngestInput = {
      workspaceId: "ws_runtime_session_pending",
      logPath: firstPath,
      profileId: "profile-a",
      normalizeLines: (lines, _segment, { canDefer }) => {
        const first = lines.find(line => line.text.startsWith("OPEN_WIDGET"));
        const reload = lines.find(line => line.text === "RELOAD");
        if (!first) return [];
        if (canDefer && !reload) return { incidents: [], deferFromLine: first.lineNumber };
        return [{ key: "widget", summary: reload ? "grouped reload" : "widget only", position: { ...first, endByte: reload?.endByte ?? first.endByte } }];
      },
    };
    setFixture(firstPath, Buffer.concat([pendingPrefix, Buffer.from("REL")]), "pending-file");
    const pendingFirst = makeStore().ingest(pendingInput);
    const pendingPath = makeStore().storagePathFor(pendingInput.workspaceId);
    const pendingStateText = fs.readFileSync(pendingPath, "utf8");
    const expectedSpan = pendingFirst.ok ? pendingFirst.snapshot.pendingNormalization : undefined;
    check("pending_span_persists_raw_digest_without_copying_log_or_counting_incident",
      pendingFirst.ok && expectedSpan?.sha256 === createHash("sha256").update(pendingPrefix).digest("hex")
      && expectedSpan.startByte === 0 && expectedSpan.endByte === pendingPrefix.length && expectedSpan.startLine === 1 && expectedSpan.endLine === 2
      && pendingFirst.snapshot.cursor.byteOffset === pendingPrefix.length + 3
      && pendingFirst.snapshot.cursor.partialLineStartByte === pendingPrefix.length
      && pendingFirst.snapshot.counts.incidentOccurrences === 0 && !pendingStateText.includes("OPEN_WIDGET"), JSON.stringify(pendingFirst));
    const pendingRestart = makeStore();
    readRequests.length = 0;
    const idle = pendingRestart.ingest(pendingInput);
    check("restart_reopens_only_bounded_span_and_idle_does_not_count_it",
      idle.ok && idle.bytesRead === 0 && idle.lines.length === 0 && idle.snapshot.counts.linesRead === 2
      && idle.snapshot.counts.incidentOccurrences === 0 && idle.snapshot.pendingNormalization?.sha256 === expectedSpan?.sha256
      && readRequests.length > 0 && readRequests.every(request => request.position + request.length <= pendingPrefix.length && request.length <= 17),
      JSON.stringify({ idle, readRequests }));
    bytes = Buffer.concat([bytes, Buffer.from("OAD\n")]);
    const pendingCloseFailure = makeStore({ beforeRename: () => { throw new Error("injected pending promotion failure"); } }).ingest(pendingInput);
    const stillPending = pendingRestart.readSnapshot(pendingInput.workspaceId);
    check("failed_promotion_preserves_old_cursor_and_pending_span",
      !pendingCloseFailure.ok && stillPending.ok && stillPending.snapshot.cursor.byteOffset === pendingPrefix.length + 3
      && stillPending.snapshot.pendingNormalization?.sha256 === expectedSpan?.sha256 && stillPending.snapshot.counts.incidentOccurrences === 0);
    const completedPending = pendingRestart.ingest(pendingInput);
    const afterCompleted = makeStore().ingest(pendingInput);
    check("completed_partial_line_finishes_one_incident_once_across_restart",
      completedPending.ok && completedPending.lines.length === 1 && completedPending.lines[0].text === "RELOAD" && completedPending.bytesRead === 4
      && completedPending.snapshot.counts.linesRead === 3 && completedPending.snapshot.counts.bytesRead === bytes.length
      && completedPending.snapshot.incidents.length === 1 && completedPending.snapshot.incidents[0].summary === "grouped reload"
      && completedPending.snapshot.incidents[0].first.lineNumber === 1 && completedPending.snapshot.incidents[0].first.endByte === bytes.length
      && !completedPending.snapshot.pendingNormalization
      && afterCompleted.ok && afterCompleted.snapshot.counts.incidentOccurrences === 1, JSON.stringify(completedPending));

    const growingInput = { ...pendingInput, workspaceId: "ws_runtime_session_pending_growing" };
    setFixture(firstPath, "OPEN_WIDGET\n", "growing-file");
    const growingStore = makeStore();
    const growingStart = growingStore.ingest(growingInput);
    bytes = Buffer.concat([bytes, Buffer.from("TRACEBACK\r\n")]);
    const growing = growingStore.ingest(growingInput);
    check("growing_span_rebinds_the_exact_prefix_and_new_complete_line",
      growingStart.ok && growingStart.snapshot.pendingNormalization?.endLine === 1
      && growing.ok && growing.snapshot.pendingNormalization?.endLine === 2 && growing.snapshot.pendingNormalization.endByte === bytes.length
      && growing.snapshot.pendingNormalization.sha256 === createHash("sha256").update(bytes).digest("hex")
      && growing.snapshot.counts.incidentOccurrences === 0 && growing.snapshot.counts.linesRead === 2,
      JSON.stringify(growing));

    const unreadableInput = { ...pendingInput, workspaceId: "ws_runtime_session_pending_unreadable" };
    setFixture(firstPath, pendingPrefix, "unreadable-file");
    const unreadableStart = makeStore().ingest(unreadableInput);
    bytes = Buffer.concat([pendingPrefix, Buffer.from("RELOAD\n")]);
    const unreadable = makeStore({
      read: (filePath, position, length) => {
        if (position < pendingPrefix.length) throw new Error("injected lookback read refusal");
        return read(filePath, position, length);
      },
    }).ingest(unreadableInput);
    check("unreadable_pending_span_degrades_without_losing_fresh_cursor_progress",
      unreadableStart.ok && unreadable.ok && unreadable.status === "degraded" && unreadable.bytesRead === 7
      && unreadable.lines.length === 1 && unreadable.lines[0].text === "RELOAD" && unreadable.snapshot.cursor.byteOffset === bytes.length
      && unreadable.snapshot.incidents.length === 0 && !unreadable.snapshot.pendingNormalization && unreadable.snapshot.dropped.incidents === 1,
      JSON.stringify(unreadable));

    const changedInput = { ...pendingInput, workspaceId: "ws_runtime_session_pending_changed" };
    setFixture(firstPath, pendingPrefix, "same-inode");
    const changedStore = makeStore();
    const changedStart = changedStore.ingest(changedInput);
    // Replace an invalid UTF-8 byte with another that decodes to the same character.
    bytes = Buffer.concat([pendingPrefix, Buffer.from("RELOAD\n")]);
    bytes[Buffer.byteLength("OPEN_WIDGET ")] = 0xfe;
    const changed = changedStore.ingest(changedInput);
    check("raw_same_identity_rewrite_drops_pending_evidence_without_cross_splice",
      changedStart.ok && changed.ok && changed.status === "degraded" && !changed.snapshot.pendingNormalization
      && changed.snapshot.incidents.length === 0 && changed.snapshot.dropped.incidents === 1
      && changed.snapshot.dropped.evidenceBytes === pendingPrefix.length, JSON.stringify(changed));

    const partialRewriteInput = { ...pendingInput, workspaceId: "ws_runtime_session_pending_partial_changed" };
    setFixture(firstPath, Buffer.concat([pendingPrefix, Buffer.from("REL")]), "same-inode");
    const partialRewriteStart = makeStore().ingest(partialRewriteInput);
    bytes = Buffer.concat([pendingPrefix, Buffer.from("xxxOAD\n")]);
    const partialRewrite = makeStore().ingest(partialRewriteInput);
    check("same_identity_partial_rewrite_cannot_synthesize_reload_or_join_pending_widget",
      partialRewriteStart.ok && partialRewrite.ok && partialRewrite.status === "degraded"
      && partialRewrite.lines.length === 1 && partialRewrite.lines[0].text === "xxxOAD" && partialRewrite.lines[0].lineNumber === 3
      && partialRewrite.snapshot.incidents.length === 0 && !partialRewrite.snapshot.pendingNormalization
      && partialRewrite.snapshot.dropped.incidents === 1 && partialRewrite.snapshot.dropped.evidenceBytes === pendingPrefix.length, JSON.stringify(partialRewrite));

    const crossingRewriteInput = { ...pendingInput, workspaceId: "ws_runtime_session_pending_crossing_rewrite" };
    setFixture(firstPath, pendingPrefix, "same-inode");
    const crossingRewriteStart = makeStore().ingest(crossingRewriteInput);
    bytes = Buffer.concat([pendingPrefix, Buffer.from("RELOAD\nOTHER\n")]);
    let swapped = false;
    const crossingRewrite = makeStore({
      read: (filePath, position, length) => {
        const chunk = read(filePath, position, length);
        if (!swapped && position === pendingPrefix.length) {
          // The cursor read observes an old complete reload. Both subsequent reads see the
          // same inode and size, with the original pending prefix and a different fresh row.
          bytes = Buffer.concat([pendingPrefix, Buffer.from("R0LOAD\nOTHER\n")]);
          swapped = true;
        }
        return chunk;
      },
    }).ingest(crossingRewriteInput);
    check("fresh_read_generation_swap_cannot_finalize_crossing_incident",
      crossingRewriteStart.ok && swapped && crossingRewrite.ok && crossingRewrite.status === "degraded"
      && crossingRewrite.lines.map(line => line.text).join("\n") === "R0LOAD\nOTHER"
      && crossingRewrite.snapshot.incidents.length === 0 && !crossingRewrite.snapshot.pendingNormalization
      && crossingRewrite.snapshot.dropped.incidents === 1 && crossingRewrite.snapshot.cursor.byteOffset === bytes.length,
      JSON.stringify(crossingRewrite));

    const idleLossInput = { ...pendingInput, workspaceId: "ws_runtime_session_pending_idle_partial_loss" };
    setFixture(firstPath, Buffer.concat([pendingPrefix, Buffer.from("REL")]), "same-inode");
    const idleLossStart = makeStore().ingest(idleLossInput);
    bytes = Buffer.concat([pendingPrefix, Buffer.from("XXX")]);
    bytes[Buffer.byteLength("OPEN_WIDGET ")] = 0xfe;
    const idleLoss = makeStore().ingest(idleLossInput);
    check("idle_lost_span_drops_adjacent_cached_partial_bytes_at_original_position",
      idleLossStart.ok && idleLoss.ok && idleLoss.bytesRead === 0 && idleLoss.status === "degraded" && !idleLoss.snapshot.pendingNormalization
      && idleLoss.snapshot.cursor.byteOffset === bytes.length && idleLoss.snapshot.cursor.partialLineStartByte === pendingPrefix.length
      && idleLoss.snapshot.cursor.partialLineBytes === 0 && idleLoss.snapshot.cursor.partialLineDroppedBytes === 3
      && idleLoss.snapshot.dropped.partialLineBytes === 3, JSON.stringify(idleLoss));
    bytes = Buffer.concat([bytes, Buffer.from("OAD\nOTHER\n")]);
    const idleLossCompleted = makeStore().ingest(idleLossInput);
    check("lost_partial_remainder_stays_unparseable_through_later_lf_and_restart",
      idleLossCompleted.ok && idleLossCompleted.lines.length === 2
      && idleLossCompleted.lines[0].text === "" && idleLossCompleted.lines[0].truncated
      && idleLossCompleted.lines[0].startByte === pendingPrefix.length && idleLossCompleted.lines[0].lineNumber === 3
      && idleLossCompleted.lines[1].text === "OTHER" && idleLossCompleted.lines[1].lineNumber === 4
      && idleLossCompleted.snapshot.cursor.byteOffset === bytes.length && idleLossCompleted.snapshot.dropped.partialLineBytes === 6
      && idleLossCompleted.snapshot.incidents.length === 0, JSON.stringify(idleLossCompleted));

    const lifecycleInput: RuntimeDebugIngestInput = {
      ...pendingInput,
      workspaceId: "ws_runtime_session_pending_boundary",
      boundaryForLine: line => line.text === "NEW_GAME" ? "game-started" : undefined,
    };
    setFixture(firstPath, pendingPrefix, "lifecycle-file");
    const lifecycleStore = makeStore();
    const lifecycleStart = lifecycleStore.ingest(lifecycleInput);
    bytes = Buffer.concat([bytes, Buffer.from("NEW_GAME\nRELOAD\n")]);
    const lifecycle = lifecycleStore.ingest(lifecycleInput);
    check("lifecycle_flush_cannot_defer_and_keeps_old_widget_in_old_segment",
      lifecycleStart.ok && lifecycle.ok && !lifecycle.snapshot.pendingNormalization && lifecycle.snapshot.incidents.length === 1
      && lifecycle.snapshot.incidents[0].summary === "widget only" && lifecycle.snapshot.incidents[0].segmentId === lifecycleStart.snapshot.currentSegmentId
      && lifecycle.snapshot.currentSegmentId !== lifecycleStart.snapshot.currentSegmentId, JSON.stringify(lifecycle));

    const capInput = { ...pendingInput, workspaceId: "ws_runtime_session_pending_cap" };
    setFixture(firstPath, "OPEN_WIDGET\n" + "TRACE\n".repeat(RUNTIME_DEBUG_MAX_PENDING_NORMALIZATION_LINES), "pending-cap-file");
    const overLimit = makeStore().ingest(capInput);
    check("over_limit_deferral_is_rejected_before_checkpoint",
      overLimit.ok === false && overLimit.code === "SESSION_NORMALIZER_FAILED" && !fs.existsSync(makeStore().storagePathFor(capInput.workspaceId)));

    const malformed = JSON.parse(pendingStateText);
    malformed.pendingNormalization.endByte += 1;
    fs.writeFileSync(pendingPath, JSON.stringify(malformed));
    const corruptPending = makeStore().readSnapshot(pendingInput.workspaceId);
    check("invalid_persisted_span_is_reported_corrupt",
      corruptPending.ok === false && corruptPending.code === "SESSION_STORE_CORRUPT", JSON.stringify(corruptPending));

    // A per-ingest source-byte budget bounds total work and output; a multi-megabyte
    // fixture is consumed over repeated calls while its first incident remains retained.
    const largeNoise = Buffer.from("large-noise\n".repeat(225_000), "utf8");
    const largeContent = Buffer.concat([Buffer.from("STARTUP_ERROR: large fixture\n", "utf8"), largeNoise]);
    setFixture(firstPath, largeContent, "large-file");
    const maxBytesPerIngest = 64 * 1024;
    const largeStore = makeStore({ maxBytesPerIngest, maxReadChunkBytes: 8192 });
    let largeResult = largeStore.ingest({
      workspaceId: largeWorkspace,
      logPath: firstPath,
      profileId: "profile-a",
      baselineOffset: 0,
      normalizeLines: lines => incidentLines(lines, "large-startup"),
    });
    let largeCalls = 0;
    let largeCallBytesBounded = true;
    let largeCallLinesBounded = true;
    while (largeResult.ok && largeCalls < 100) {
      largeCalls += 1;
      largeCallBytesBounded = largeCallBytesBounded && largeResult.bytesRead <= maxBytesPerIngest;
      largeCallLinesBounded = largeCallLinesBounded && largeResult.lines.length <= 6_000;
      if (largeResult.snapshot.cursor.byteOffset >= largeContent.length) break;
      largeResult = largeStore.ingest({
        workspaceId: largeWorkspace,
        logPath: firstPath,
        profileId: "profile-a",
        normalizeLines: lines => incidentLines(lines, "large-startup"),
      });
    }
    const largeReachedEof = largeResult.ok && largeResult.snapshot.cursor.byteOffset === largeContent.length;
    const largeIncidentRetained = largeResult.ok && largeResult.snapshot.incidents.some(incident => incident.key === "large-startup");
    check("per_ingest_byte_and_line_output_is_bounded", largeContent.length > 2 * 1024 * 1024 && largeCalls > 2 && largeCallBytesBounded && largeCallLinesBounded, JSON.stringify({ largeCalls, bytes: largeResult.ok === true ? largeResult.bytesRead : largeResult.error }));
    check("multi_megabyte_log_eventually_reaches_eof_and_retains_early_incident", largeReachedEof && largeIncidentRetained, JSON.stringify(largeResult.ok === true ? { cursor: largeResult.snapshot.cursor, incidents: largeResult.snapshot.incidents.length } : largeResult));
    const largePersisted = JSON.parse(fs.readFileSync(largeStore.storagePathFor(largeWorkspace), "utf8")) as Record<string, unknown>;
    const largeLimits = largePersisted.limits as { maxBytesPerIngest?: number } | undefined;
    check("ingest_cap_metadata_is_persisted_for_restart_validation", largeLimits?.maxBytesPerIngest === maxBytesPerIngest, JSON.stringify(largePersisted.limits));

    // Raw-byte accumulation, rather than per-chunk string concatenation, preserves split UTF-8 and partial lines.
    setFixture(firstPath, Buffer.from("αβ\npartial", "utf8"), "utf8-file");
    const utfStore = makeStore({ maxReadChunkBytes: 2 });
    const utfFirst = utfStore.ingest({ workspaceId: utfWorkspace, logPath: firstPath, profileId: "profile-a", baselineOffset: 0 });
    check("multibyte_utf8_split_across_chunks_is_exact", utfFirst.ok && utfFirst.lines.length === 1 && utfFirst.lines[0].text === "αβ" && utfFirst.snapshot.cursor.partialLineBytes === Buffer.byteLength("partial", "utf8"), JSON.stringify(utfFirst));
    bytes = Buffer.concat([bytes, Buffer.from(" final\n", "utf8")]);
    const utfSecond = utfStore.ingest({ workspaceId: utfWorkspace, logPath: firstPath, profileId: "profile-a" });
    check("partial_final_line_is_reconstructed_exactly_once", utfSecond.ok && utfSecond.lines.length === 1 && utfSecond.lines[0].text === "partial final" && utfSecond.snapshot.cursor.partialLineBytes === 0, JSON.stringify(utfSecond));

    // Replacement/rotation, truncation, path switch, and profile switch are all explicit boundaries.
    setFixture(firstPath, "before\nINCIDENT old\n", "segment-a");
    const segmentStore = makeStore({ maxSegments: 6 });
    const firstSegment = segmentStore.ingest({
      workspaceId: segmentWorkspace,
      logPath: firstPath,
      profileId: "profile-a",
      baselineOffset: 0,
      normalizeLines: lines => incidentLines(lines, "old-incident"),
    });
    const firstId = firstSegment.ok ? firstSegment.snapshot.currentSegmentId : "";
    setFixture(firstPath, "replacement-with-more-bytes\n", "segment-b");
    const replaced = segmentStore.ingest({ workspaceId: segmentWorkspace, logPath: firstPath, profileId: "profile-a" });
    const replacementId = replaced.ok ? replaced.snapshot.currentSegmentId : "";
    check("replacement_or_rotation_creates_explicit_segment", replaced.ok && replaced.segmentBoundary?.reason === "file-replaced-or-rotated" && replacementId !== firstId, JSON.stringify(replaced));
    setFixture(firstPath, "short\n", "segment-b");
    const truncated = segmentStore.ingest({ workspaceId: segmentWorkspace, logPath: firstPath, profileId: "profile-a" });
    const truncationId = truncated.ok ? truncated.snapshot.currentSegmentId : "";
    check("same_identity_truncation_creates_explicit_segment", truncated.ok && truncated.segmentBoundary?.reason === "truncation" && truncationId !== replacementId, JSON.stringify(truncated));
    setFixture(secondPath, "path-switch\n", "segment-c");
    const pathChanged = segmentStore.ingest({ workspaceId: segmentWorkspace, logPath: secondPath, profileId: "profile-a" });
    const pathId = pathChanged.ok ? pathChanged.snapshot.currentSegmentId : "";
    check("selected_path_change_creates_explicit_segment", pathChanged.ok && pathChanged.segmentBoundary?.reason === "selected-path-change" && pathId !== truncationId, JSON.stringify(pathChanged));
    setFixture(secondPath, "profile-switch\n", "segment-d");
    const profileChanged = segmentStore.ingest({ workspaceId: segmentWorkspace, logPath: secondPath, profileId: "profile-b" });
    check("profile_change_creates_explicit_segment", profileChanged.ok && profileChanged.segmentBoundary?.reason === "profile-change" && profileChanged.snapshot.currentSegmentId !== pathId, JSON.stringify(profileChanged));
    check("historical_incident_keeps_its_segment_identity", firstSegment.ok && segmentStore.readSnapshot(segmentWorkspace).ok && (segmentStore.readSnapshot(segmentWorkspace) as { ok: true; snapshot: { incidents: Array<{ segmentId: string }> } }).snapshot.incidents.some(incident => incident.segmentId === firstId && incident.segmentId !== (segmentStore.readSnapshot(segmentWorkspace) as { ok: true; snapshot: { currentSegmentId: string } }).snapshot.currentSegmentId), "historical incident was not separated from current segment");

    // Deploy baselines are explicit even when selection is unchanged.  The opaque
    // token is hashed, persisted, and makes retries idempotent across restart.
    setFixture(firstPath, "deploy baseline\n", "deploy-file");
    const deployStore = makeStore();
    const deployOpen = deployStore.ingest({ workspaceId: deployWorkspace, logPath: firstPath, profileId: "profile-a", baselineOffset: 0 });
    const deployOffset = bytes.length;
    const deployBaseline = deployStore.beginBaseline({
      workspaceId: deployWorkspace,
      logPath: firstPath,
      profileId: "profile-a",
      baselineToken: "deploy-token-one",
      baselineOffset: deployOffset,
      baselineLineNumber: 10,
    });
    const deployFirstCount = deployBaseline.ok ? deployBaseline.snapshot.segments.length : 0;
    check("same_file_deploy_baseline_creates_named_boundary", deployOpen.ok && deployBaseline.ok && deployBaseline.segmentBoundary?.reason === "baseline" && deployFirstCount === 2 && deployBaseline.snapshot.segments.at(-1)?.baselineLineNumber === 10, JSON.stringify(deployBaseline));
    const duplicateDeploy = deployStore.beginBaseline({
      workspaceId: deployWorkspace,
      logPath: firstPath,
      profileId: "profile-a",
      baselineToken: "deploy-token-one",
      baselineOffset: deployOffset,
      baselineLineNumber: 10,
    });
    check("duplicate_deploy_token_is_idempotent_without_new_segment", duplicateDeploy.ok && !duplicateDeploy.segmentBoundary && duplicateDeploy.snapshot.segments.length === deployFirstCount, JSON.stringify(duplicateDeploy));
    const differentDeploy = deployStore.beginBaseline({
      workspaceId: deployWorkspace,
      logPath: firstPath,
      profileId: "profile-a",
      baselineToken: "deploy-token-two",
      baselineOffset: deployOffset,
      baselineLineNumber: 20,
    });
    check("different_deploy_token_creates_distinct_boundary", differentDeploy.ok && differentDeploy.segmentBoundary?.reason === "baseline" && differentDeploy.snapshot.segments.length === deployFirstCount + 1 && differentDeploy.snapshot.segments.at(-1)?.baselineLineNumber === 20, JSON.stringify(differentDeploy));
    const deployPath = deployStore.storagePathFor(deployWorkspace);
    const deployCanonicalDocument = fs.readFileSync(deployPath, "utf8");
    const deployDocument = JSON.parse(deployCanonicalDocument) as { baselineTokens?: Array<{ tokenHash?: string }>; limits?: { maxBytesPerIngest?: number; maxReadChunkBytes?: number; maxBaselineTokens?: number } };
    check("baseline_token_and_cap_metadata_is_bounded_and_canonical", deployDocument.baselineTokens?.length === 2 && deployDocument.baselineTokens.every(token => typeof token.tokenHash === "string" && !token.tokenHash.includes("deploy-token")) && deployDocument.limits?.maxBytesPerIngest === 1024 * 1024 && deployDocument.limits.maxReadChunkBytes === 17 && deployDocument.limits.maxBaselineTokens === 64, JSON.stringify(deployDocument));
    const invalidCapDocument = JSON.parse(deployCanonicalDocument) as Record<string, unknown>;
    invalidCapDocument.limits = { ...(invalidCapDocument.limits as Record<string, unknown>), maxBytesPerIngest: 0 };
    fs.writeFileSync(deployPath, JSON.stringify(invalidCapDocument), "utf8");
    const invalidCapRead = makeStore().readSnapshot(deployWorkspace);
    check("invalid_persisted_ingest_cap_is_refused", !invalidCapRead.ok && invalidCapRead.status === "corrupt" && invalidCapRead.rebuildRequired, JSON.stringify(invalidCapRead));
    const invalidTokenDocument = JSON.parse(deployCanonicalDocument) as Record<string, unknown>;
    const invalidTokenRecords = invalidTokenDocument.baselineTokens as Array<Record<string, unknown>>;
    invalidTokenRecords[0].tokenHash = "raw-token";
    fs.writeFileSync(deployPath, JSON.stringify(invalidTokenDocument), "utf8");
    const invalidTokenRead = makeStore().readSnapshot(deployWorkspace);
    check("invalid_persisted_baseline_token_is_refused", !invalidTokenRead.ok && invalidTokenRead.status === "corrupt" && invalidTokenRead.rebuildRequired, JSON.stringify(invalidTokenRead));
    fs.writeFileSync(deployPath, deployCanonicalDocument, "utf8");
    const deployRestart = makeStore();
    const duplicateAfterRestart = deployRestart.beginBaseline({
      workspaceId: deployWorkspace,
      logPath: firstPath,
      profileId: "profile-a",
      baselineToken: "deploy-token-two",
      baselineOffset: deployOffset,
      baselineLineNumber: 20,
    });
    check("duplicate_deploy_token_is_idempotent_after_restart", duplicateAfterRestart.ok && !duplicateAfterRestart.segmentBoundary && duplicateAfterRestart.snapshot.segments.length === deployFirstCount + 1 && duplicateAfterRestart.snapshot.baselineTokens.length === 2, JSON.stringify(duplicateAfterRestart));
    const healthySnapshot = deployRestart.readSnapshot(deployWorkspace);
    check("healthy_zero_incident_storage_never_reports_clean", healthySnapshot.ok && healthySnapshot.snapshot.health === "ready" && healthySnapshot.snapshot.incidents.length === 0 && healthySnapshot.snapshot.clean === false, JSON.stringify(healthySnapshot));
    const tokenCapStore = makeStore({ maxBaselineTokens: 1 });
    const tokenCapOpen = tokenCapStore.ingest({ workspaceId: tokenCapWorkspace, logPath: firstPath, profileId: "profile-a", baselineOffset: 0 });
    const tokenCapOffset = bytes.length;
    const tokenCapFirst = tokenCapStore.beginBaseline({ workspaceId: tokenCapWorkspace, logPath: firstPath, profileId: "profile-a", baselineToken: "cap-token-one", baselineOffset: tokenCapOffset });
    const tokenCapSecond = tokenCapStore.beginBaseline({ workspaceId: tokenCapWorkspace, logPath: firstPath, profileId: "profile-a", baselineToken: "cap-token-two", baselineOffset: tokenCapOffset });
    check("baseline_token_cap_prunes_deterministically_and_degrades", tokenCapOpen.ok && tokenCapFirst.ok && tokenCapSecond.ok && tokenCapSecond.snapshot.baselineTokens.length === 1 && tokenCapSecond.snapshot.dropped.baselineTokens === 1 && tokenCapSecond.snapshot.health === "degraded", JSON.stringify(tokenCapSecond));

    // Cap pruning is deterministic and visible as degraded rather than a false clean state.
    setFixture(firstPath, "cap\n", "cap-file");
    const capStore = makeStore({ maxIncidents: 2, maxIncidentBytes: 12_000, maxSegments: 2 });
    const capOpen = capStore.ingest({ workspaceId: capWorkspace, logPath: firstPath, profileId: "profile-a", baselineOffset: 0 });
    check("cap_fixture_opens", capOpen.ok, JSON.stringify(capOpen));
    const capBatch = (key: string): RuntimeDebugIncidentInput => ({ key, summary: `summary-${key}`, evidence: [`evidence-${key}`] });
    capStore.recordIncidents({ workspaceId: capWorkspace, incidents: [capBatch("one"), capBatch("two"), capBatch("three")] });
    const capped = capStore.readSnapshot(capWorkspace);
    check("incident_cap_prunes_oldest_deterministically", capped.ok && capped.snapshot.incidents.map(incident => incident.key).join(",") === "two,three", capped.ok === true ? JSON.stringify(capped.snapshot.incidents) : capped.error);
    check("cap_pruning_reports_dropped_aggregate_and_not_clean", capped.ok && capped.snapshot.dropped.incidents === 1 && !capped.snapshot.clean && capped.snapshot.health === "degraded", capped.ok === true ? JSON.stringify(capped.snapshot.dropped) : capped.error);

    // Retention ranks confirmed-active engine failures ahead of newer warnings,
    // even when the incident-byte cap is exceeded and the store is reopened.
    const priorityWorkspace = "ws_runtime_session_priority";
    const priorityStore = makeStore({ maxIncidentBytes: 4_096, maxIncidents: 256 });
    setFixture(firstPath, "priority\n", "priority-file");
    const priorityOpen = priorityStore.ingest({ workspaceId: priorityWorkspace, logPath: firstPath, profileId: "profile-a", baselineOffset: 0 });
    const activePriority: RuntimeDebugIncidentInput = {
      key: "early-confirmed-active-engine-failure",
      summary: "early active engine failure",
      classification: "direct_extension_fault",
      severity: "error",
      reason: "confirmed active exact path",
      evidence: ["extensions/x4_ai_influence/md/ai_influence_conversation.xml(98)"],
      attributes: {
        isEngineFailure: true,
        attribution: JSON.stringify({ disposition: "confirmed_active" }),
      },
    };
    priorityStore.recordIncidents({ workspaceId: priorityWorkspace, incidents: [activePriority] });
    for (let index = 0; index < 80; index++) {
      priorityStore.recordIncidents({ workspaceId: priorityWorkspace, incidents: [{
        key: `later-noise-${index}`,
        summary: `later noise ${index} ${"N".repeat(96)}`,
        classification: "unknown",
        severity: "warning",
        reason: "bounded noise",
      }] });
    }
    const priorityRestart = makeStore({ maxIncidentBytes: 4_096, maxIncidents: 256 }).readSnapshot(priorityWorkspace);
    check(
      "confirmed_active_engine_failure_wins_byte_cap_and_restart",
      priorityOpen.ok && priorityRestart.ok && priorityRestart.snapshot.dropped.incidents > 0 && priorityRestart.snapshot.incidents.some(incident => incident.key === activePriority.key),
      priorityRestart.ok ? JSON.stringify({ dropped: priorityRestart.snapshot.dropped, keys: priorityRestart.snapshot.incidents.map(incident => incident.key) }) : JSON.stringify(priorityRestart),
    );

    // Unsupported, corrupt, and over-cap persisted documents are explicit refusal states.
    setFixture(firstPath, "bad\n", "bad-file");
    const badWorkspace = "ws_runtime_session_bad";
    const badStore = makeStore();
    const badOpen = badStore.ingest({ workspaceId: badWorkspace, logPath: firstPath, profileId: "profile-a", baselineOffset: 0 });
    check("bad_fixture_opens_before_corruption", badOpen.ok, JSON.stringify(badOpen));
    const badPath = badStore.storagePathFor(badWorkspace);
    const validBytes = JSON.parse(fs.readFileSync(badPath, "utf8")) as Record<string, unknown>;
    fs.writeFileSync(badPath, JSON.stringify({ ...validBytes, version: 99 }), "utf8");
    const unsupported = badStore.readSnapshot(badWorkspace);
    check("unsupported_schema_is_explicit_and_requires_rebuild", !unsupported.ok && unsupported.status === "unsupported" && unsupported.rebuildRequired && !unsupported.snapshot, JSON.stringify(unsupported));
    fs.writeFileSync(badPath, "{not-json", "utf8");
    const corrupt = badStore.readSnapshot(badWorkspace);
    check("corrupt_store_is_explicit_and_requires_rebuild", !corrupt.ok && corrupt.status === "corrupt" && corrupt.rebuildRequired, JSON.stringify(corrupt));
    const overCap = new RuntimeDebugSessionStore({ root: stateRoot, maxStoreBytes: 8, stat, read, now }).readSnapshot(capWorkspace);
    check("over_cap_store_is_explicit_and_not_clean", !overCap.ok && overCap.status === "over-cap" && overCap.rebuildRequired && !overCap.snapshot, JSON.stringify(overCap));

    // Failed promotion preserves the prior document and leaves no sibling temp litter.
    const atomicWorkspace = "ws_runtime_session_atomic";
    setFixture(firstPath, "atomic\n", "atomic-file");
    const atomicStore = makeStore();
    const atomicOpen = atomicStore.ingest({ workspaceId: atomicWorkspace, logPath: firstPath, profileId: "profile-a", baselineOffset: 0 });
    check("atomic_fixture_opens", atomicOpen.ok, JSON.stringify(atomicOpen));
    const atomicPath = atomicStore.storagePathFor(atomicWorkspace);
    const beforeFailure = fs.readFileSync(atomicPath, "utf8");
    let injected = true;
    const failingStore = makeStore({ beforeRename: () => { if (injected) { injected = false; throw new Error("injected promotion failure"); } } });
    const failedPromotion = failingStore.recordIncidents({ workspaceId: atomicWorkspace, incidents: [{ key: "should-not-commit", summary: "failed promotion" }] });
    check("failed_atomic_promotion_is_reported", !failedPromotion.ok && failedPromotion.status === "error", JSON.stringify(failedPromotion));
    check("failed_atomic_promotion_preserves_previous_document", fs.readFileSync(atomicPath, "utf8") === beforeFailure && !fs.readdirSync(stateRoot).some(name => name.endsWith(".tmp")), "previous document or temporary cleanup changed");
    const afterFailedPromotion = new RuntimeDebugSessionStore({ root: stateRoot, stat, read, now }).readSnapshot(atomicWorkspace);
    check("failed_atomic_promotion_does_not_publish_incident", afterFailedPromotion.ok && !afterFailedPromotion.snapshot.incidents.some(incident => incident.key === "should-not-commit"), JSON.stringify(afterFailedPromotion));

    // Workspace keys are validated and hashed; the store root can explicitly reject game/mod/corpus overlap.
    let traversalRejected = false;
    try { store.storagePathFor("../../escape"); } catch { traversalRejected = true; }
    check("hostile_workspace_key_cannot_escape_store_root", traversalRejected && store.storagePathFor(workspace).startsWith(stateRoot), store.storagePathFor(workspace));
    let forbiddenRootRejected = false;
    try { new RuntimeDebugSessionStore({ root: path.join(root, "game"), forbiddenRoots: [path.join(root, "game")] }); }
    catch (error) { forbiddenRootRejected = /forbidden/i.test(String(error)); }
    check("forbidden_game_mod_corpus_root_is_rejected", forbiddenRootRejected);
  } catch (error) {
    check("selftest_unexpected_exception", false, error instanceof Error ? error.message : String(error));
  } finally {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort fixture cleanup */ }
  }

  const passed = checks.filter(item => item.pass).length;
  return { pass: passed === checks.length, allPassed: passed === checks.length, passed, total: checks.length, checks };
}

const invokedDirectly = path.basename(process.argv[1] ?? "") === "runtimeDebugSession.selftest.ts";
if (invokedDirectly) {
  const result = runRuntimeDebugSessionSelftest();
  console.log(JSON.stringify(result, null, 2));
  if (!result.allPassed) process.exitCode = 1;
}
