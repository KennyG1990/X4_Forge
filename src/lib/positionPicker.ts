export interface SpawnPosition {
  x: number;
  y: number;
  z: number;
}

export interface PositionParseResult {
  position: SpawnPosition;
  valid: boolean;
  normalized: string;
}

const DEFAULT_POSITION: SpawnPosition = { x: 0, y: 0, z: 0 };

export function clampPosition(value: number, limit = 100000): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-limit, Math.min(limit, value));
}

export function roundPosition(value: number, step = 10): number {
  if (!Number.isFinite(value)) return 0;
  if (step <= 0) return Math.round(value);
  return Math.round(value / step) * step;
}

export function formatPosition(position: SpawnPosition): string {
  return [position.x, position.y, position.z]
    .map(v => String(Math.round(v)))
    .join(',');
}

export function parsePosition(raw: unknown, fallback: SpawnPosition = DEFAULT_POSITION): PositionParseResult {
  const text = String(raw ?? '').trim();
  const parts = text.split(',').map(part => Number(part.trim()));
  const valid = parts.length === 3 && parts.every(Number.isFinite);
  const source = valid
    ? { x: parts[0], y: parts[1], z: parts[2] }
    : fallback;
  const position = {
    x: clampPosition(source.x),
    y: clampPosition(source.y),
    z: clampPosition(source.z),
  };
  return { position, valid, normalized: formatPosition(position) };
}

export function updatePositionAxis(raw: unknown, axis: keyof SpawnPosition, value: number): string {
  const { position } = parsePosition(raw);
  return formatPosition({ ...position, [axis]: clampPosition(roundPosition(value, 1)) });
}

export function positionFromPad(raw: unknown, padX: number, padY: number, range = 10000): string {
  const { position } = parsePosition(raw);
  const x = roundPosition(clampPosition((padX - 0.5) * range * 2));
  const z = roundPosition(clampPosition((padY - 0.5) * range * 2));
  return formatPosition({ ...position, x, z });
}

export function padFromPosition(raw: unknown, range = 10000): { x: number; y: number; valid: boolean } {
  const { position, valid } = parsePosition(raw);
  return {
    x: Math.max(0, Math.min(1, position.x / (range * 2) + 0.5)),
    y: Math.max(0, Math.min(1, position.z / (range * 2) + 0.5)),
    valid,
  };
}

export function runPositionPickerSelftest(): {
  allPassed: boolean;
  pass: boolean;
  passed: number;
  total: number;
  checks: { name: string; pass: boolean; detail?: string }[];
} {
  const checks: { name: string; pass: boolean; detail?: string }[] = [];
  const ok = (name: string, pass: boolean, detail?: string) => checks.push({ name, pass, detail });

  ok('parse valid xyz', parsePosition('10,20,-30').normalized === '10,20,-30');
  ok('parse trims spaces', parsePosition(' 100, 0, -200 ').normalized === '100,0,-200');
  ok('invalid falls back', parsePosition('bad').normalized === '0,0,0' && !parsePosition('bad').valid);
  ok('clamps large values', parsePosition('999999,0,-999999').normalized === '100000,0,-100000');
  ok('axis update preserves other axes', updatePositionAxis('1,2,3', 'y', 40) === '1,40,3');
  ok('pad center maps origin', positionFromPad('1,2,3', 0.5, 0.5) === '0,2,0');
  ok('pad corner maps negative x/z', positionFromPad('0,7,0', 0, 0) === '-10000,7,-10000');
  const pad = padFromPosition('10000,0,-10000');
  ok('position maps to pad edge', pad.x === 1 && pad.y === 0 && pad.valid);

  const passed = checks.filter(c => c.pass).length;
  const allPassed = passed === checks.length;
  return { allPassed, pass: allPassed, passed, total: checks.length, checks };
}
