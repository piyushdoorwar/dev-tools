# DevTools Design System — flat console

DevTools shares its design language with the author's other projects: one UI
face, solid surfaces, hairline borders, neutral elevation and small radii.
What stays DevTools' own is the colour: **purple** and **yellow**.

All values below are tokens in [`assets/tokens.css`](../assets/tokens.css) —
the single source for the dashboard shell (`styles.css`) and every tool
(`tools/main.css` imports it). Never hardcode a hex, radius, shadow or font in
a tool stylesheet when a token exists.

## Colour

| Role | Token | Value |
| --- | --- | --- |
| Active / selected / structural accent | `--accent-purple` / `--accent-purple-light` | `#6739B7` / `#8B5CF6` |
| The one primary CTA per screen | `--accent-yellow` (ink: `--accent-yellow-ink`) | `#FFD700` |
| Success · error · warning · info | `--accent-green` · `--accent-pink` · `--accent-orange` · `--accent-blue` | |
| Purple tints (selected rows, chips) | `--accent-soft` · `--accent-softer` · `--accent-line` | 14% · 7% · 34% |

- **Purple** = where you are: selected tab (solid fill, white text), current
  nav item, focus ring, selected row (`--accent-soft` + `--accent-line`).
- **Yellow** = what to press: one solid `.btn-primary` per screen, the
  current-tool marker, pinned state. Never a large fill or a gradient.
- No new hues. Gradients only where they encode data (pickers, hue rails,
  strength meters, previews) and in the two brand marks below.

## Surfaces & lines

| Token | Use |
| --- | --- |
| `--bg` `#0b0b0f` | page |
| `--surface` | resting panel / card |
| `--surface-2` | inset: fields, editors, panel heads |
| `--surface-3` | raised: menus, hovered rows |
| `--border` | 1px purple-tinted hairline on a surface edge |
| `--border-light` / `--border-strong` | hover, framed surfaces (modals) |
| `--divider` | rules *inside* a surface (header bottoms, row separators) |

Elevation is neutral: `--shadow-e1` resting, `--shadow-e2` raised/hover,
`--shadow-e3` dialogs. Colour is never used for depth — no glows. Blur is
only spent on the modal scrim.

## Type

- **DM Sans** (`--font-body`) for all UI, **JetBrains Mono** (`--font-mono`)
  for code. Both are self-hosted in `assets/fonts/` (SIL OFL 1.1) — no
  third-party font requests.
- Headings weight 600 with negative tracking (`--tracking-tight`,
  `--tracking-title`); body 13–14px at 400–500; buttons 13px / 500.
- Small caps labels: 11px / 600 / uppercase / `--tracking-caps` /
  `--text-muted` (`.meta-label`).
- Text: `--heading` titles, `--text` body, `--text-secondary` supporting,
  `--text-muted` secondary, `--text-hint` placeholders and hints (still AA).

## Shape & motion

- Radius: `--radius-control` 6px (inputs, buttons, chips), `--radius-card`
  8px (cards, inner blocks, menus), `--radius-panel` / `--radius-modal` 12px,
  `--radius-xs` 4px for tiny badges.
- Controls 36px (`--control-h`), 32px small; 44px on coarse pointers.
- Hover changes border and surface, never position. Press feedback is
  `translateY(1px)`. No lifts, bounces or looping decoration.
- `prefers-reduced-motion`, `prefers-reduced-transparency` and
  `prefers-contrast: more` are honoured. **Token overrides for these must live
  in `assets/tokens.css`**: a `:root` override inside a cascade layer always
  loses to the unlayered tokens (that is why the contrast and coarse-pointer
  overrides never applied before).

## Brand marks

- **Page title** — solid `--heading` text with a 4px purple→yellow bar drawn
  by `::before` (shared layer). Not gradient-clipped text.
- **Modal** — a short 2px purple→yellow marker at the top-left edge.

## Common components

| Need | Use |
| --- | --- |
| Button | `.btn` + `.btn-primary` (yellow) · `.btn-accent` (purple) · `.btn-secondary` · `.btn-ghost` · `.btn-danger` · `.btn-sm` |
| Icon button | `.icon-btn`, `.action-btn`, `.toolbar-btn`, `.info-btn` |
| Segmented control | `.segmented` / `.mode-switcher` containing `.mode-btn` / `.segment-btn` / `.tab-button` |
| Panel | `.ui-surface`, `.ui-surface-head`, `.ui-inset` |
| Chip / label | `.ui-tag`, `.ui-tag--accent`, `.meta-label`, `.kbd` |
| Status | `.badge` / `.status-pill` with `.success` `.error` `.warning` `.info`, `.badge--dot` |
| Dropdown, colour picker, modal, toast, tooltip, resizer | see below |

A tool keeps its own *layout* (grid, flex, widths, positions) and uses these
for *appearance*. If a tool needs a variant, add it here rather than
re-skinning locally.

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
| `.dd__menu--wrap` | Wrap long option labels and preserve each row's height in scrolling menus. |
| `.dd__option--stacked` | Stack an option's label and supporting text, aligned to the start. |
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

The shared header is always a single flex row: the title stays on the left and
the close control stays on the right. Tools should not reimplement that layout.
The short gradient marker at the header's top-left is the common modal accent.
Top-level heading/content pairs inside `.legend-intro` receive a full section
gap so one section never runs into the previous card.

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

### Hash state (`DevToolsMain.writeHashState`) — done

```js
DevToolsMain.writeHashState('icons');              // -> …/#icons
DevToolsMain.readHashState();                      // -> 'icons'
DevToolsMain.onHashState((value) => show(value));  // deep links, back/forward
```

A tool with more than one view (tabs, modes) puts the view in the hash, so the
view is linkable and survives a reload. Three rules make it work:

- **`replaceState`, never `pushState`.** A tab switch is not a navigation, and
  inside the dashboard's iframe pushing history entries hijacks the shell's own
  back button.
- **The shell mirrors it.** A tool page runs in an iframe whose URL is
  invisible, so `writeHashState` also posts `devtools:hash-change` to the
  parent; `app.js` replays it into the address bar (`/image-toolkit/#icons`)
  and hands the hash back to the frame on the next load. Without this, a reload
  of the dashboard route lands on the tool's default view.
- **Unknown values fall back.** `#nonsense` selects the default view rather
  than rendering nothing, and a hash that names a tool (`/#jwt-debugger`) is
  still treated by the shell as the legacy route form, not as view state.

Handle both the first load and `hashchange`: the shell reassigns the frame's
`src` with a new hash, which is a same-document navigation, so an already-built
frame is not reloaded.

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
| Page title | `.app-title`, `.app-header h1` | DM Sans 600, `--text-page-title`, solid `--heading`, purple→yellow `::before` bar |
| Subtitle | `.app-subtitle` | DM Sans 400, `--chrome-base`, `--text-muted` |
| Section heading | `h2`, `h3` | DM Sans 600, `--tracking-title` |
| Panel labels | unchanged | small uppercase chrome, `--chrome-sm` |

Measured before consolidating, the page title rendered in **two faces**,
**three sizes** and **two weights**, and every tool carried its own mobile
override.

**`--text-page-title` is a px clamp, not rem.** `file-compressor` and
`image-toolkit` set `html { font-size: 15px }`, so a rem-based title silently
rendered smaller in those two. The clamp — `clamp(20px, 3.2vw, 24px)` —
also replaces the per-tool mobile overrides.

The title used to be gradient-clipped text, which goes **invisible rather than
wrong** when the clip breaks. It is now solid text; the brand colour lives in
the `::before` bar, which keeps the title selectable and always legible.

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
