#!/usr/bin/env node
// claude-image-theme: turn one picture into a Claude theme mod.
//
//   node bin/generate.mjs <image> [--name my-theme] [--out <folder>] [options]
//
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

import { hex } from '../lib/color.mjs'
import { decode, grid, kmeans } from '../lib/image.mjs'
import { analyse, buildDefinition, report } from '../lib/theme.mjs'
import { buildScene, fillScene } from '../lib/scene.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REPO = 'https://github.com/ddtam2604work/claude-theme-from-image'

const HELP = `claude-image-theme — make a Claude theme mod from a picture

Usage:
  node bin/generate.mjs <image.jpg|png> [options]

Options:
  --name <slug>        theme name (default: from the file name)
  --label <text>       name shown in the app (default: from --name)
  --out <folder>       parent folder for the mod (default: ~/.claude/image-themes)
  --lang en|vi         language of the settings pane (default: en)
  --mode both|dark|light  which color modes to build (default: both)
  --detail <n>         picture resolution, fine columns 160..480 (default: 320)
  --colors <n>         colors in the redrawn picture, 32..200 (default: 120)
  --stars <n>          bright points kept as twinkling stars (default: 120)

Starting values for the settings pane (all can be changed live in the app):
  --veil <0..0.95>     darkness of the veil over the picture (default: 0.35)
  --veil-light <0..0.95>  light-mode veil (default: 0.65)
  --glass <0..1>       opacity of the frosted panels (default: 0.5)
  --blur <0..64>       blur behind panels (default: 20)
  --softness sharp|medium|soft  picture detail (default: sharp)
  --still              start with no motion
  -h, --help           this help
`

function parseArgs(argv) {
  const o = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-h' || a === '--help') o.help = true
    else if (a === '--still') o.still = true
    else if (a.startsWith('--')) o[a.slice(2)] = argv[++i]
    else o._.push(a)
  }
  return o
}

const slug = s =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'image'

const num = (v, d, lo, hi) => {
  const n = v === undefined ? d : Number(v)
  if (!Number.isFinite(n)) throw new Error(`Not a number: ${v}`)
  return Math.min(hi, Math.max(lo, n))
}

const oneOf = (v, allowed, d, flag) => {
  if (v === undefined) return d
  if (!allowed.includes(v)) throw new Error(`${flag} must be one of: ${allowed.join(', ')}`)
  return v
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || args._.length !== 1) {
    process.stdout.write(HELP)
    process.exit(args.help ? 0 : 1)
  }
  const image = resolve(args._[0])
  if (!existsSync(image)) throw new Error(`Image not found: ${image}`)

  const name = slug(args.name ?? basename(image, extname(image)))
  const modName = `image-theme-${name}`
  const label = (args.label ?? name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).slice(0, 64)
  const outParent = resolve(args.out ?? join(homedir(), '.claude', 'image-themes'))
  const modDir = join(outParent, modName)
  const mode = oneOf(args.mode, ['both', 'dark', 'light'], 'both', '--mode')
  const lang = oneOf(args.lang, ['en', 'vi'], 'en', '--lang')

  const defaults = {
    enabled: true,
    veil: num(args.veil, 0.35, 0, 0.95),
    veilLight: num(args['veil-light'], 0.65, 0, 0.95),
    glass: num(args.glass, 0.5, 0, 1),
    blur: num(args.blur, 20, 0, 64),
    softness: oneOf(args.softness, ['sharp', 'medium', 'soft'], 'sharp', '--softness'),
    accent: 'auto',
    mode: mode === 'both' ? 'auto' : mode,
    stars: !args.still,
    drift: false,
    glow: true,
  }

  console.log(`Reading ${image} ...`)
  const img = decode(image)
  console.log(`  ${img.width}x${img.height}`)

  // 1. Palette and colors
  const palette = kmeans(grid(img, 96, Math.max(8, Math.round((96 * img.height) / img.width))), 12)
  const a = analyse(palette)
  const only = mode === 'both' ? undefined : mode
  const { definition, problems, blocking } = buildDefinition(label, a, { only })

  // 2. Scene
  const darkBg = definition.dark?.gray.anchors['surface-0'] ?? '#0b0d12'
  const lightBg = definition.light?.gray.anchors['surface-0'] ?? '#f2f3f5'
  const scene = buildScene(img, {
    width: Math.round(num(args.detail, 320, 160, 480)),
    colors: Math.round(num(args.colors, 120, 32, 200)),
    starCount: Math.round(num(args.stars, 120, 0, 400)),
  })

  // 3. Write the mod
  const fill = s => s.replaceAll('__MOD__', modName)
  for (const d of ['hooks', 'types', 'tests', '.claude-plugin']) mkdirSync(join(modDir, d), { recursive: true })
  writeFileSync(join(modDir, 'tests', 'settings.test.tsx'), fill(readFileSync(join(ROOT, 'template', 'tests', 'settings.test.tsx'), 'utf8')))
  for (const f of ['make-colors.js', 'make-colors.d.ts']) {
    copyFileSync(join(ROOT, 'template', 'hooks', f), join(modDir, 'hooks', f))
  }
  writeFileSync(join(modDir, 'hooks', 'register.tsx'), fill(readFileSync(join(ROOT, 'template', 'hooks', 'register.tsx'), 'utf8')))
  writeFileSync(join(modDir, 'types', 'index.d.ts'), fill(readFileSync(join(ROOT, 'template', 'types', 'index.d.ts'), 'utf8')))
  writeFileSync(join(modDir, 'hooks', 'hooks.json'), JSON.stringify({ modules: ['./register.tsx'] }, null, 2) + '\n')
  writeFileSync(
    join(modDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify(
      {
        name: modName,
        version: '0.2.0',
        description: `Theme "${label}" generated from a picture: palette, colors, a vector backdrop and a settings pane`,
        license: 'MIT',
        types: './types/index.d.ts',
      },
      null,
      2,
    ) + '\n',
  )

  const pic = '`' + basename(image) + '`'
  const cmd = '`/' + modName + '`'
  const on = '`/' + modName + ' on`'
  const off = '`/' + modName + ' off`'
  writeFileSync(
    join(modDir, 'README.md'),
    [
      `# ${label}`,
      '',
      `A Claude theme generated by [claude-image-theme](${REPO}) from the picture ${pic}: its palette colors the surfaces, text, borders and buttons, and the picture, redrawn as vector art under a readability veil, is the backdrop. It draws in the Claude desktop and mobile apps.`,
      '',
      `- ${cmd} opens the settings pane: veil, glass, blur, picture detail, accent color, mode, stars, drift, bright borders.`,
      `- ${off} restores the default look, ${on} applies it again.`,
      '- Open `preview.svg` to see the backdrop.',
      '',
      `Theme Claude được tạo bởi claude-image-theme từ ảnh ${pic}. Gõ ${cmd} để mở bảng điều chỉnh (lớp phủ, kính mờ, độ nhòe, độ nét ảnh, màu nhấn, chế độ, sao, viền sáng); ${off} để tắt, ${on} để bật lại.`,
      '',
    ].join('\n'),
  )

  const swatches = palette.map(c => `${hex(c.rgb)} ${(c.weight * 100).toFixed(0)}%`).join(', ')
  const generated = `// Generated by claude-image-theme from ${JSON.stringify(basename(image))}. Re-run the generator rather than editing by hand.
// Palette (k-means, by share of the picture): ${swatches}
import type { Settings } from '../types'
import type { makeColors } from './make-colors.js'

export const SCENE_NAME = ${JSON.stringify(name.slice(0, 64))}
export const COMMAND = ${JSON.stringify(modName)}
export const LANG: 'en' | 'vi' = ${JSON.stringify(lang)}
export const ALT = ${JSON.stringify(`Backdrop redrawn from the picture ${basename(image)}`)}
export const DARK_BG = ${JSON.stringify(darkBg)}
export const LIGHT_BG = ${JSON.stringify(lightBg)}

export const DEFAULTS: Settings = ${JSON.stringify(defaults, null, 2)}

export const ACCENTS: readonly string[] = ${JSON.stringify(a.accentChoices)}

export const DEFINITION: Parameters<typeof makeColors>[0] = ${JSON.stringify(definition, null, 2)}

export const SCENE_TEMPLATE = ${JSON.stringify(scene.template)}
`
  writeFileSync(join(modDir, 'hooks', 'look.generated.ts'), generated)
  writeFileSync(join(modDir, 'preview.svg'), fillScene(scene.template, defaults, darkBg, lightBg))

  console.log(`\nPalette: ${swatches}`)
  console.log(`Accent hue ${a.accentHue.toFixed(0)}°, base hue ${a.baseHue.toFixed(0)}°, accent choices ${a.accentChoices.join(' ')}`)
  for (const line of report(definition)) console.log('  ' + line)
  console.log(`Scene: ${scene.width}x${scene.height} grid, ${scene.leaves} cells, ${scene.template.length} characters`)
  if (blocking?.length) {
    console.log('\nWARNING: Desktop may refuse these colors:')
    for (const p of blocking) console.log('  ' + p)
  } else if (problems.length) {
    console.log(`(${problems.length} minor contrast notes; Desktop still paints the theme)`)
  }
  console.log(`\nMod written to: ${modDir}`)
  console.log(`Preview the backdrop: ${join(modDir, 'preview.svg')}`)
  console.log(`\nTry it:   claude --plugin-dir "${modDir}"`)
}

try {
  main()
} catch (err) {
  console.error(`Error: ${err.message}`)
  process.exit(1)
}
