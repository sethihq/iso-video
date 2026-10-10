/**
 * 4x4 matrix helpers in WebGL's column-major layout (m[col * 4 + row]).
 *
 * Coordinates follow CSS transforms: x right, y down, z toward the viewer,
 * angles in degrees, so a scene transform reads the same as the old
 * `perspective() rotateX() rotateY() rotateZ() scale()` string.
 */

export type Mat4 = Float32Array;

const DEG = Math.PI / 180;

export function identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** Returns a * b, so the result applies b first, then a. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

export function chain(...matrices: Mat4[]): Mat4 {
  return matrices.reduce((acc, m) => multiply(acc, m), identity());
}

export function translate(x: number, y: number, z: number): Mat4 {
  const m = identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

export function scale(sx: number, sy: number = sx): Mat4 {
  const m = identity();
  m[0] = sx;
  m[5] = sy;
  return m;
}

export function rotateX(deg: number): Mat4 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  const m = identity();
  m[5] = c;
  m[9] = -s;
  m[6] = s;
  m[10] = c;
  return m;
}

export function rotateY(deg: number): Mat4 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  const m = identity();
  m[0] = c;
  m[8] = s;
  m[2] = -s;
  m[10] = c;
  return m;
}

export function rotateZ(deg: number): Mat4 {
  const c = Math.cos(deg * DEG);
  const s = Math.sin(deg * DEG);
  const m = identity();
  m[0] = c;
  m[4] = -s;
  m[1] = s;
  m[5] = c;
  return m;
}

/** CSS `perspective(d)`: w = 1 - z / d. */
export function perspective(distance: number): Mat4 {
  const m = identity();
  m[11] = -1 / distance;
  return m;
}

/** Maps a frame in reference units (origin at the center, y down) to clip space. */
export function frameToClip(width: number, height: number): Mat4 {
  const m = identity();
  m[0] = 2 / width;
  m[5] = -2 / height;
  return m;
}

/** Projects a point and returns its screen position and w. */
export function project(m: Mat4, x: number, y: number, z = 0): [number, number, number] {
  const px = m[0] * x + m[4] * y + m[8] * z + m[12];
  const py = m[1] * x + m[5] * y + m[9] * z + m[13];
  const pw = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [px / pw, py / pw, pw];
}
