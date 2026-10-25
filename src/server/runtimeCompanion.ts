import path from 'node:path';

/** Generated, optional control companion; never installed implicitly. */
export function runtimeCompanionFiles(modId: string, channelDirectory: string): Record<string, string> {
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(modId)) throw new Error('Unsupported companion mod identity.');
  const quote = (value: string) => JSON.stringify(value.replace(/\\/g, '/'));
  const queue = quote(path.join(channelDirectory, 'request.txt'));
  const consumed = quote(path.join(channelDirectory, 'consumed.txt'));
  return {
    'md/forge_runtime.xml': `<?xml version="1.0"?>
<mdscript name="ForgeRuntimeLifecycle"><cues>
<cue name="ForgeSaveLoaded" instantiate="true"><conditions><event_game_loaded/></conditions><actions>
<debug_text text="'FORGE-LIFECYCLE {&quot;v&quot;:1,&quot;modId&quot;:&quot;${modId}&quot;,&quot;event&quot;:&quot;save-loaded&quot;}'"/>
<raise_lua_event name="'forge_runtime_save_loaded'"/></actions></cue>
<cue name="ForgeGameStarted"><conditions><event_game_started/></conditions><actions>
<debug_text text="'FORGE-LIFECYCLE {&quot;v&quot;:1,&quot;modId&quot;:&quot;${modId}&quot;,&quot;event&quot;:&quot;game-started&quot;}'"/>
</actions></cue></cues></mdscript>`,
    'ui/forge_runtime.lua': `-- Optional Forge control companion. No keyboard, shell, arbitrary command or evaluation.
-- io access is runtime-dependent; absence is reported, never bypassed with native injection.
local modid = ${quote(modId)}
local queuepath, consumedpath = ${queue}, ${consumed}
local generation, lastheartbeat = 0, 0
local boot = ""
local function now() return os and os.time and os.time() or 0 end
local function emit(event, id, command)
  local extra = id and (',"requestId":"' .. id .. '","command":"' .. command .. '"') or ""
  DebugError('FORGE-LIFECYCLE {"v":1,"modId":"' .. modid .. '","event":"' .. event .. '","boot":"' .. boot .. '","ts":' .. now() .. extra .. '}')
end
local function newboot()
  generation = generation + 1
  boot = (tostring(now()) .. "_" .. tostring(getElapsedTime()) .. "_" .. tostring({}) .. "_" .. generation):gsub("[^%w_-]", "")
end
local function readfile(file)
  local f = io.open(file, "rb")
  if not f then return nil end
  local data = f:read(2049); f:close()
  if not data or #data > 2048 then return nil end
  return data
end
local function consume(id)
  local f = io.open(consumedpath, "wb")
  if not f then return false end
  local wrote = f:write(id)
  local flushed = f:flush()
  local closed = f:close()
  return wrote ~= nil and flushed ~= nil and closed ~= nil and readfile(consumedpath) == id
end
local function poll()
  local ok = pcall(function()
    if now() - lastheartbeat >= 3 then emit("helper-ready"); lastheartbeat = now() end
    local data = readfile(queuepath)
    if not data then return end
    local id, command, expires, expectedboot = data:match("^([a-f0-9]+)|([a-z]+)|(%d+)|([%w_-]+)\\n$")
    if not id or #id ~= 32 or (command ~= "refreshmd" and command ~= "reloadui") then return end
    if readfile(consumedpath) == id then return end
    if expectedboot ~= boot or tonumber(expires) < now() or tonumber(expires) > now() + 15 then return end
    if not consume(id) then emit("reload-failed", id, command); return end
    -- Consumption precedes invocation so a UI reload cannot execute the same request twice.
    local invoked = pcall(ExecuteDebugCommand, command, nil)
    emit(invoked and "reload-invoked" or "reload-failed", id, command)
    -- 'invoked' records a returned API call only; it does not certify reload completion.
  end)
  if not ok then emit("helper-unavailable"); return end
  Helper.addDelayedOneTimeCallbackOnUpdate(poll, false, getElapsedTime() + 0.5)
end
if not (io and io.open and os and os.time and Helper and Helper.addDelayedOneTimeCallbackOnUpdate and ExecuteDebugCommand and getElapsedTime and RegisterEvent and DebugError) then
  if DebugError then DebugError('FORGE-LIFECYCLE {"v":1,"modId":"' .. modid .. '","event":"helper-unavailable"}') end
else
  newboot()
  RegisterEvent("forge_runtime_save_loaded", function() newboot(); emit("helper-ready") end)
  Helper.addDelayedOneTimeCallbackOnUpdate(poll, false, getElapsedTime() + 0.5)
end
`,
  };
}
