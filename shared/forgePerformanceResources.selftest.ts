import assert from 'node:assert/strict';
import {
  calculateForgeProcessResourceDelta,
  type ForgeProcessResourceBaseline,
} from './forgePerformanceResources';

const checks: Array<{ name: string; pass: boolean; detail?: string }> = [];
const check = (name: string, assertion: () => void) => {
  try {
    assertion();
    checks.push({ name, pass: true });
  } catch (error) {
    checks.push({ name, pass: false, detail: error instanceof Error ? error.message : String(error) });
  }
};

const baseline = (): ForgeProcessResourceBaseline => ({
  now: 1000,
  cpu: { user: 1_000_000, system: 200_000 },
  loop: { idle: 100, active: 20, utilization: .99 },
});
const reading = (): ForgeProcessResourceBaseline => ({
  now: 2000,
  cpu: { user: 2_200_000, system: 500_000 },
  loop: { idle: 400, active: 120, utilization: .01 },
});

check('first reading has absent deltas and is not a counter reset', () => {
  assert.deepEqual(calculateForgeProcessResourceDelta(reading(), undefined, 4), {
    fields: {}, counterReset: false,
  });
});

check('one process interval preserves both CPU normalizations and loop deltas', () => {
  assert.deepEqual(calculateForgeProcessResourceDelta(reading(), baseline(), 4), {
    fields: {
      elapsedMs: 1000, cpuUserMicros: 1_200_000, cpuSystemMicros: 300_000,
      cpuOneCorePercent: 150, cpuHostPercent: 37.5, eventLoopUtilization: .25,
    },
    counterReset: false,
  });
});

check('missing current or previous loop data leaves only loop attribution absent', () => {
  for (const missing of ['current', 'previous'] as const) {
    const current = reading(); const previous = baseline();
    if (missing === 'current') delete current.loop;
    else delete previous.loop;
    const result = calculateForgeProcessResourceDelta(current, previous, 4);
    assert.equal(result.counterReset, false);
    assert.equal(result.fields.cpuOneCorePercent, 150);
    assert.equal(Object.hasOwn(result.fields, 'eventLoopUtilization'), false);
  }
});

check('active-loop rollback omits loop data without resetting the CPU interval', () => {
  const current = reading(); current.loop!.active = 19;
  const result = calculateForgeProcessResourceDelta(current, baseline(), 4);
  assert.equal(result.fields.cpuHostPercent, 37.5);
  assert.equal(Object.hasOwn(result.fields, 'eventLoopUtilization'), false);
  assert.equal(result.counterReset, false);
});

check('idle-loop rollback omits loop data without resetting the CPU interval', () => {
  const current = reading(); current.loop!.idle = 99;
  const result = calculateForgeProcessResourceDelta(current, baseline(), 4);
  assert.equal(result.fields.cpuHostPercent, 37.5);
  assert.equal(Object.hasOwn(result.fields, 'eventLoopUtilization'), false);
  assert.equal(result.counterReset, false);
});

check('equal monotonic timestamps leave deltas absent and report one reset', () => {
  const current = reading(); current.now = 1000;
  assert.deepEqual(calculateForgeProcessResourceDelta(current, baseline(), 4), {
    fields: {}, counterReset: true,
  });
});

check('clock rollback leaves deltas absent and reports one reset', () => {
  const current = reading(); current.now = 999;
  assert.deepEqual(calculateForgeProcessResourceDelta(current, baseline(), 4), {
    fields: {}, counterReset: true,
  });
});

check('user CPU rollback leaves all deltas absent and reports one reset', () => {
  const current = reading(); current.cpu.user = 999_999;
  assert.deepEqual(calculateForgeProcessResourceDelta(current, baseline(), 4), {
    fields: {}, counterReset: true,
  });
});

check('system CPU rollback leaves all deltas absent and reports one reset', () => {
  const current = reading(); current.cpu.system = 199_999;
  assert.deepEqual(calculateForgeProcessResourceDelta(current, baseline(), 4), {
    fields: {}, counterReset: true,
  });
});

check('an observed zero CPU interval remains zero rather than unavailable', () => {
  const previous = baseline(); const current = reading(); current.cpu = { ...previous.cpu };
  const result = calculateForgeProcessResourceDelta(current, previous, 4);
  assert.equal(result.fields.cpuUserMicros, 0); assert.equal(result.fields.cpuSystemMicros, 0);
  assert.equal(result.fields.cpuOneCorePercent, 0); assert.equal(result.fields.cpuHostPercent, 0);
  assert.equal(result.fields.eventLoopUtilization, .25);
});

check('zero total loop interval remains explicitly unavailable', () => {
  const previous = baseline(); const current = reading(); current.loop = { ...previous.loop! };
  const result = calculateForgeProcessResourceDelta(current, previous, 4);
  assert.equal(result.fields.eventLoopUtilization, null);
  assert.equal(result.counterReset, false);
});

check('one-core CPU above 100 is retained while impossible host percentage is null', () => {
  const previous = baseline(); const current = reading();
  current.cpu = { user: previous.cpu.user + 2_500_000, system: previous.cpu.system };
  const result = calculateForgeProcessResourceDelta(current, previous, 2);
  assert.equal(result.fields.cpuOneCorePercent, 250);
  assert.equal(result.fields.cpuHostPercent, null);
});

check('overflowed CPU percentage stays null without rejecting finite source counters', () => {
  const previous: ForgeProcessResourceBaseline = { now: 0, cpu: { user: 0, system: 0 } };
  const current: ForgeProcessResourceBaseline = {
    now: 1, cpu: { user: Number.MAX_VALUE, system: Number.MAX_VALUE },
  };
  const result = calculateForgeProcessResourceDelta(current, previous, 4);
  assert.equal(result.fields.cpuUserMicros, Number.MAX_VALUE);
  assert.equal(result.fields.cpuSystemMicros, Number.MAX_VALUE);
  assert.equal(result.fields.cpuOneCorePercent, null);
  assert.equal(result.fields.cpuHostPercent, null);
  assert.equal(result.counterReset, false);
});

check('loop arithmetic retains the original floating-point evaluation order', () => {
  const previous = baseline(); const current = reading();
  previous.loop = { idle: 1e308, active: 0 };
  current.loop = { idle: 1e308, active: 1e308 };
  assert.equal(calculateForgeProcessResourceDelta(current, previous, 4).fields.eventLoopUtilization, 0);
});

check('frozen producer baselines and their nested counters are never mutated', () => {
  const previous = baseline(); const current = reading();
  const before = JSON.stringify({ previous, current });
  for (const value of [previous, current]) {
    Object.freeze(value.cpu); Object.freeze(value.loop); Object.freeze(value);
  }
  assert.equal(calculateForgeProcessResourceDelta(current, previous, 4).fields.cpuOneCorePercent, 150);
  assert.equal(JSON.stringify({ previous, current }), before);
});

check('the arithmetic helper introduces no new producer input-rejection branch', () => {
  const result = calculateForgeProcessResourceDelta(reading(), baseline(), 0);
  assert.equal(result.fields.cpuOneCorePercent, 150);
  assert.equal(result.fields.cpuHostPercent, null);
  assert.equal(result.counterReset, false);
});

const passed = checks.filter(result => result.pass).length;
console.log(JSON.stringify({ pass: passed === checks.length, passed, total: checks.length, checks }));
if (passed !== checks.length) process.exitCode = 1;
