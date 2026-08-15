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
