import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import type { Job, Look, Settings } from '../types'
import { makeColors } from './make-colors.js'
import { COMMAND, DEFAULTS, EMBEDDED, LANG, MODE, SCENE_NAME } from './look.generated'

// An image theme with its own panel inside Claude:
// - the picture's palette colors the app, the picture (redrawn as vector art)
//   is the backdrop;
// - a Theme button above the prompt opens a panel to tune it live, or to pick
//   another picture, which the bundled generator turns into a new look.
// Settings live in $.state (for drawing) and $.store (across sessions); a
// swapped-in look is a JSON file in the plugin's data folder.

const SETTINGS = { plugin: '__MOD__', key: 'settings' } as const
const JOB = { plugin: '__MOD__', key: 'job' } as const
const LOOK_VERSION = { plugin: '__MOD__', key: 'lookVersion' } as const
const PANE = 'settings'
const STORE_KEY = 'settings-v1'
const WELCOMED_KEY = 'welcomed-v1'
const IDLE: Job = { isBusy: false, message: '', isError: false }

const BLUR: Record<Settings['softness'], number> = { sharp: 0.45, medium: 1.4, soft: 3.5 }

const TEXT = {
  en: {
    title: 'Theme',
    button: 'Theme',
    hide: 'Hide',
    on: 'On',
    off: 'Off',
    picture: 'Picture',
    choose: 'Choose picture…',
    original: 'Original picture',
    pathLabel: 'or paste a path',
    pathHint: 'C:\\Users\\you\\Pictures\\space.jpg',
    use: 'use',
    working: 'Making a theme from the picture…',
    applied: 'Applied',
    noNode: 'Picking a picture needs Node.js 18+ on the PATH.',
    noGenerator: 'This copy of the theme has no generator, so it cannot swap pictures.',
    notFound: 'File not found',
    badType: 'Use a .jpg, .jpeg or .png picture.',
    veil: 'Darkness over the picture',
    veilLight: 'Light veil (light mode)',
    glass: 'Panel glass opacity',
    blur: 'Blur behind panels',
    softness: 'Picture detail',
    sharp: 'Sharp',
    medium: 'Medium',
    soft: 'Soft',
    accent: 'Accent color',
    auto: 'From the picture',
    mode: 'Mode',
    modeAuto: 'Follow the app',
    dark: 'Dark',
    light: 'Light',
    stars: 'Twinkling stars',
    drift: 'Slow drift',
    glow: 'Bright borders',
    band: 'Button above prompt',
    reset: 'Reset',
    hint: 'Changes apply at once and are kept for next time.',
  },
  vi: {
    title: 'Theme',
    button: 'Theme',
    hide: 'Ẩn',
    on: 'Bật',
    off: 'Tắt',
    picture: 'Ảnh nền',
    choose: 'Chọn ảnh…',
    original: 'Ảnh gốc',
    pathLabel: 'hoặc dán đường dẫn',
    pathHint: 'C:\\Users\\ten-ban\\Pictures\\space.jpg',
    use: 'dùng',
    working: 'Đang tạo theme từ ảnh…',
    applied: 'Đã áp dụng',
    noNode: 'Cần cài Node.js 18 trở lên (có trong PATH) để đổi ảnh.',
    noGenerator: 'Bản theme này không kèm công cụ tạo theme nên không đổi ảnh được.',
    notFound: 'Không tìm thấy file',
    badType: 'Hãy dùng ảnh .jpg, .jpeg hoặc .png.',
    veil: 'Lớp phủ tối trên ảnh',
    veilLight: 'Lớp phủ sáng (chế độ sáng)',
    glass: 'Độ đục kính của khung',
    blur: 'Độ nhòe sau khung',
    softness: 'Độ nét ảnh nền',
    sharp: 'Sắc nét',
    medium: 'Vừa',
    soft: 'Mềm',
    accent: 'Màu nhấn',
    auto: 'Theo ảnh',
    mode: 'Chế độ',
    modeAuto: 'Theo ứng dụng',
    dark: 'Tối',
    light: 'Sáng',
    stars: 'Sao lấp lánh',
    drift: 'Ảnh trôi chậm',
    glow: 'Viền sáng',
    band: 'Nút trên ô nhập',
    reset: 'Mặc định',
    hint: 'Thay đổi áp dụng ngay và được lưu cho lần sau.',
  },
} as const
const T = TEXT[LANG]

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round2 = (v: number) => Math.round(v * 100) / 100
const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p

// ---------- the look: embedded, or swapped in from the panel ----------

let cached: { look: Look; isCustom: boolean } | undefined

async function dataDir($: EngineInterface): Promise<string | undefined> {
  try {
    return (await $.process.hookEnv()).CLAUDE_PLUGIN_DATA
  } catch {
    return undefined
  }
}

function isLook(v: unknown): v is Look {
  const l = v as Partial<Look> | null
  return (
    !!l &&
    l.v === 1 &&
    typeof l.label === 'string' &&
    typeof l.sceneTemplate === 'string' &&
    l.sceneTemplate.length < 131072 &&
    typeof l.darkBg === 'string' &&
    typeof l.lightBg === 'string' &&
    Array.isArray(l.accents) &&
    !!l.definition
  )
}

async function loadLook($: EngineInterface): Promise<{ look: Look; isCustom: boolean }> {
  if (cached) return cached
  cached = { look: EMBEDDED, isCustom: false }
  const dir = await dataDir($)
  if (dir) {
    try {
      const file = `${dir}/look.json`
      if (await $.fs.exists(file)) {
        const parsed: unknown = JSON.parse(await $.fs.read(file))
        if (isLook(parsed)) cached = { look: parsed, isCustom: true }
      }
    } catch {
      // A broken file falls back to the embedded look.
    }
  }
  return cached
}

// ---------- drawing the theme ----------

function sceneCss(s: Settings, look: Look): string {
  const parts = [
    `.veil{fill:${look.darkBg};opacity:${s.veil}}`,
    `@media (prefers-color-scheme: light){.veil{fill:${look.lightBg};opacity:${s.veilLight}}.stars{opacity:.35}}`,
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

function scene(s: Settings, look: Look): string {
  return look.sceneTemplate.replace('@@CSS@@', sceneCss(s, look)).replace('@@BLUR@@', String(BLUR[s.softness]))
}

function themeArgs(s: Settings, look: Look): ThemeSetArgs {
  const accent = s.accent === 'auto' ? look.definition.roles?.['accent'] : s.accent
  const { theme } = makeColors({
    ...look.definition,
    roles: { ...look.definition.roles, accent },
    ...(s.glow ? { contrast: 'more' as const } : {}),
  } as Parameters<typeof makeColors>[0])
  return {
    colors: theme,
    backdrop: { scene: SCENE_NAME, glass: { blur: s.blur, opacity: s.glass } },
    ...(s.mode === 'auto' ? {} : { overrideColorScheme: s.mode }),
  }
}

// ---------- settings ----------

/** Settings as stored, with anything missing or out of range set back to the default. */
function sanitize(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>
  const num = (v: unknown, d: number, lo: number, hi: number) =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d
  const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d)
  const pick = <V extends string>(v: unknown, allowed: readonly V[], d: V): V =>
    allowed.includes(v as V) ? (v as V) : d
  return {
    enabled: bool(r.enabled, DEFAULTS.enabled),
    veil: num(r.veil, DEFAULTS.veil, 0, 0.95),
    veilLight: num(r.veilLight, DEFAULTS.veilLight, 0, 0.95),
    glass: num(r.glass, DEFAULTS.glass, 0, 1),
    blur: num(r.blur, DEFAULTS.blur, 0, 64),
    softness: pick(r.softness, ['sharp', 'medium', 'soft'] as const, DEFAULTS.softness),
    accent:
      typeof r.accent === 'string' && (r.accent === 'auto' || /^#[0-9a-f]{6}$/i.test(r.accent))
        ? r.accent
        : DEFAULTS.accent,
    mode: pick(r.mode, ['auto', 'dark', 'light'] as const, DEFAULTS.mode),
    stars: bool(r.stars, DEFAULTS.stars),
    drift: bool(r.drift, DEFAULTS.drift),
    glow: bool(r.glow, DEFAULTS.glow),
    band: bool(r.band, DEFAULTS.band),
  }
}

async function current($: EngineInterface): Promise<Settings> {
  const { value } = await $.state.get(SETTINGS)
  return sanitize(value ?? (await $.store.get(STORE_KEY)))
}

async function apply($: EngineInterface, s: Settings): Promise<void> {
  if (!s.enabled) {
    await $.theme.clear()
    return
  }
  const { look } = await loadLook($)
  const set = await $.theme.set(themeArgs(s, look))
  if (!set.isDrawn) {
    $.ui.status(set.reason)
  }
}

async function change($: EngineInterface, edit: (s: Settings) => Partial<Settings>): Promise<void> {
  const before = await current($)
  const after = sanitize({ ...before, ...edit(before) })
  await $.state.set(SETTINGS, after)
  await $.store.set(STORE_KEY, after)
  await apply($, after)
}

async function openPane($: EngineInterface): Promise<void> {
  const { look } = await loadLook($)
  await $.ui.open({ id: PANE, title: `${T.title}: ${look.label}` })
}

// ---------- swapping the picture ----------

async function setJob($: EngineInterface, job: Job): Promise<void> {
  await $.state.set(JOB, job)
}

/** The system's own "open file" dialog. Resolves the chosen path, or undefined. */
async function pickFile($: EngineInterface): Promise<string | undefined> {
  const { sysname } = await $.session.machine()
  let argv: string[]
  if (sysname === 'Windows_NT') {
    const script = [
      '[Console]::OutputEncoding=[Text.Encoding]::UTF8',
      'Add-Type -AssemblyName System.Windows.Forms',
      '$f=New-Object System.Windows.Forms.Form',
      '$f.TopMost=$true',
      '$d=New-Object System.Windows.Forms.OpenFileDialog',
      `$d.Title='${T.choose.replace(/'/g, "''")}'`,
      "$d.Filter='Images (*.jpg;*.jpeg;*.png)|*.jpg;*.jpeg;*.png'",
      "$d.InitialDirectory=[Environment]::GetFolderPath('MyPictures')",
      "if($d.ShowDialog($f) -eq 'OK'){[Console]::Out.Write($d.FileName)}",
    ].join(';')
    argv = ['powershell.exe', '-NoProfile', '-STA', '-Command', script]
  } else if (sysname === 'Darwin') {
    argv = ['osascript', '-e', 'POSIX path of (choose file of type {"public.jpeg", "public.png"})']
  } else {
    argv = ['zenity', '--file-selection', '--file-filter=Images | *.jpg *.jpeg *.png *.JPG *.PNG']
  }
  try {
    const r = await $.process.run(argv, { timeoutMs: 600000 })
    const path = r.stdout.trim()
    return r.exitCode === 0 && path ? path : undefined
  } catch {
    return undefined
  }
}

async function swapPicture($: EngineInterface, rawPath: string): Promise<void> {
  const path = rawPath.trim().replace(/^["']|["']$/g, '')
  if (!path) return
  if ((await $.state.get(JOB)).value?.isBusy) return

  if (!/\.(jpe?g|png)$/i.test(path)) {
    await setJob($, { isBusy: false, message: T.badType, isError: true })
    return
  }
  if (!(await $.fs.exists(path))) {
    await setJob($, { isBusy: false, message: `${T.notFound}: ${path}`, isError: true })
    return
  }
  const generator = `${$.plugin.root}/generator/bin/generate.mjs`
  const dir = await dataDir($)
  if (!dir || !(await $.fs.exists(generator))) {
    await setJob($, { isBusy: false, message: T.noGenerator, isError: true })
    return
  }

  const name = baseName(path)
  const label = name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim().slice(0, 64) || 'Image'
  await setJob($, { isBusy: true, message: `${T.working} ${name}`, isError: false })

  let result: { exitCode: number; stderr: string } | undefined
  try {
    result = await $.process.run(
      ['node', generator, path, '--json', `${dir}/look.json`, '--name', SCENE_NAME, '--label', label, '--mode', MODE],
      { timeoutMs: 180000 },
    )
  } catch {
    result = undefined
  }
  if (!result || result.exitCode !== 0) {
    const why = result?.stderr.trim().split('\n').pop() ?? T.noNode
    await setJob($, { isBusy: false, message: why || T.noNode, isError: true })
    return
  }

  cached = undefined
  const { look } = await loadLook($)
  await change($, s => ({ enabled: true, accent: look.accents.includes(s.accent) ? s.accent : 'auto' }))
  await $.state.set(LOOK_VERSION, ((await $.state.get(LOOK_VERSION)).value ?? 0) + 1)
  await setJob($, { isBusy: false, message: `${T.applied}: ${name}`, isError: false })
}

async function useOriginal($: EngineInterface): Promise<void> {
  const dir = await dataDir($)
  if (dir && (await $.fs.exists(`${dir}/look.json`))) {
    await $.fs.write(`${dir}/look.json`, '{}')
  }
  cached = undefined
  await change($, () => ({ accent: 'auto' }))
  await $.state.set(LOOK_VERSION, ((await $.state.get(LOOK_VERSION)).value ?? 0) + 1)
  await setJob($, { isBusy: false, message: `${T.applied}: ${EMBEDDED.source}`, isError: false })
}

// ---------- hooks ----------

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Image theme: open the panel; `off` / `on` turn the theme off or on',
    })
    const s = sanitize(await $.store.get(STORE_KEY))
    await $.state.set(SETTINGS, s)
    await setJob($, IDLE)
    await apply($, s)

    // Show the panel once, the first time the theme loads.
    if (!(await $.store.get(WELCOMED_KEY))) {
      await $.store.set(WELCOMED_KEY, true)
      void openPane($)
    }

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = e.args.trim()
    const { look } = await loadLook($)
    if (arg === 'off' || arg === 'on') {
      await change($, () => ({ enabled: arg === 'on' }))
      return { text: `${look.label}: ${arg === 'on' ? T.on : T.off}` }
    }
    await openPane($)
    return { text: `${T.title}: ${look.label}` }
  })

  // The Theme button above the prompt.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }
    const s = await current($)
    if (!s.band || e.props.hasSurvey) {
      return next(e)
    }
    await $.state.get(LOOK_VERSION)
    const { look } = await loadLook($)
    const { Box, Button, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="row" gap={1} alignItems="center">
        <Button key="open-theme" variant="primary" onPress={() => openPane($)}>
          {T.button}
        </Button>
        <Text dimColor>
          {look.label}
          {s.enabled ? '' : ` (${T.off})`}
        </Text>
        <Button key="hide-band" dimColor onPress={() => change($, () => ({ band: false }))}>
          {T.hide}
        </Button>
      </Box>
    )
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }
    if (e.props.scene !== SCENE_NAME) {
      return next(e)
    }
    await $.state.get(LOOK_VERSION)
    const s = await current($)
    const { look } = await loadLook($)
    const { Svg } = $.ui.resolve(e)

    return <Svg source={scene(s, look)} alt={look.alt} isInteractive />
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Select, Input, Progress } = $.ui.resolve(e)
    const s = await current($)
    const job = (await $.state.get(JOB)).value ?? IDLE
    await $.state.get(LOOK_VERSION)
    const { look, isCustom } = await loadLook($)

    const slider = (
      key: 'veil' | 'veilLight' | 'glass' | 'blur',
      label: string,
      step: number,
      max: number,
      unit: (v: number) => string,
    ) => (
      <Box flexDirection="column" key={key}>
        <Text>{label}</Text>
        <Box flexDirection="row" gap={1} alignItems="center">
          <Button key={`${key}-down`} label="−" onPress={() => change($, x => ({ [key]: round2(x[key] - step) }))} />
          <Box flexGrow={1}>
            <Progress label={label} value={s[key]} max={max} valueText={unit(s[key])} />
          </Box>
          <Text tabular>{unit(s[key])}</Text>
          <Button key={`${key}-up`} label="+" onPress={() => change($, x => ({ [key]: round2(x[key] + step) }))} />
        </Box>
      </Box>
    )

    const toggle = (key: 'stars' | 'drift' | 'glow' | 'band', label: string) => (
      <Button
        key={key}
        variant={s[key] ? 'primary' : 'secondary'}
        onPress={() => change($, x => ({ [key]: !x[key] }))}
      >
        {label}: {s[key] ? T.on : T.off}
      </Button>
    )

    const pct = (v: number) => `${Math.round(v * 100)}%`

    return (
      <Box flexDirection="column" gap={1} padding={1}>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text weight="semibold">{look.label}</Text>
          <Button
            key="enabled"
            variant={s.enabled ? 'primary' : 'secondary'}
            onPress={() => change($, x => ({ enabled: !x.enabled }))}
          >
            {s.enabled ? T.on : T.off}
          </Button>
        </Box>

        <Box flexDirection="column" gap={1}>
          <Text weight="medium">
            {T.picture}: <Text dimColor>{look.source}</Text>
          </Text>
          <Box flexDirection="row" gap={1} flexWrap="wrap">
            <Button
              key="choose"
              variant="primary"
              onPress={async () => {
                const path = await pickFile($)
                if (path) await swapPicture($, path)
              }}
            >
              {T.choose}
            </Button>
            {isCustom && (
              <Button key="original" onPress={() => useOriginal($)}>
                {T.original}
              </Button>
            )}
          </Box>
          <Input
            key="path"
            label={T.pathLabel}
            placeholder={T.pathHint}
            submitLabel={T.use}
            onSubmit={v => swapPicture($, v)}
          />
          {job.isBusy && <Progress label={job.message} />}
          {!job.isBusy && job.message !== '' && (
            <Text color={job.isError ? 'error' : 'success'} size="footnote">
              {job.message}
            </Text>
          )}
        </Box>

        {slider('veil', T.veil, 0.05, 0.95, pct)}
        {slider('veilLight', T.veilLight, 0.05, 0.95, pct)}
        {slider('glass', T.glass, 0.05, 1, pct)}
        {slider('blur', T.blur, 4, 64, v => `${v}`)}
        <Select
          key="softness"
          label={T.softness}
          value={s.softness}
          options={[
            { value: 'sharp', label: T.sharp },
            { value: 'medium', label: T.medium },
            { value: 'soft', label: T.soft },
          ]}
          onSelect={v => change($, () => ({ softness: v as Settings['softness'] }))}
        />
        <Select
          key="accent"
          label={T.accent}
          value={look.accents.includes(s.accent) ? s.accent : 'auto'}
          options={[{ value: 'auto', label: T.auto }, ...look.accents.map(c => ({ value: c, label: c }))]}
          onSelect={v => change($, () => ({ accent: v }))}
        />
        <Select
          key="mode"
          label={T.mode}
          value={s.mode}
          options={[
            { value: 'auto', label: T.modeAuto },
            { value: 'dark', label: T.dark },
            { value: 'light', label: T.light },
          ]}
          onSelect={v => change($, () => ({ mode: v as Settings['mode'] }))}
        />
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {toggle('stars', T.stars)}
          {toggle('drift', T.drift)}
          {toggle('glow', T.glow)}
          {toggle('band', T.band)}
        </Box>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text dimColor size="footnote">
            {T.hint}
          </Text>
          <Button key="reset" onPress={() => change($, () => ({ ...DEFAULTS }))}>
            {T.reset}
          </Button>
        </Box>
      </Box>
    )
  })
}
