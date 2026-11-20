import type { Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { ALT, COMMAND, DEFINITION, GLASS, SCENE, SCENE_NAME } from './look.generated'

// Colors come from the picture's palette (see look.generated.ts); the
// backdrop is the picture redrawn as vector art with a readability veil.
const { theme, problems } = makeColors(DEFINITION)

const LOOK: ThemeSetArgs = {
  colors: theme,
  backdrop: { scene: SCENE_NAME, glass: GLASS },
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Image theme: `off` restores the default look, `on` applies it again',
    })

    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))
    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }

    const set = await $.theme.set(LOOK)
    if (!set.isDrawn) {
      $.ui.status(set.reason)
    }

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    if (e.args.trim() === 'off') {
      await $.theme.clear()
      return { text: 'Image theme off. Run it with `on` to bring it back.' }
    }
    const set = await $.theme.set(LOOK)
    return { text: set.isDrawn ? `Image theme "${DEFINITION.label}" on.` : set.reason }
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.surface !== 'desktop' && e.surface !== 'mobile') {
      return next(e)
    }
    if (e.props.scene !== SCENE_NAME) {
      return next(e)
    }

    const { Svg } = $.ui.resolve(e)

    return <Svg source={SCENE} alt={ALT} isInteractive />
  })
}
