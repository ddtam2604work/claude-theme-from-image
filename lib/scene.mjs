// Redraw a picture as pure-vector SVG: a blurred color mosaic, a veil that
// darkens (dark mode) or lightens (light mode) it so text stays readable,
// and the picture's own bright points as slowly twinkling stars.
import { hex, mixHue, rgbToHsl, hslToRgb } from './color.mjs'
import { grid, kmeans, stars as findStars } from './image.mjs'

export const MAX_SCENE = 131072

/**
 * @param img decoded image
 * @param opts { cols, veilDark, veilLight, darkColor, lightColor, motion }
 */
export function buildScene(img, opts) {
  let cols = opts.cols
  for (;;) {
    const svg = render(img, { ...opts, cols })
    if (svg.length <= MAX_SCENE - 2000 || cols <= 24) return { svg, cols }
    cols = Math.floor(cols * 0.85)
  }
}

function render(img, { cols, veilDark, veilLight, darkColor, lightColor, motion, starCount }) {
  const rows = Math.max(8, Math.round((cols * img.height) / img.width))
  const cells = grid(img, cols, rows)

  // Quantize the mosaic so cells can share one <path> per color.
  const palette = kmeans(cells, 40, 12)
  const centers = palette.map(c => c.rgb)
  const nearest = rgb => {
    let bi = 0, bd = Infinity
    centers.forEach((c, i) => {
      const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2
      if (d < bd) { bd = d; bi = i }
    })
    return bi
  }
  const idx = cells.map(nearest)

  // Merge horizontal runs of one color into one rectangle.
  const paths = centers.map(() => [])
  for (let y = 0; y < rows; y++) {
    let x = 0
    while (x < cols) {
      const c = idx[y * cols + x]
      let run = 1
      while (x + run < cols && idx[y * cols + x + run] === c) run++
      paths[c].push(`M${x} ${y}h${run}v1h-${run}z`)
      x += run
    }
  }

  const avg = cells.reduce((a, c) => a.map((v, i) => v + c[i] / cells.length), [0, 0, 0])
  const mosaic = paths
    .map((p, i) => (p.length ? `<path fill="${hex(centers[i])}" d="${p.join('')}"/>` : ''))
    .join('')

  // Stars: tinted toward white, three twinkle groups out of phase.
  const pts = findStars(img, starCount).slice(0, starCount)
  const starMarkup = [[], [], []]
  pts.forEach((s, i) => {
    const [h, sat] = rgbToHsl(s.color)
    const c = hex(hslToRgb([h, Math.min(sat, 0.6), 0.86]))
    const k = Math.min(1, s.v / 170)
    const r = ((0.035 + k * k * 0.1) * (cols / 72)).toFixed(3)
    const op = (0.45 + k * 0.55).toFixed(2)
    starMarkup[i % 3].push(`<circle cx="${(s.x * cols).toFixed(2)}" cy="${(s.y * rows).toFixed(2)}" r="${r}" fill="${c}" opacity="${op}"/>`)
  })

  const css = [
    `.veil{fill:${darkColor};opacity:${veilDark}}`,
    `@media (prefers-color-scheme: light){.veil{fill:${lightColor};opacity:${veilLight}}.stars{opacity:.35}}`,
    motion
      ? [
          `.drift{transform-box:fill-box;transform-origin:50% 50%;animation:drift 120s ease-in-out infinite alternate}`,
          `@keyframes drift{from{transform:scale(1.04)}to{transform:scale(1.1) translate(-1%,-0.6%)}}`,
          `.t1{animation:tw 7s ease-in-out infinite alternate}`,
          `.t2{animation:tw 11s ease-in-out 2s infinite alternate}`,
          `.t3{animation:tw 15s ease-in-out 5s infinite alternate}`,
          `@keyframes tw{from{opacity:1}to{opacity:.3}}`,
          `@media (prefers-reduced-motion: reduce){.drift,.t1,.t2,.t3{animation:none}}`,
        ].join('')
      : '',
  ].join('')

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols} ${rows}" preserveAspectRatio="xMidYMid slice">` +
    `<style>${css}</style>` +
    `<defs><filter id="soft" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">` +
    `<feGaussianBlur stdDeviation="${(cols / 64).toFixed(2)}"/></filter></defs>` +
    `<!-- ground -->` +
    `<rect x="-2" y="-2" width="${cols + 4}" height="${rows + 4}" fill="${hex(avg)}"/>` +
    `<!-- the picture, redrawn as a blurred mosaic -->` +
    `<g class="drift"><g filter="url(#soft)">${mosaic}</g></g>` +
    `<!-- veil for readable text -->` +
    `<rect class="veil" x="-2" y="-2" width="${cols + 4}" height="${rows + 4}"/>` +
    `<!-- stars from the picture -->` +
    `<g class="stars">` +
    starMarkup.map((list, i) => `<g class="t${i + 1}">${list.join('')}</g>`).join('') +
    `</g></svg>`
  )
}

export { mixHue }
