// Redraw a picture as pure-vector SVG, as close to the photo as the size
// limit allows: an adaptive mosaic (small cells where the picture has
// detail, big ones where it is flat), a veil that keeps text readable, and
// the picture's bright points as twinkling stars.
//
// The scene is a template: the mod fills in @@CSS@@ and @@BLUR@@ from the
// person's settings each time it draws, so the settings pane can change the
// veil, softness and motion live.
import { hex, rgbToHsl, hslToRgb } from './color.mjs'
import { grid, kmeans, stars as findStars } from './image.mjs'

export const MAX_SCENE = 131072
const BUDGET = MAX_SCENE - 9000

/** Softness presets: blur radius in fine-cell units. */
export const SOFTNESS = { sharp: 0.45, medium: 1.4, soft: 3.5 }

/**
 * CSS for the scene from settings. Kept in sync with sceneCss() in the mod's
 * register.tsx (the mod builds it at draw time; this one is for preview.svg).
 */
export function sceneCss(s, darkColor, lightColor) {
  const parts = [
    `.veil{fill:${darkColor};opacity:${s.veil}}`,
    `@media (prefers-color-scheme: light){.veil{fill:${lightColor};opacity:${s.veilLight}}.stars{opacity:.35}}`,
    s.stars ? '' : '.stars{display:none}',
  ]
  if (s.drift) {
    parts.push(
      '.drift{transform-box:fill-box;transform-origin:50% 50%;animation:drift 120s ease-in-out infinite alternate}',
      '@keyframes drift{from{transform:scale(1.02)}to{transform:scale(1.08) translate(-1%,-0.6%)}}',
    )
  }
  if (s.stars) {
    parts.push(
      '.t1{animation:tw 7s ease-in-out infinite alternate}',
      '.t2{animation:tw 11s ease-in-out 2s infinite alternate}',
      '.t3{animation:tw 15s ease-in-out 5s infinite alternate}',
      '@keyframes tw{from{opacity:1}to{opacity:.3}}',
    )
  }
  parts.push('@media (prefers-reduced-motion: reduce){.drift,.t1,.t2,.t3{animation:none}}')
  return parts.join('')
}

export function fillScene(template, s, darkColor, lightColor) {
  return template
    .replace('@@CSS@@', sceneCss(s, darkColor, lightColor))
    .replace('@@BLUR@@', String(SOFTNESS[s.softness] ?? SOFTNESS.sharp))
}

/**
 * @param img decoded image
 * @param opts { width (fine columns), colors, starCount }
 * @returns { template, leaves, width, height }
 */
export function buildScene(img, { width = 320, colors = 120, starCount = 120 } = {}) {
  const W = width
  const H = Math.max(16, Math.round((W * img.height) / img.width))
  const cells = grid(img, W, H)
  const at = (x, y) => cells[y * W + x]

  // Summed tables for fast block mean / variance.
  const S = [0, 1, 2].map(() => new Float64Array((W + 1) * (H + 1)))
  const Q = new Float64Array((W + 1) * (H + 1))
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const c = at(x, y)
      const i = (y + 1) * (W + 1) + (x + 1)
      for (let k = 0; k < 3; k++) S[k][i] = c[k] + S[k][i - 1] + S[k][i - W - 1] - S[k][i - W - 2]
      Q[i] = c[0] * c[0] + c[1] * c[1] + c[2] * c[2] + Q[i - 1] + Q[i - W - 1] - Q[i - W - 2]
    }
  }
  const sum = (T, x, y, w, h) => {
    const a = y * (W + 1) + x, b = (y + h) * (W + 1) + x
    return T[b + w] - T[b] - T[a + w] + T[a]
  }
  const block = (x, y, w, h) => {
    const n = w * h
    const m = [0, 1, 2].map(k => sum(S[k], x, y, w, h) / n)
    const v = sum(Q, x, y, w, h) / n - (m[0] ** 2 + m[1] ** 2 + m[2] ** 2)
    return { m, v: Math.max(0, v) }
  }

  // Quadtree with a variance threshold, searched so the scene fits the budget.
  const ROOT = 8
  const split = threshold => {
    const leaves = []
    const visit = (x, y, w, h) => {
      if (w <= 0 || h <= 0) return
      const b = block(x, y, w, h)
      if ((w > 1 || h > 1) && b.v * Math.sqrt(w * h) > threshold) {
        const w1 = Math.ceil(w / 2), h1 = Math.ceil(h / 2)
        visit(x, y, w1, h1)
        visit(x + w1, y, w - w1, h1)
        visit(x, y + h1, w1, h - h1)
        visit(x + w1, y + h1, w - w1, h - h1)
      } else {
        if (w * h <= 4) leaves.push({ x, y, w, h, c: b.m })
      }
    }
    for (let y = 0; y < H; y += ROOT) for (let x = 0; x < W; x += ROOT) visit(x, y, Math.min(ROOT, W - x), Math.min(ROOT, H - y))
    return leaves
  }

  // Stars first: they take a fixed share of the budget.
  const pts = findStars(img, starCount).slice(0, starCount)
  const starMarkup = [[], [], []]
  pts.forEach((s, i) => {
    const [h, sat] = rgbToHsl(s.color)
    const c = hex(hslToRgb([h, Math.min(sat, 0.6), 0.86]))
    const k = Math.min(1, s.v / 170)
    const r = ((0.035 + k * k * 0.1) * (W / 72)).toFixed(2)
    const op = (0.45 + k * 0.55).toFixed(2)
    starMarkup[i % 3].push(`<circle cx="${(s.x * W).toFixed(1)}" cy="${(s.y * H).toFixed(1)}" r="${r}" fill="${c}" opacity="${op}"/>`)
  })
  const starsSvg = `<g class="stars">${starMarkup.map((l, i) => `<g class="t${i + 1}">${l.join('')}</g>`).join('')}</g>`

  // Smooth base: a coarse grid, heavily blurred, carries the gradients.
  const BW = Math.round(W / 5), BH = Math.max(8, Math.round((BW * img.height) / img.width))
  const baseCells = grid(img, BW, BH)
  const baseCenters = kmeans(baseCells, 64, 10).map(c => c.rgb)
  const nearest = (centers, rgb) => {
    let bi = 0, bd = Infinity
    for (let i = 0; i < centers.length; i++) {
      const c = centers[i]
      const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2
      if (d < bd) { bd = d; bi = i }
    }
    return bi
  }
  const baseIdx = baseCells.map(c => nearest(baseCenters, c))
  const basePaths = baseCenters.map(() => [])
  for (let y = 0; y < BH; y++) {
    let x = 0
    while (x < BW) {
      const c = baseIdx[y * BW + x]
      let run = 1
      while (x + run < BW && baseIdx[y * BW + x + run] === c) run++
      basePaths[c].push(`M${x} ${y}h${run}v1h-${run}z`)
      x += run
    }
  }
  const baseSvg = basePaths.map((p, i) => (p.length ? `<path fill="${hex(baseCenters[i])}" d="${p.join('')}"/>` : '')).join('')
  const sx = (W / BW).toFixed(4), sy = (H / BH).toFixed(4)

  const render = leaves => {
    const centers = kmeans(leaves.map(l => l.c), Math.min(colors, leaves.length), 10).map(c => c.rgb)
    const paths = centers.map(() => [])
    for (const l of leaves) paths[nearest(centers, l.c)].push(`M${l.x} ${l.y}h${l.w}v${l.h}h-${l.w}z`)
    const detail = paths.map((p, i) => (p.length ? `<path fill="${hex(centers[i])}" d="${p.join('')}"/>` : '')).join('')
    const avg = cells.reduce((a, c) => a.map((v, i) => v + c[i] / cells.length), [0, 0, 0])
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
      `<style>@@CSS@@</style>` +
      `<defs>` +
      `<filter id="base" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="0.8"/></filter>` +
      `<filter id="soft" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="@@BLUR@@"/></filter>` +
      `</defs>` +
      `<rect x="-4" y="-4" width="${W + 8}" height="${H + 8}" fill="${hex(avg)}"/>` +
      `<g class="drift">` +
      `<g transform="scale(${sx} ${sy})"><g filter="url(#base)">${baseSvg}</g></g>` +
      `<g filter="url(#soft)">${detail}</g>` +
      `</g>` +
      `<rect class="veil" x="-4" y="-4" width="${W + 8}" height="${H + 8}"/>` +
      starsSvg +
      `</svg>`
    )
  }

  // Estimate leaf count that fits, then binary-search the threshold.
  let lo = 1, hi = 1e7, best = null
  for (let it = 0; it < 22; it++) {
    const mid = Math.sqrt(lo * hi)
    const leaves = split(mid)
    const est = leaves.length * 17.5 + baseSvg.length + starsSvg.length + colors * 30 + 1200
    if (est > BUDGET) lo = mid
    else { hi = mid; best = leaves }
  }
  let template = render(best)
  while (template.length > BUDGET) {
    hi *= 1.15
    best = split(hi)
    template = render(best)
  }
  return { template, leaves: best.length, width: W, height: H }
}
