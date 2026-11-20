// From an image's palette to a makeColors() definition that Desktop will paint.
import { clamp, contrast, hsl, hueDistance, mixHue } from './color.mjs'
import { makeColors } from '../template/hooks/make-colors.js'

/** Circular mean of hues, weighted. */
function meanHue(items) {
  let x = 0, y = 0
  for (const { h, w } of items) {
    x += Math.cos((h * Math.PI) / 180) * w
    y += Math.sin((h * Math.PI) / 180) * w
  }
  if (Math.abs(x) + Math.abs(y) < 1e-9) return 220
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/**
 * Read the palette: which hue carries the picture (base), which colors pop
 * (accent, pro), and how colorful it is overall.
 */
export function analyse(palette) {
  const baseHue = meanHue(palette.map(c => ({ h: c.hsl[0], w: c.weight * (0.05 + c.hsl[1]) })))
  const baseSat = clamp(
    palette.reduce((a, c) => a + c.hsl[1] * c.weight, 0),
    0.06,
    0.42,
  )
  const brightness = palette.reduce((a, c) => a + c.hsl[2] * c.weight, 0)

  const score = c => {
    const [, s, l] = c.hsl
    return s * (1 - Math.min(1, Math.abs(l - 0.55) * 1.6)) * (0.25 + Math.sqrt(c.weight))
  }
  const vivid = [...palette].sort((a, b) => score(b) - score(a))
  const accent = vivid[0]
  const pro = vivid.find(c => c !== accent && hueDistance(c.hsl[0], accent.hsl[0]) >= 35 && c.hsl[1] > 0.25)

  const accentHue = accent && accent.hsl[1] > 0.15 ? accent.hsl[0] : baseHue
  const accentSat = accent ? clamp(accent.hsl[1], 0.5, 0.9) : 0.6
  const proHue = pro ? pro.hsl[0] : (accentHue + 55) % 360

  // Accent choices for the settings pane: the picture's vivid colors, distinct hues.
  const accents = []
  for (const c of vivid) {
    if (c.hsl[1] < 0.25 || accents.length >= 6) continue
    if (accents.some(h => hueDistance(h, c.hsl[0]) < 18)) continue
    accents.push(c.hsl[0])
  }
  const accentChoices = accents.map(h => {
    const c = vivid.find(v => v.hsl[0] === h)
    return hsl(h, clamp(c.hsl[1], 0.5, 0.9), 0.58)
  })

  return { baseHue, baseSat, brightness, accentHue, accentSat, proHue, accentChoices }
}

/** Build the definition for makeColors, then nudge it until Desktop paints it. */
export function buildDefinition(label, a, { only } = {}) {
  const { baseHue, baseSat, accentHue, accentSat, proHue } = a
  const s = accentSat

  // Status colors keep their meaning (red / green / amber) but lean a little toward the picture.
  const roles = {
    accent: hsl(accentHue, s, 0.56),
    pro: hsl(proHue, clamp(s, 0.45, 0.8), 0.62),
    danger: hsl(mixHue(4, accentHue, 0.08), clamp(s, 0.55, 0.8), 0.55),
    success: hsl(mixHue(142, accentHue, 0.12), clamp(s, 0.45, 0.7), 0.45),
    warning: hsl(mixHue(38, accentHue, 0.06), clamp(s, 0.6, 0.85), 0.5),
  }

  let d = { s3: 0.15, muted: 0.68 }
  let l = { muted: 0.38 }
  const gs = baseSat

  for (let attempt = 0; attempt < 12; attempt++) {
    const dark = {
      gray: {
        anchors: {
          'surface-0': hsl(baseHue, gs * 0.7, 0.065),
          'surface-1': hsl(baseHue, gs * 0.7, 0.095),
          'surface-2': hsl(baseHue, gs * 0.65, 0.12),
          'surface-3': hsl(baseHue, gs * 0.6, d.s3),
          'text-primary': hsl(baseHue, 0.22, 0.95),
          'text-secondary': hsl(baseHue, 0.16, 0.82),
          'text-muted': hsl(baseHue, 0.12, d.muted),
        },
      },
    }
    const light = {
      gray: {
        anchors: {
          'surface-0': hsl(baseHue, gs * 0.8, 0.935),
          'surface-1': hsl(baseHue, gs * 0.8, 0.96),
          'surface-2': hsl(baseHue, gs * 0.7, 0.982),
          'surface-3': hsl(baseHue, gs * 0.7, 0.982),
          'text-primary': hsl(baseHue, 0.35, 0.11),
          'text-secondary': hsl(baseHue, 0.25, 0.26),
          'text-muted': hsl(baseHue, 0.18, l.muted),
        },
      },
    }
    const definition = { label, roles }
    if (only !== 'light') definition.dark = dark
    if (only !== 'dark') definition.light = light
    if (only) definition.only = only

    const { problems } = makeColors(definition)
    const blocking = problems.filter(p => p.startsWith("Desktop won't paint"))
    if (blocking.length === 0) return { definition, problems }

    // Usual cause: surface-3 too light for muted text, or muted too dim. Nudge and retry.
    d = { s3: Math.max(0.11, d.s3 - 0.01), muted: Math.min(0.8, d.muted + 0.02) }
    l = { muted: Math.max(0.24, l.muted - 0.02) }
    if (attempt === 11) return { definition, problems, blocking }
  }
}

/** Contrast summary for the CLI report. */
export function report(definition) {
  const lines = []
  for (const mode of ['dark', 'light']) {
    const m = definition[mode]
    if (!m) continue
    const A = m.gray.anchors
    lines.push(
      `${mode.padEnd(5)} text-primary on surface-0 ${contrast(A['text-primary'], A['surface-0']).toFixed(1)}:1, ` +
        `text-muted on surface-0 ${contrast(A['text-muted'], A['surface-0']).toFixed(1)}:1`,
    )
  }
  return lines
}
