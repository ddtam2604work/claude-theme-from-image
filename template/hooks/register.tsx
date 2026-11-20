import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import type { Settings } from '../types'
import { makeColors } from './make-colors.js'
import {
  ACCENTS,
  ALT,
  COMMAND,
  DARK_BG,
  DEFAULTS,
  DEFINITION,
  LANG,
  LIGHT_BG,
  SCENE_NAME,
  SCENE_TEMPLATE,
} from './look.generated'

// The theme: colors from the picture's palette, the picture redrawn as vector
// art for the backdrop, and a pane to tune it live. Settings live in $.state
// (for drawing) and $.store (so they last across sessions).

const SETTINGS = { plugin: '__MOD__', key: 'settings' } as const
const PANE = 'settings'
const STORE_KEY = 'settings-v1'

const BLUR: Record<Settings['softness'], number> = { sharp: 0.45, medium: 1.4, soft: 3.5 }

const TEXT = {
  en: {
    title: 'Theme',
    on: 'On',
    off: 'Off',
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
    reset: 'Reset',
    hint: 'Changes apply at once and are kept for next time.',
  },
  vi: {
    title: 'Theme',
    on: 'Bật',
    off: 'Tắt',
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
    reset: 'Mặc định',
    hint: 'Thay đổi áp dụng ngay và được lưu cho lần sau.',
  },
} as const
const T = TEXT[LANG]

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const round2 = (v: number) => Math.round(v * 100) / 100

function sceneCss(s: Settings): string {
  const parts = [
    `.veil{fill:${DARK_BG};opacity:${s.veil}}`,
    `@media (prefers-color-scheme: light){.veil{fill:${LIGHT_BG};opacity:${s.veilLight}}.stars{opacity:.35}}`,
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

function scene(s: Settings): string {
  return SCENE_TEMPLATE.replace('@@CSS@@', sceneCss(s)).replace('@@BLUR@@', String(BLUR[s.softness]))
}

function look(s: Settings): ThemeSetArgs {
  const accent = s.accent === 'auto' ? DEFINITION.roles?.accent : s.accent
  const { theme } = makeColors({
    ...DEFINITION,
    roles: { ...DEFINITION.roles, accent },
    ...(s.glow ? { contrast: 'more' as const } : {}),
  })
  return {
    colors: theme,
    backdrop: { scene: SCENE_NAME, glass: { blur: s.blur, opacity: s.glass } },
    ...(s.mode === 'auto' ? {} : { overrideColorScheme: s.mode }),
  }
}

/** Settings as stored, with anything missing or out of range set back to the default. */
function sanitize(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>
  const num = (v: unknown, d: number, lo: number, hi: number) =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : d
  const pick = <V extends string>(v: unknown, allowed: readonly V[], d: V): V =>
    allowed.includes(v as V) ? (v as V) : d
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : DEFAULTS.enabled,
    veil: num(r.veil, DEFAULTS.veil, 0, 0.95),
    veilLight: num(r.veilLight, DEFAULTS.veilLight, 0, 0.95),
    glass: num(r.glass, DEFAULTS.glass, 0, 1),
    blur: num(r.blur, DEFAULTS.blur, 0, 64),
    softness: pick(r.softness, ['sharp', 'medium', 'soft'] as const, DEFAULTS.softness),
    accent: typeof r.accent === 'string' && (r.accent === 'auto' || /^#[0-9a-f]{6}$/i.test(r.accent)) ? r.accent : DEFAULTS.accent,
    mode: pick(r.mode, ['auto', 'dark', 'light'] as const, DEFAULTS.mode),
    stars: typeof r.stars === 'boolean' ? r.stars : DEFAULTS.stars,
    drift: typeof r.drift === 'boolean' ? r.drift : DEFAULTS.drift,
    glow: typeof r.glow === 'boolean' ? r.glow : DEFAULTS.glow,
  }
}

async function current($: EngineInterface): Promise<Settings> {
  const { value } = await $.state.get(SETTINGS)
  return sanitize(value ?? (await $.store.get(STORE_KEY)))
}

async function apply($: EngineInterface, s: Settings): Promise<void> {
  if (s.enabled) {
    const set = await $.theme.set(look(s))
    if (!set.isDrawn) {
      $.ui.status(set.reason)
    }
  } else {
    await $.theme.clear()
  }
}

async function change($: EngineInterface, edit: (s: Settings) => Partial<Settings>): Promise<void> {
  const before = await current($)
  const after = sanitize({ ...before, ...edit(before) })
  await $.state.set(SETTINGS, after)
  await $.store.set(STORE_KEY, after)
  await apply($, after)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Image theme: open the settings pane; `off` / `on` turn the theme off or on',
    })
    const s = sanitize(await $.store.get(STORE_KEY))
    await $.state.set(SETTINGS, s)
    await apply($, s)

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'off' || arg === 'on') {
      await change($, () => ({ enabled: arg === 'on' }))
      return { text: `${DEFINITION.label}: ${arg === 'on' ? T.on : T.off}` }
    }
    await $.ui.open({ id: PANE, title: `${T.title}: ${DEFINITION.label}` })
    return { text: `${T.title}: ${DEFINITION.label}` }
  })

  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }
    if (e.props.scene !== SCENE_NAME) {
      return next(e)
    }
    const s = await current($)
    const { Svg } = $.ui.resolve(e)

    return <Svg source={scene(s)} alt={ALT} isInteractive />
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Select, Progress } = $.ui.resolve(e)
    const s = await current($)

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

    const toggle = (key: 'stars' | 'drift' | 'glow', label: string) => (
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
          <Text weight="semibold">{DEFINITION.label}</Text>
          <Button
            key="enabled"
            variant={s.enabled ? 'primary' : 'secondary'}
            onPress={() => change($, x => ({ enabled: !x.enabled }))}
          >
            {s.enabled ? T.on : T.off}
          </Button>
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
          value={s.accent}
          options={[{ value: 'auto', label: T.auto }, ...ACCENTS.map(c => ({ value: c, label: c }))]}
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
        </Box>
        <Box flexDirection="row" justifyContent="space-between" alignItems="center">
          <Text dimColor size="footnote">{T.hint}</Text>
          <Button key="reset" onPress={() => change($, () => ({ ...DEFAULTS }))}>
            {T.reset}
          </Button>
        </Box>
      </Box>
    )
  })
}
