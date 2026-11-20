# claude-image-theme

**English** · [Tiếng Việt](README.vi.md)

Turn any picture into a theme mod for Claude (Claude Code in the desktop and mobile apps).
Give it one image and it:

1. **Extracts the dominant palette** (k-means over the picture).
2. **Picks harmonious colors**: page/card/panel surfaces tinted with the picture's main hue, readable text, and accent / success / warning / danger / pro colors that keep their meaning but lean toward the picture.
3. **Uses the picture as the background**, redrawn as pure vector art (a soft blurred mosaic plus the picture's own bright points as twinkling stars), because themes cannot embed bitmaps.
4. **Adds a veil** over it (dark in dark mode, light in light mode) and **frosted glass** panels, so chat text stays readable.
5. **Checks contrast** with the design system's own color builder and nudges colors until the app accepts the theme.

The result is a ready-to-load mod folder: palette, chat frame, borders, buttons and text all follow your picture, much like the space themes in Antigravity.

![Example backdrop generated from samples/nebula.png](samples/nebula-preview.svg)

## Requirements

- Node.js 18 or newer
- Claude Code with mods (plugin hooks) support. Themes draw in the **desktop** and **mobile** apps; the terminal does not draw themes.

## Quick start

```bash
git clone https://github.com/ddtam2604work/claude-theme-from-image.git
cd claude-theme-from-image
npm install
node bin/generate.mjs "C:\Users\<you>\Pictures\space.jpg" --name space
```

Output:

```
Palette: #00292f 51%, #000c10 34%, #0c7046 4%, #0db9b0 3%, ...
  dark  text-primary on surface-0 16.8:1, text-muted on surface-0 8.8:1
Mod written to: ~/.claude/image-themes/image-theme-space
```

Then load the mod:

```bash
claude --plugin-dir ~/.claude/image-themes/image-theme-space
```

For a session started by the desktop app, add the folder to `CLAUDE_CODE_PLUGIN_DIRS` (in your environment, or the `env` block of `~/.claude/settings.json`):

```json
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "C:\\Users\\<you>\\.claude\\image-themes\\image-theme-space" } }
```

Open `preview.svg` inside the mod folder in a browser to see the backdrop before loading it.

### Try the bundled example

This repository is also a plugin marketplace with one example theme, **Nebula**, made from `samples/nebula.png` (an original, procedurally painted picture). At the prompt of a Claude Code session:

```
/plugin install image-theme-nebula --marketplace ddtam2604work/claude-theme-from-image
```

or from a shell:

```bash
claude plugin install image-theme-nebula --marketplace ddtam2604work/claude-theme-from-image
```

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `--name <slug>` | file name | Theme id; the mod is named `image-theme-<slug>` |
| `--label <text>` | from name | Name shown in the app |
| `--out <folder>` | `~/.claude/image-themes` | Where the mod folder goes |
| `--mode both\|dark\|light` | `both` | Make both modes, or a single-mode look |
| `--veil <0..1>` | `0.45` | How dark the dark-mode veil over the picture is |
| `--veil-light <0..1>` | `0.7` | How light the light-mode veil is |
| `--glass <0..1>` | `0.55` | Opacity of the frosted panels |
| `--blur <0..64>` | `18` | Blur behind panels, in points |
| `--detail <24..120>` | `96` | Mosaic columns (more = sharper, bigger file) |
| `--stars <n>` | `120` | Bright points kept from the picture |
| `--still` | off | No motion (no slow drift, no twinkle) |

Tips:
- Busy or bright picture and hard-to-read text? Raise `--veil` (e.g. `0.6`) or `--glass` (e.g. `0.7`).
- A dark space picture usually looks best with `--mode dark`.

## In the app

The mod adds a slash command named after it:

- `/image-theme-space off` restores the default look
- `/image-theme-space on` applies the theme again

People who asked their system for reduced motion get the backdrop still.

## How it works

```
image ──decode──► pixels ──area-average──► 96×54 grid ──k-means(8)──► palette
                                         │                              │
                                         │                       analyse: base hue,
                                         │                       accent, pro, saturation
                                         ▼                              ▼
                       k-means(40) mosaic + bright points      makeColors() anchors + roles
                       + veil + CSS drift/twinkle               (contrast-checked, auto-nudged)
                                         ▼                              ▼
                                 Backdrop scene (SVG)  ──►  $.theme.set({ colors, backdrop })
```

| File | Role |
| --- | --- |
| `bin/generate.mjs` | Command line: reads the image, writes the mod |
| `lib/image.mjs` | JPEG/PNG decode, grid averaging, star detection, k-means |
| `lib/theme.mjs` | Palette analysis and the theme definition (surfaces, text, roles) |
| `lib/scene.mjs` | The vector backdrop with veil and motion |
| `lib/color.mjs` | Color math and WCAG contrast |
| `template/hooks/register.tsx` | The mod itself: sets the theme, draws the backdrop, adds the command |
| `template/hooks/make-colors.js` | The design system's color builder, copied from Claude Code's mod authoring kit |
| `mods/image-theme-nebula` | Example generated mod |

Each generated mod holds `hooks/look.generated.ts` with the palette, the color definition and the SVG scene. Re-run the generator instead of editing it by hand.

## Limits

- Themes draw in the desktop and mobile apps only.
- The background is a soft vector redraw of the picture, not the photo itself: fine detail and text in the picture are blurred away on purpose.
- `make-colors.js` follows the Claude Code build it came from. After a big Claude Code update, refresh it from the mod authoring kit and regenerate.
- Use pictures you have the right to use.

## License

MIT
