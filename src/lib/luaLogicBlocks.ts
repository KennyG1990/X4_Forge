/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * P2 — Lua logic authoring, blocks-first.
 *
 * These are structured Lua idiom blocks, not raw snippets: each block has a typed
 * config and compiles into a known-good Lua fragment. The output is still text
 * because Lua authoring needs a real script surface, but agents can compose the
 * script from deterministic blocks first.
 */

import { analyzeLuaFiles } from './luaStaticAnalysis';

export type LuaLogicBlockKind = 'event_handler' | 'djfhe_http_call' | 'json_parse' | 'response_poll';

export interface LuaLogicBlock {
  id: string;
  kind: LuaLogicBlockKind;
  title?: string;
  config: {
    namespace?: string;
    event?: string;
    functionName?: string;
    url?: string;
    payloadVar?: string;
    responseEvent?: string;
    errorEvent?: string;
    responseVar?: string;
    jsonTextVar?: string;
    outputVar?: string;
    intervalSeconds?: string;
    maxAttempts?: string;
  };
}

export interface LuaLogicScript {
  fileName: string;
  blocks: LuaLogicBlock[];
}

const ID_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function luaString(value: string): string {
  return JSON.stringify(String(value ?? ''));
}

function fnName(value: string | undefined, fallback: string): string {
  const raw = String(value || fallback).trim();
  return ID_RE.test(raw) ? raw : fallback;
}

function numLiteral(value: string | undefined, fallback: string): string {
  const raw = String(value || '').trim();
  return /^\d+(\.\d+)?$/.test(raw) ? raw : fallback;
}

export function buildLuaLogicBlock(block: LuaLogicBlock): string {
  const c = block.config || {};
  switch (block.kind) {
    case 'event_handler': {
      const ns = c.namespace || 'ai_influence';
      const event = c.event || 'chat';
      const handler = fnName(c.functionName, `on_${event}`);
      return [
        `local function ${handler}(payload)`,
        `    payload = payload or {}`,
        `    DebugError(${luaString(`[${ns}] ${event} received`)})`,
        `    return payload`,
        `end`,
        ``,
        `RegisterEvent(${luaString(`${ns}.${event}`)}, function(_, payload)`,
        `    ${handler}(payload)`,
        `end)`,
      ].join('\n');
    }
    case 'djfhe_http_call': {
      const call = fnName(c.functionName, 'call_ai_influence');
      const payloadVar = fnName(c.payloadVar, 'payload');
      const responseEvent = c.responseEvent || 'chat.response';
      const errorEvent = c.errorEvent || 'chat.error';
      return [
        `local Request = require("djfhe.http.request")`,
        `local json = require("jsonlua.json")`,
        ``,
        `local function ${call}(${payloadVar})`,
        `    local body = json.encode(${payloadVar} or {})`,
        `    local request = Request:new({`,
        `        method = "POST",`,
        `        url = ${luaString(c.url || 'http://127.0.0.1:8713/v1/chat')},`,
        `        body = body,`,
        `        headers = { ["Content-Type"] = "application/json" }`,
        `    })`,
        `    request:send(function(response, err)`,
        `        if err ~= nil then`,
        `            AddUITriggeredEvent(${luaString(c.namespace || 'ai_influence')}, ${luaString(errorEvent)}, tostring(err))`,
        `            return`,
        `        end`,
        `        AddUITriggeredEvent(${luaString(c.namespace || 'ai_influence')}, ${luaString(responseEvent)}, response and response:getBody() or "")`,
        `    end)`,
        `end`,
      ].join('\n');
    }
    case 'json_parse': {
      const parser = fnName(c.functionName, 'parse_chat_response');
      const input = fnName(c.jsonTextVar, 'jsonText');
      const output = fnName(c.outputVar, 'decoded');
      return [
        `local function ${parser}(${input})`,
        `    local ok, ${output} = pcall(json.decode, ${input} or "{}")`,
        `    if not ok then`,
        `        DebugError("AI Influence JSON parse failed: " .. tostring(${output}))`,
        `        return { ok = false }`,
        `    end`,
        `    return ${output}`,
        `end`,
      ].join('\n');
    }
    case 'response_poll': {
      const poller = fnName(c.functionName, 'poll_chat_response');
      const interval = numLiteral(c.intervalSeconds, '0.5');
      const maxAttempts = numLiteral(c.maxAttempts, '20');
      return [
        `local function ${poller}(readResponse)`,
        `    local attempts = 0`,
        `    while attempts < ${maxAttempts} do`,
        `        attempts = attempts + 1`,
        `        local response = readResponse and readResponse() or nil`,
        `        if response ~= nil and response ~= "" then return response end`,
        `        -- X4 UI Lua has no blocking sleep here; caller wires this through update ticks.`,
        `        DebugError("AI Influence poll attempt " .. tostring(attempts) .. " interval ${interval}s")`,
        `    end`,
        `    return nil`,
        `end`,
      ].join('\n');
    }
    default:
      return '';
  }
}

export function buildLuaLogicScript(script: LuaLogicScript): string {
  const blocks = script.blocks || [];
  return [
    `-- ${script.fileName || 'ai_influence_chat.lua'}`,
    `-- Generated by X4 Forge structured Lua logic blocks.`,
    ``,
    ...blocks.map(buildLuaLogicBlock),
    ``,
    `return {`,
    `    blocks = ${blocks.length}`,
    `}`,
    ``,
  ].join('\n\n');
}

export function aiInfluenceChatBlocks(): LuaLogicScript {
  return {
    fileName: 'ai_influence_chat.lua',
    blocks: [
      { id: 'on_chat', kind: 'event_handler', title: 'Receive MD chat request',
        config: { namespace: 'ai_influence', event: 'chat', functionName: 'on_chat_request' } },
      { id: 'call_model', kind: 'djfhe_http_call', title: 'Call local AI service',
        config: { namespace: 'ai_influence', functionName: 'call_ai_service', payloadVar: 'payload', url: 'http://127.0.0.1:8713/v1/chat', responseEvent: 'chat.response', errorEvent: 'chat.error' } },
      { id: 'parse_response', kind: 'json_parse', title: 'Parse model JSON',
        config: { functionName: 'parse_chat_response', jsonTextVar: 'jsonText', outputVar: 'decoded' } },
      { id: 'poll_response', kind: 'response_poll', title: 'Poll response file',
        config: { functionName: 'poll_chat_response', intervalSeconds: '0.5', maxAttempts: '20' } },
    ],
  };
}

export function runLuaLogicBlocksSelftest() {
  const checks: { name: string; pass: boolean; detail?: any }[] = [];
  const ok = (name: string, pass: boolean, detail?: any) => checks.push({ name, pass, detail });

  const script = aiInfluenceChatBlocks();
  const lua = buildLuaLogicScript(script);
  ok('builds_ai_influence_chat_file', script.fileName === 'ai_influence_chat.lua' && lua.includes('-- ai_influence_chat.lua'));
  ok('contains_event_handler_block', lua.includes('RegisterEvent("ai_influence.chat"') && lua.includes('on_chat_request'));
  ok('contains_djfhe_http_call_block', lua.includes('require("djfhe.http.request")') && lua.includes('request:send(function(response, err)'));
  ok('contains_json_parse_block', lua.includes('pcall(json.decode') && lua.includes('parse_chat_response'));
  ok('contains_response_poll_block', lua.includes('poll_chat_response') && lua.includes('attempts < 20'));
  const analysis = analyzeLuaFiles([{ rel: `ui/${script.fileName}`, text: lua, source: 'loose', sourcePath: 'generated', extension: { folder: 'generated', id: 'generated' } }]);
  ok('generated_ai_influence_chat_passes_luaparse', !analysis.findings.some(f => f.code === 'lua.syntax_error'), analysis.findings);
  ok('empty_script_degrades_to_valid_lua', !analyzeLuaFiles([{ rel: 'ui/empty.lua', text: buildLuaLogicScript({ fileName: 'empty.lua', blocks: [] }), source: 'loose', sourcePath: 'empty', extension: { folder: 'empty', id: 'empty' } }]).findings.some(f => f.code === 'lua.syntax_error'));

  const passed = checks.filter(c => c.pass).length;
  return { allPassed: passed === checks.length, pass: passed === checks.length, passed, total: checks.length, checks, sample: { fileName: script.fileName, lua } };
}
