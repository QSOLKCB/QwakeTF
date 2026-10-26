// Small vector / matrix helpers. Quake coordinate system: X forward, Y left, Z up.
export const v3 = {
  create: (x = 0, y = 0, z = 0) => [x, y, z],
  copy: (a) => [a[0], a[1], a[2]],
  set: (o, x, y, z) => { o[0] = x; o[1] = y; o[2] = z; return o; },
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  ma: (a, s, b) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s], // a + s*b
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  len2: (a) => a[0] * a[0] + a[1] * a[1] + a[2] * a[2],
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  dist2: (a, b) => { const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2]; return x * x + y * y + z * z; },
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]); return l > 1e-8 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  neg: (a) => [-a[0], -a[1], -a[2]],
  eq: (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2],
};

export const DEG = Math.PI / 180;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randInt = (n) => Math.floor(Math.random() * n);
export const crand = () => Math.random() * 2 - 1;
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function angleMod(a) { a = a % 360; if (a < 0) a += 360; return a; }
export function angleDiff(a, b) { let d = (a - b) % 360; if (d > 180) d -= 360; if (d < -180) d += 360; return d; }

// angles = [pitch, yaw, roll] in degrees (Quake convention: positive pitch looks down)
export function angleVectors(angles) {
  const p = angles[0] * DEG, y = angles[1] * DEG, r = angles[2] * DEG;
  const sp = Math.sin(p), cp = Math.cos(p), sy = Math.sin(y), cy = Math.cos(y), sr = Math.sin(r), cr = Math.cos(r);
  const forward = [cp * cy, cp * sy, -sp];
  const right = [-sr * sp * cy + cr * sy, -sr * sp * sy - cr * cy, -sr * cp];
  const up = [cr * sp * cy + sr * sy, cr * sp * sy - sr * cy, cr * cp];
  return { forward, right, up };
}

export function vecToAngles(v) {
  const yaw = Math.atan2(v[1], v[0]) / DEG;
  const f = Math.hypot(v[0], v[1]);
  const pitch = -Math.atan2(v[2], f) / DEG;
  return [pitch, angleMod(yaw), 0];
}

// ---- 4x4 matrices, column-major Float32Array ----
export const m4 = {
  identity() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  perspective(fovyDeg, aspect, near, far) {
    const f = 1 / Math.tan(fovyDeg * DEG / 2);
    const m = new Float32Array(16);
    m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far); m[11] = -1; m[14] = 2 * far * near / (near - far);
    return m;
  },
  ortho(l, r, b, t, n, f) {
    const m = new Float32Array(16);
    m[0] = 2 / (r - l); m[5] = 2 / (t - b); m[10] = -2 / (f - n); m[12] = -(r + l) / (r - l); m[13] = -(t + b) / (t - b); m[14] = -(f + n) / (f - n); m[15] = 1;
    return m;
  },
  // View matrix from quake origin+angles: converts quake world (x fwd, y left, z up) into GL (x right, y up, -z fwd)
  view(origin, angles) {
    const { forward, right, up } = angleVectors(angles);
    const m = new Float32Array(16);
    // rows: right, up, -forward  (GL camera basis)
    m[0] = right[0]; m[4] = right[1]; m[8] = right[2];
    m[1] = up[0]; m[5] = up[1]; m[9] = up[2];
    m[2] = -forward[0]; m[6] = -forward[1]; m[10] = -forward[2];
    m[12] = -(right[0] * origin[0] + right[1] * origin[1] + right[2] * origin[2]);
    m[13] = -(up[0] * origin[0] + up[1] * origin[1] + up[2] * origin[2]);
    m[14] = (forward[0] * origin[0] + forward[1] * origin[1] + forward[2] * origin[2]);
    m[15] = 1;
    return m;
  },
  // Model matrix from origin + angles (pitch,yaw,roll) + optional uniform scale
  model(origin, angles, scale = 1) {
    const { forward, right, up } = angleVectors(angles || [0, 0, 0]);
    const m = new Float32Array(16);
    // columns: forward(x axis), -right (y axis = left), up (z axis)
    m[0] = forward[0] * scale; m[1] = forward[1] * scale; m[2] = forward[2] * scale;
    m[4] = -right[0] * scale; m[5] = -right[1] * scale; m[6] = -right[2] * scale;
    m[8] = up[0] * scale; m[9] = up[1] * scale; m[10] = up[2] * scale;
    m[12] = origin[0]; m[13] = origin[1]; m[14] = origin[2]; m[15] = 1;
    return m;
  },
  transformPoint(m, p) {
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  },
};
