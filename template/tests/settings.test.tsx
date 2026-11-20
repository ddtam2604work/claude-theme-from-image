import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const PANE = {
  plugin: '__MOD__',
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

/** Stand in for the engine: a store in memory, theme and pane calls recorded. */
function engine(on: Parameters<TestBody>[1]) {
  const calls = { sets: [] as unknown[], opens: [] as unknown[], clears: 0 }
  const stored: Record<string, unknown> = {}
  on('command.register', () => ({ value: { command: '__MOD__' } }))
  on('ui.open', (_, e) => {
    calls.opens.push(e)
    return { value: { isPlaced: true } }
  })
  on('theme.set', (_, e) => {
    calls.sets.push(e)
    return { value: { isDrawn: true, requestId: 'backdrop' } }
  })
  on('theme.clear', () => {
    calls.clears++
    return { value: { isDrawn: false, reason: 'cleared' } }
  })
  on('store.get', (_, e) => ({ value: stored[(e as { key: string }).key] }))
  on('store.set', (_, e) => {
    const { key, value } = e as { key: string; value: unknown }
    stored[key] = value
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  return { calls, stored }
}

test('the panel changes the theme live and keeps the change', async ($, on) => {
  const { calls, stored } = engine(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(calls.sets.length).toBe(1)
  // The first load opens the panel once.
  expect(calls.opens.length).toBe(1)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'glass-up' })
  await ui.select({ key: 'softness', value: 'soft' })
  await ui.press({ key: 'glow' })

  const saved = stored['settings-v1'] as { glass: number; softness: string; glow: boolean }
  expect(saved.softness).toBe('soft')
  expect(saved.glow).toBe(false)
  expect(saved.glass).toBeGreaterThan(0.5)
  expect(calls.sets.length).toBe(4)

  await ui.press({ key: 'enabled' })
  expect((stored['settings-v1'] as { enabled: boolean }).enabled).toBe(false)
  expect(calls.clears).toBe(1)
  await ui.unmount()
})

test('a picture that is not a jpg or png is refused with a message', async ($, on) => {
  engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.input({ key: 'path', text: 'C:\\pictures\\notes.txt' })
  const message = await ui.find({ type: 'Text', text: /\.jpg/ })
  expect(message).toBeDefined()
  await ui.unmount()
})

test('the Theme button above the prompt opens the panel', async ($, on) => {
  const { calls } = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const before = calls.opens.length

  const band = await $.ui.mount({
    plugin: '__MOD__',
    component: 'AbovePrompt',
    requestId: 'band',
    surface: 'desktop',
    props: { hasSurvey: false },
  } as Parameters<typeof $.ui.mount>[0])
  await band.press({ key: 'open-theme' })
  expect(calls.opens.length).toBe(before + 1)

  await band.press({ key: 'hide-band' })
  await band.unmount()
})
