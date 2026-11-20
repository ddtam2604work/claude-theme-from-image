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
}

declare module 'claude-code' {
  interface PluginState {
    '__MOD__': { settings: Settings }
  }
}
