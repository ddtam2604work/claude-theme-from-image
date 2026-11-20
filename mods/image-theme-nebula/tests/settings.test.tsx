import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'image-theme-nebula',
  component: 'Pane',
  requestId: 'settings',
  props: {
    title: 'Theme',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('the pane changes the theme live and keeps the change', async ($, on) => {
  const sets: unknown[] = []
  const stored: Record<string, unknown> = {}
  on('command.register', () => ({ value: { command: 'image-theme-nebula' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('theme.set', (_, e) => {
    sets.push(e)
    return { value: { isDrawn: true, requestId: 'backdrop' } }
  })
  on('theme.clear', () => ({ value: { isDrawn: false, reason: 'cleared' } }))
  on('store.get', (_, e) => ({ value: stored[(e as { key: string }).key] }))
  on('store.set', (_, e) => {
    const { key, value } = e as { key: string; value: unknown }
    stored[key] = value
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(sets.length).toBe(1)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'glass-up' })
  await ui.select({ key: 'softness', value: 'soft' })
  await ui.press({ key: 'glow' })

  const saved = stored['settings-v1'] as { glass: number; softness: string; glow: boolean; enabled: boolean }
  expect(saved.softness).toBe('soft')
  expect(saved.glow).toBe(false)
  expect(saved.glass).toBeGreaterThan(0.5)
  expect(sets.length).toBe(4)

  await ui.press({ key: 'enabled' })
  expect((stored['settings-v1'] as { enabled: boolean }).enabled).toBe(false)
  await ui.unmount()
})
