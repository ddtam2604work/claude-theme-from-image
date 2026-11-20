// Decode an image file and reduce it: a small grid of averaged cells,
// bright "star" points, and a k-means palette.
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import jpeg from 'jpeg-js'
import { PNG } from 'pngjs'

import { rgbToHsl } from './color.mjs'

export function decode(path) {
  const buf = readFileSync(path)
  const ext = extname(path).toLowerCase()
  const isPng = buf[0] === 0x89 && buf[1] === 0x50
  if (isPng || ext === '.png') {
    const png = PNG.sync.read(buf)
    return { width: png.width, height: png.height, data: png.data }
  }
  if (ext === '.jpg' || ext === '.jpeg' || (buf[0] === 0xff && buf[1] === 0xd8)) {
    const img = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 2048, maxResolutionInMP: 200 })
    return { width: img.width, height: img.height, data: img.data }
  }
  throw new Error(`Unsupported image format: ${path} (use .jpg, .jpeg or .png)`)
}

/** Area-average the image down to cols x rows cells. Returns [[r,g,b], ...] row-major. */
export function grid(img, cols, rows) {
  const { width, height, data } = img
  const sums = new Float64Array(cols * rows * 4)
  for (let y = 0; y < height; y++) {
    const cy = Math.min(rows - 1, Math.floor((y * rows) / height))
    for (let x = 0; x < width; x++) {
      const cx = Math.min(cols - 1, Math.floor((x * cols) / width))
      const i = (y * width + x) * 4
      const c = (cy * cols + cx) * 4
      sums[c] += data[i]
      sums[c + 1] += data[i + 1]
      sums[c + 2] += data[i + 2]
      sums[c + 3] += 1
    }
  }
  const out = []
  for (let c = 0; c < cols * rows; c++) {
    const n = sums[c * 4 + 3] || 1
    out.push([sums[c * 4] / n, sums[c * 4 + 1] / n, sums[c * 4 + 2] / n])
  }
  return out
}

/**
 * Bright points that stand out from their neighbourhood: stars, sparks, lamps.
 * Coordinates are fractions of the image (0..1).
 */
export function stars(img, max = 140) {
  const { width, height, data } = img
  const step = Math.max(1, Math.floor(Math.min(width, height) / 540))
  const lum = (x, y) => {
    const i = (y * width + x) * 4
    return 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
  }
  const found = []
  const r = step * 3
  for (let y = r; y < height - r; y += step) {
    for (let x = r; x < width - r; x += step) {
      const v = lum(x, y)
      if (v < 150) continue
      const ring = (lum(x - r, y) + lum(x + r, y) + lum(x, y - r) + lum(x, y + r)) / 4
      if (v - ring < 60) continue
      const i = (y * width + x) * 4
      found.push({ x: x / width, y: y / height, v: v - ring, color: [data[i], data[i + 1], data[i + 2]] })
    }
  }
  found.sort((a, b) => b.v - a.v)
  // keep them apart from each other
  const kept = []
  for (const s of found) {
    if (kept.length >= max * 1.6) break
    if (kept.every(k => Math.hypot(k.x - s.x, (k.y - s.y) * (height / width)) > 0.012)) kept.push(s)
  }
  // Drop tight clusters: they are usually text or a logo, not stars.
  const aspect = height / width
  return kept.filter(s => kept.filter(k => k !== s && Math.hypot(k.x - s.x, (k.y - s.y) * aspect) < 0.04).length < 3)
}

/** Weighted k-means in RGB. Returns clusters sorted by weight (descending). */
export function kmeans(points, k, iterations = 24) {
  // k-means++ style seeding, deterministic: farthest point each time
  const centers = [points.reduce((a, p) => a.map((v, i) => v + p[i] / points.length), [0, 0, 0])]
  while (centers.length < k) {
    let best = null, bestD = -1
    for (const p of points) {
      const d = Math.min(...centers.map(c => dist2(c, p)))
      if (d > bestD) { bestD = d; best = p }
    }
    centers.push([...best])
  }
  let assign = new Array(points.length).fill(0)
  for (let it = 0; it < iterations; it++) {
    assign = points.map(p => {
      let bi = 0, bd = Infinity
      centers.forEach((c, i) => { const d = dist2(c, p); if (d < bd) { bd = d; bi = i } })
      return bi
    })
    const sums = centers.map(() => [0, 0, 0, 0])
    points.forEach((p, i) => { const s = sums[assign[i]]; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++ })
    sums.forEach((s, i) => { if (s[3]) centers[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]] })
  }
  const counts = centers.map(() => 0)
  assign.forEach(a => counts[a]++)
  return centers
    .map((rgb, i) => ({ rgb, weight: counts[i] / points.length, hsl: rgbToHsl(rgb) }))
    .filter(c => c.weight > 0)
    .sort((x, y) => y.weight - x.weight)
}

function dist2(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
}
