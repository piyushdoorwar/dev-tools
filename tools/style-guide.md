# Premium Dark Design System

## Color Palette

### Primary Colors
- **Purple**: `#6739B7` - Main brand color, used for interactive elements
- **Purple Light**: `#8B5CF6` - Hover states and highlights
- **Purple Dark**: `#5B21B6` - Active states

### Secondary Colors
- **Yellow/Gold**: `#FFD700` - Primary CTAs and accents
- **Yellow Dark**: `#FFC700` - Hover states for yellow elements
- **Yellow Light**: `#FFE55C` - Highlights

### Additional Accents
- **Green**: `#00D09C` - Success states and positive actions
- **Pink**: `#FF6B9D` - Special highlights
- **Blue**: `#5DADE2` - Information and links

### Backgrounds
- **Primary BG**: `#0d0d0d` - Main background
- **Secondary BG**: `#1a1a1a` - Secondary surfaces
- **Panel BG**: `#1e1e1e` - Card/panel backgrounds
- **Panel BG Elevated**: `#252525` - Elevated panels and modals

### Text Colors
- **Primary Text**: `#FFFFFF` - Main content
- **Secondary Text**: `#B8B8B8` - Supporting text
- **Muted Text**: `rgba(255, 255, 255, 0.6)` - Disabled or less important text
- **Disabled Text**: `rgba(255, 255, 255, 0.3)` - Completely disabled elements

### Borders
- **Default Border**: `rgba(255, 255, 255, 0.06)` - Subtle borders
- **Light Border**: `rgba(255, 255, 255, 0.1)` - More prominent borders

### Shadows
- **Small**: `0 2px 8px rgba(0, 0, 0, 0.3)`
- **Medium**: `0 8px 24px rgba(0, 0, 0, 0.4)`
- **Large**: `0 16px 48px rgba(0, 0, 0, 0.5)`
- **Purple Glow**: `0 8px 24px rgba(103, 57, 183, 0.3)`
- **Yellow Glow**: `0 8px 24px rgba(255, 215, 0, 0.3)`

## Typography

### Font Families
- **Primary**: Inter (clean, modern sans-serif)
- **Secondary**: Gilroy (headlines and accent text)
- **Monospace**: JetBrains Mono (code blocks)

### Font Weights
- **Regular**: 400
- **Medium**: 500
- **Semibold**: 600
- **Bold**: 700
- **Extra Bold**: 800

## Atmospheric Blueprint

### Surface Spectrum
- **Base Layer**: Start with `--bg` (#0d0d0d) and stack animated radial gradients defined in `body::before` (purple, yellow, and lavender glows) with `gradientShift` 20s animation
- **Secondary Planes**: Use `--bg-secondary`, `--panel-bg`, and `--panel-bg-elevated` to layer panels with `--border` or `--border-light`
- **Glows**: Apply soft purple/yellow glows (`--shadow-purple` or `--shadow-yellow`) on interactive lifted states
- **Viewport**: Maintain fixed overlay with `pointer-events: none` for non-blocking atmospheric effect

### App Name & Identity
- Position the name inside the `app-header` with `Inter` 800 weight, 2rem size, and tight letter spacing (–0.02em)
- Use diagonal gradient: `linear-gradient(135deg, var(--accent-yellow), var(--accent-purple-light))`
- Apply with `-webkit-background-clip: text` and `-webkit-text-fill-color: transparent` for text gradient effect
- Keep clean without additional shadows—the gradient provides premium feel

### Action Bar (Toolbar) System
- Flexible surface with `display: flex; gap: 0.5rem`, padding `1rem 1.25rem`, 20px border-radius
- Background: `var(--panel-bg)` with `var(--border)` frame and `var(--shadow-md)` elevation
- Group buttons in `toolbar-group` pods with semi-transparent fill `rgba(255, 255, 255, 0.03)`, subtle border, and 0.25rem padding

### Action Bar Typography & States
- Labels are uppercase at `0.65rem`, letter-spaced (.12em), using `var(--text-disabled)` for system captions
- Buttons/selects use `Inter` or `JetBrains Mono` (monospace) at 36px square for consistent touch targets
- Hover: shift up 2px, purple background, standard text color
- Active: scale to 0.95 with purple glow
- Disabled: fade to 0.3 opacity
- Select controls and color swatches follow same hover pattern with purple accent and shadow

### Tooltip Language
- Unified style: 0.75rem text at weight 500, 0.5rem padding, 10px border-radius
- Background: `var(--panel-bg-elevated)` with `var(--border-light)` borders
- Fade in with 0.2s transition, slide up 4px from trigger, z-index: 1000
- Success states: switch to `var(--accent-yellow)` background with `var(--bg)` text

### Consuming the System
- Reuse CSS hooks: apply radial gradient overlay to body, use gradient-filled title, wrap actions in toolbar pattern, and maintain consistent hover/tooltip language across all tools

## Usage Guidelines

### When to Use Yellow
- Primary call-to-action buttons
- Important labels (like code language tags)
- Links and interactive text
- Active/selected states

### When to Use Purple
- Hover states for buttons and interactive elements
- Focus states for inputs
- Table headers
- Secondary accents
- Scrollbar thumbs

### When to Use Gradients
- Headers and titles (yellow to purple)
- Active button states
- Scrollbars
- Special highlights

## Accessibility

- High contrast ratios (white on dark)
- Clear focus states with purple borders
- Adequate spacing for touch targets (36-44px minimum)
- Readable font sizes (minimum 0.75rem)

## Shared Components

Components live in `tools/main.css` (`@layer shared`) and `tools/main.js`. A tool
inherits them by loading both — it should not restyle or reimplement them.

Because `shared` wins by cascade layer rather than specificity, it declares only
*appearance* (colour, radius, border, shadow, padding, type). Anything a tool
legitimately varies — width, flex behaviour, position in a toolbar — stays in
the tool's own stylesheet.

### Dropdown (`.dd`) — done

One trigger + popup for both value selection and command menus.

```html
<div class="dd" data-dd data-dd-select="#native-select">
  <button class="dd__trigger" type="button">
    <span class="dd__value">UUID v4</span>
  </button>
  <div class="dd__menu" role="listbox">
    <button class="dd__option" type="button" role="option" data-value="uuid-v4">UUID v4</button>
  </div>
</div>
```

| Hook | Purpose |
| --- | --- |
| `data-dd` | Marks the root for auto-init. `data-dd="menu"` = command menu, no selection. |
| `data-dd-select` | Selector for a native `<select>` to mirror; a `change` event fires on it. |
| `.dd--end` | Right-align the menu under the trigger. |
| `.dd__trigger--plain` | Keep the tool's own button styling; skips the generated chevron. |
| `dd:change` event | `detail: { value, label }`, fired on the `.dd` root. |

Behaviour — open/close, outside click, Escape, arrow keys, Home/End, ARIA —
comes from `DevToolsMain.initDropdowns()`, which runs on load and on any node
added later. Tools must not add their own open/close handlers.

The selected option reads as a quiet purple tick on a subtle surface rather than
a filled gradient row, so long menus stay calm.

Helpers: `DevToolsMain.selectDropdownValue(root, value, { emit })`,
`.openDropdown(root)`, `.closeDropdown(root)`, `.closeAllDropdowns()`.

### Icons (`#dt-icon-sprite`) — done

`main.js` injects one `<symbol>` sheet per page. Tools keep their own `<svg>`
wrapper — 93 CSS rules size icons via `svg` descendant selectors — and point it
at a symbol:

```html
<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
  <use href="#i-copy"></use>
</svg>
```

Stroke geometry (`stroke-width: 2`, round caps and joins, `fill: none`) lives on
the `<symbol>`, so an icon is identical everywhere regardless of what the host
page declares. Before this, `copy` alone existed in six spellings and `trash` in
three, at stroke widths from 1.5 to 3.

Available: `copy` `paste` `download` `upload` `trash` `check` `close` `info`
`undo` `redo` `file-text` `file-code` `align` `sort` `swap` `menu`
`chevron-down` `search` `settings`.

Add new icons to `ICON_SPRITE` in `main.js`. Never inline an icon that the
sprite already has. Genuinely tool-specific glyphs stay inline.

### Split resizer (`.resizer`) — done

The drag handle between two panels.

```html
<div class="resizer" data-resize
     data-resize-container=".workspace"
     data-resize-before=".panel:first-child"
     data-resize-after=".right-panel"></div>
```

| Hook | Default | Purpose |
| --- | --- | --- |
| `data-resize-container` | `.workspace` | The flex row being split. |
| `data-resize-before` / `-after` | `.panel:first-child` / `.right-panel` | The two panes. |
| `data-resize-min` / `-max` | `20` / `80` | Travel limits, in percent. |
| `data-resize-min-viewport` | `1024` | Below this the panes stack and the handle hides. |
| `resize:change` event | — | `detail: { percent }`, bubbles. |

`DevToolsMain.initResizers()` owns the drag. It uses pointer events, so mouse,
touch and pen share one path, and `setPointerCapture`, so no document-level
listener runs while idle. The four implementations it replaced were mouse-only,
none called `preventDefault` (dragging swept a text selection across the page),
and none were keyboard operable.

The handle is a focusable `role="separator"`: arrow keys nudge it, Home/End jump
to the limits, double-click restores an even split.

**Hiding it responsively must go through `data-resize-min-viewport`.** A
`display: none` in a tool's media query cannot win against the shared layer;
`initResizers()` toggles `.is-disabled` at the tool's own threshold instead, and
also clears the inline flex values so they don't fight the stacked layout.

### Toast (`DevToolsMain.showToast`) — done

```js
DevToolsMain.showToast('Copied to clipboard', 'success');
DevToolsMain.showToast('Nothing to download', 'error');
DevToolsMain.showToast('Working…', 'info', { duration: 6000 });
```

Types: `success` `error` `warning` `info`. The icon comes from the shared
sprite, so toasts and buttons use the same glyphs.

The container is created on demand — a tool does not need to ship any markup.
If it does, it must be `<div id="toast-container">`.

Deliberate behaviour:

- **Errors last 4000ms, warnings 3400ms, everything else 2600ms.** An error has
  to be read; an acknowledgement just has to be noticed. The ten
  implementations this replaced ranged from 1500ms to 4200ms with no rationale.
- **Errors get `role="alert"` and an assertive live region**; other types are
  polite `role="status"`.
- **At most four toasts are visible**; a burst drops the oldest.
- **Clicking a toast dismisses it.**
- **The message is set as text, never markup.** One of the replaced versions
  interpolated the message into `innerHTML`.

Two of the ten were stubs that did nothing at all (`function showToast() {
return; }`), so every message in those tools was silently discarded. If you are
adding user feedback, call the shared function — do not write a local one.

### Modal (`data-modal`) — done

```html
<div class="modal-overlay" id="helpModal" data-modal>
  <div class="modal-content">
    <div class="modal-header">
      <h3 class="modal-title">Title</h3>
      <button class="modal-close" data-modal-close>…</button>
    </div>
    <div class="modal-body">…</div>
  </div>
</div>
```

```js
DevToolsMain.openModal('#helpModal');   // element or selector
DevToolsMain.closeModal('#helpModal');
```

`is-open` is the single state class. Thirteen tools previously used four
different ones (`is-open`, `active`, `show`, `open`) or raw `style.display`.
A tool's stylesheet still owns `display`, because centring differs between
tools; the shared layer owns everything else.

The component provides, for every dialog:

- **A focus trap.** Tab and Shift+Tab cycle within the dialog. Not one of the
  thirteen implementations had this — Tab walked straight out into the page
  behind the scrim.
- **Focus restore** to whatever opened it. The dialog itself takes
  `tabindex="-1"` so it can hold focus when it contains nothing focusable.
- **Scroll lock** while any dialog is open; released when the last one closes.
- **Escape** closes the topmost dialog, **scrim click** dismisses, clicks on
  the panel do not.
- **`role="dialog"` and `aria-modal="true"`**, set on open and cleared on close.

Opt-in hooks: `data-modal-open="#id"` on a trigger wires it with no JS;
`data-modal-close` on any control inside dismisses; `data-modal-autofocus`
overrides which element receives focus.

**Focus must be moved asynchronously.** Several tools transition `all`, which
includes `visibility`, so for a frame or more after opening the panel is still
`visibility: hidden` and `focus()` is silently refused. The component retries
across frames until focus lands rather than assuming a fixed delay.

### Colour picker (`data-color-picker`) — done

```html
<div class="picker" data-color-picker data-value="#6739B7"
     data-alpha="false" data-label="icon background colour"></div>
```

```js
const picker = DevToolsMain.createColorPicker('#myPicker');
picker.setColor('#00D09C');       // drive it from a text field
picker.getColor();                // "#00D09C"
node.addEventListener('picker:change', ({ detail }) => detail.hex);
```

`<input type="color">` opens the operating system's dialog: it ignores the page
theme, has no alpha, and on Linux is a full modal. This is the same popover the
colour converter has always used, built from the design tokens and now owned by
the shared layer — a tool supplies one empty element and gets the swatch
trigger, the saturation/brightness pad, the hue and opacity rails and the
presets built for it.

The component provides:

- **Real range inputs** for hue and opacity, so those are keyboard and screen
  reader operable for free. Only the two-dimensional pad needs its own key
  handling (arrows step 1%, Shift 10%, Home/End for saturation).
- **Pointer events with capture** on the pad, so mouse, touch and pen share one
  path and a drag survives leaving the pad without a document listener running
  while idle.
- **Hue memory.** The pad holds `h` itself, because at `s=0` or `v=0` hue cannot
  be recovered from RGB — without it, dragging to black would snap the rail to
  red. `setColor()` keeps the current hue when the incoming colour is grey.
- **Dismissal** on outside click, Escape, or tabbing out, with focus restored
  to the trigger; one document-level listener covers every picker on the page.
- **Edge flipping**: a panel that would overflow the viewport anchors right.

`data-alpha="false"` drops the opacity rail for the cases — canvas fills, icon
backgrounds — where a translucent colour has no meaning. A tool that wants an
exact-value control keeps its own text field beside the swatch and mirrors the
two; the picker never owns text input.

### Type scale — done

| Role | Token / class | Treatment |
| --- | --- | --- |
| Page title | `.app-title`, `.app-header h1` | Gilroy 800, `--text-page-title`, yellow→purple gradient |
| Subtitle | `.app-subtitle` | Inter 400, `--text-md`, `--text-secondary` |
| Section heading | `h2`, `h3` | Gilroy 700, tight tracking |
| Panel labels | unchanged | small uppercase chrome, `--chrome-sm` |

Measured before consolidating, the page title rendered in **two faces**
(Gilroy / Inter), **three sizes** (32px / 38.4px / 30px), **two weights**
(700 / 800), and one tool had no gradient at all. Every tool also carried its
own mobile override.

**`--text-page-title` is a px clamp, not rem.** `file-compressor` and
`image-toolkit` set `html { font-size: 15px }`, so a rem-based title silently
rendered 2px smaller in those two. The clamp — `clamp(24px, 4vw, 32px)` —
also replaces the per-tool mobile overrides.

A gradient title is painted with a transparent fill over a clipped background,
so if the clip breaks it goes **invisible rather than wrong**. The tests assert
the title occupies space, not just that it has the right properties.

Child `<span>`s inside a title inherit the transparent fill and pick up the
parent gradient — `html-preview`'s two-tone markup needed no change.

`jwt-debugger` was the one structural outlier: its `<h1>` held the tagline and
the tool name sat in a small eyebrow above it. The name is now the `h1` and the
tagline is an `.app-subtitle`, matching every other tool.

### All components extracted

Dropdown · icons · split resizer · toast · modal · type scale.
Scrollbars were already tokenised. When adding a tool, use these rather than
writing local equivalents — that is how the drift documented above happened.
These currently exist as per-tool variants skinned by shared selector lists in
`main.css`; each should become a real component like `.dd`.
Scrollbars are already fully tokenised and shared.
