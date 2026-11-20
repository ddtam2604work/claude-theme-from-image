// Paints samples/nebula.png: an original, procedurally generated space picture
// (no third-party artwork) used for the example mod in this repository.
import { writeFileSync, mkdirSync } from 'node:fs'
import { PNG } from 'pngjs'

const W = 1600, H = 900
const png = new PNG({ width: W, height: H })

// deterministic pseudo-random
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)

// value noise
const G = 64
const lattice = Array.from({ length: (G + 1) * (G + 1) }, rnd)
const at = (x, y) => lattice[(y % G) * (G + 1) + (x % G)]
const smooth = t => t * t * (3 - 2 * t)
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi)
  const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1)
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf
}
const fbm = (x, y) => {
  let v = 0, amp = 0.5, f = 1
  for (let o = 0; o < 5; o++) { v += amp * noise(x * f, y * f); amp *= 0.5; f *= 2 }
  return v
}

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H
    // a diagonal band of nebula, violet into magenta into teal
    const band = Math.exp(-(((u - 0.3 - v * 0.55) / 0.22) ** 2))
    const n = fbm(u * 6 + 3, v * 4)
    const gas = Math.max(0, band * (n * 1.6 - 0.35))
    const r = 8 + gas * (180 + 70 * (1 - v)) + 10 * v
    const g = 6 + gas * (40 + 120 * v * u)
    const b = 22 + gas * 210 + 30 * (1 - u)
    const i = (y * W + x) * 4
    png.data[i] = Math.min(255, r)
    png.data[i + 1] = Math.min(255, g)
    png.data[i + 2] = Math.min(255, b)
    png.data[i + 3] = 255
  }
}

// stars
for (let s = 0; s < 900; s++) {
  const x = Math.floor(rnd() * W), y = Math.floor(rnd() * H)
  const big = rnd() > 0.93
  const rad = big ? 2 : 1
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      const xx = x + dx, yy = y + dy
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
      const fall = Math.max(0, 1 - Math.hypot(dx, dy) / (rad + 0.5))
      const i = (yy * W + xx) * 4
      for (let c = 0; c < 3; c++) png.data[i + c] = Math.min(255, png.data[i + c] + 255 * fall * (big ? 1 : 0.8))
    }
  }
}

mkdirSync(new URL('../samples/', import.meta.url), { recursive: true })
writeFileSync(new URL('../samples/nebula.png', import.meta.url), PNG.sync.write(png))
console.log('samples/nebula.png written')
