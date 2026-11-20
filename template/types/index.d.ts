export type Settings = {
  enabled: boolean
  /** Opacity of the dark veil over the picture, 0..0.95 */
  veil: number
  /** Opacity of the light veil in light mode, 0..0.95 */
  veilLight: number
  /** Opacity of the frosted panels, 0..1 */
  glass: number
  /** Blur behind panels, in points, 0..64 */
  blur: number
  softness: 'sharp' | 'medium' | 'soft'
  /** 'auto' or a #rrggbb color */
  accent: string
  mode: 'auto' | 'dark' | 'light'
  stars: boolean
  drift: boolean
  glow: boolean
  /** Show the Theme button above the prompt */
  band: boolean
}

/** The makeColors() definition, kept as data (the contract cannot import its type). */
export type ColorDefinition = {
  label: string
  id?: string
  roles?: { [role: string]: unknown }
  light?: unknown
  dark?: unknown
  codeTheme?: { light?: string; dark?: string }
  contrast?: 'more'
  only?: 'light' | 'dark'
}

/** What one picture made: colors and the scene. Embedded, or swapped in from the panel. */
export type Look = {
  v: 1
  label: string
  /** File name of the picture */
  source: string
  alt: string
  darkBg: string
  lightBg: string
  accents: string[]
  definition: ColorDefinition
  sceneTemplate: string
}

/** The picture swap running from the panel. */
export type Job = {
  isBusy: boolean
  /** Last outcome, shown in the panel */
  message: string
  isError: boolean
}

declare module 'claude-code' {
  interface PluginState {
    '__MOD__': { settings: Settings; job: Job; lookVersion: number }
  }
}
