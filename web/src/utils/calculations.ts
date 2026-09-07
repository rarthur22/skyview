// Pure 3D math helpers (no THREE dependency — plain x/y/z).

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

const DEG = Math.PI / 180;

/**
 * Horizontal sky direction vector. Convention: +X = East, +Z = North, +Y = Up.
 * azimuth measured from true North (0=N, 90=E, 180=S, 270=W).
 */
export function skyPos(azDeg: number, elDeg: number, radius: number, out?: Vec3): Vec3 {
  const az = azDeg * DEG;
  const el = elDeg * DEG;
  const ce = Math.cos(el);
  const v: Vec3 = out ?? { x: 0, y: 0, z: 0 };
  v.x = radius * ce * Math.sin(az);
  v.y = radius * Math.sin(el);
  v.z = radius * ce * Math.cos(az);
  return v;
}

export function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Produce a stable "up" vector perpendicular to `dir`: when looking near the
 * pole (up), fall back to a horizontal up so the camera never rolls.
 */
export function stableUp(dir: Vec3): Vec3 {
  const y = dir.y;
  if (Math.abs(y) < 0.88) return { x: 0, y: 1, z: 0 };
  // Near zenith: bias up toward North (+Z) so screen-up ~ North.
  const w = (1 - Math.abs(y)) / 0.12; // 0 at 0.88, 1 at 1.0
  const hx = 0;
  const hz = y > 0 ? -1 : 1;
  const u = { x: hx * (1 - w) * (1 - w), y: Math.abs(y), z: hz * (1 - w) };
  return normalize(u);
}

/** In 3D, coordinates (radial distance from origin) — identity here, kept for intent. */
export function asVec3(v: Vec3): Vec3 {
  return v;
}
