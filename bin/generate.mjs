#!/usr/bin/env node
// claude-image-theme: turn one picture into a Claude theme mod.
//
//   node bin/generate.mjs <image> [--name my-theme] [--out <folder>] [options]
//
import { copyFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

import { hex } from '../lib/color.mjs'
import { decode, grid, kmeans } from '../lib/image.mjs'
import { analyse, buildDefinition, report } from '../lib/theme.mjs'
import { buildScene } from '../lib/scene.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const HELP = `claude-image-theme — make a Claude theme mod from a picture

Usage:
  node bin/generate.mjs <image.jpg|png> [options]

Options:
  --name <slug>       theme name (default: from the file name)
  --label <text>      name shown in the app (default: from --name)
  --out <folder>      parent folder for the mod (default: ~/.claude/image-themes)
  --mode <m>          both | dark | light   (default: both)
  --veil <0..1>       darkness of the dark-mode veil over the picture (default: 0.45)
  --veil-light <0..1> lightness of the light-mode veil (default: 0.7)
  --glass <0..1>      opacity of the frosted panels over the picture (default: 0.55)
  --blur <0..64>      blur behind panels, in points (default: 18)
  --detail <n>        mosaic columns, 24..120 (default: 96)
  --stars <n>         bright points kept from the picture (default: 120)
  --still             no motion (no drift, no twinkle)
  -h, --help          this help
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
  const mode = args.mode ?? 'both'
  if (!['both', 'dark', 'light'].includes(mode)) throw new Error('--mode must be both, dark or light')

  console.log(`Reading ${image} ...`)
  const img = decode(image)
  console.log(`  ${img.width}x${img.height}`)

  // 1. Palette
  const palette = kmeans(grid(img, 96, Math.max(8, Math.round((96 * img.height) / img.width))), 8)
  const a = analyse(palette)
  const only = mode === 'both' ? undefined : mode
  const { definition, problems, blocking } = buildDefinition(label, a, { only })

  // 2. Scene
  const darkBg = definition.dark?.gray.anchors['surface-0'] ?? '#0b0d12'
  const lightBg = definition.light?.gray.anchors['surface-0'] ?? '#f2f3f5'
  const { svg, cols } = buildScene(img, {
    cols: Math.round(num(args.detail, 96, 24, 120)),
    veilDark: num(args.veil, 0.45, 0, 1),
    veilLight: num(args['veil-light'], 0.7, 0, 1),
    darkColor: darkBg,
    lightColor: lightBg,
    motion: !args.still,
    starCount: Math.round(num(args.stars, 120, 0, 400)),
  })

  const glass = {
    blur: num(args.blur, 18, 0, 64),
    opacity: num(args.glass, 0.55, 0, 1),
  }

  // 3. Write the mod
  mkdirSync(join(modDir, 'hooks'), { recursive: true })
  mkdirSync(join(modDir, '.claude-plugin'), { recursive: true })
  for (const f of ['register.tsx', 'make-colors.js', 'make-colors.d.ts']) {
    copyFileSync(join(ROOT, 'template', 'hooks', f), join(modDir, 'hooks', f))
  }
  writeFileSync(join(modDir, 'hooks', 'hooks.json'), JSON.stringify({ modules: ['./register.tsx'] }, null, 2) + '\n')
  writeFileSync(
    join(modDir, '.claude-plugin', 'plugin.json'),
    JSON.stringify(
      {
        name: modName,
        version: '0.1.0',
        license: 'MIT',
        description: `Theme "${label}" generated from a picture: palette, colors and a vector backdrop`,
      },
      null,
      2,
    ) + '\n',
  )

  const pic = '`' + basename(image) + '`'
  const on = '`/' + modName + ' on`'
  const off = '`/' + modName + ' off`'
  writeFileSync(
    join(modDir, 'README.md'),
    [
      `# ${label}`,
      '',
      `A Claude theme generated by [claude-image-theme](https://github.com/ddtam2604work/claude-theme-from-image) from the picture ${pic}: its palette colors the surfaces, text, borders and buttons, and a vector redraw of the picture under a readability veil is the backdrop. It draws in the Claude desktop and mobile apps.`,
      '',
      `- ${off} restores the default look, ${on} applies it again.`,
      '- Open `preview.svg` to see the backdrop.',
      '',
      `Theme Claude được tạo bởi claude-image-theme từ ảnh ${pic}: bảng màu của ảnh tô nền, chữ, viền và nút; ảnh được vẽ lại bằng vector, có lớp phủ, làm hình nền. Gõ ${off} để tắt, ${on} để bật lại.`,
      '',
    ].join('\n'),
  )

  const swatches = palette.map(c => `${hex(c.rgb)} ${(c.weight * 100).toFixed(0)}%`).join(', ')
  const generated = `// Generated by claude-image-theme from ${JSON.stringify(basename(image))}. Re-run the generator rather than editing by hand.
// Palette (k-means, by share of the picture): ${swatches}
import type { ThemeBackdropGlass } from 'claude-code'

import type { makeColors } from './make-colors.js'

export const SCENE_NAME = ${JSON.stringify(name.slice(0, 64))}
export const COMMAND = ${JSON.stringify(modName)}
export const ALT = ${JSON.stringify(`Backdrop redrawn from the picture ${basename(image)}`)}

export const DEFINITION: Parameters<typeof makeColors>[0] = ${JSON.stringify(definition, null, 2)}

export const GLASS: ThemeBackdropGlass = ${JSON.stringify(glass)}

export const SCENE = ${JSON.stringify(svg)}
`
  writeFileSync(join(modDir, 'hooks', 'look.generated.ts'), generated)
  writeFileSync(join(modDir, 'preview.svg'), svg)

  console.log(`\nPalette: ${swatches}`)
  console.log(`Accent hue ${a.accentHue.toFixed(0)}°, base hue ${a.baseHue.toFixed(0)}°`)
  for (const line of report(definition)) console.log('  ' + line)
  console.log(`Scene: ${cols} columns, ${svg.length} characters`)
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
