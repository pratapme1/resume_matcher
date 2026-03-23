# Design System Strategy: The Living Document

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Digital Curator."** 

This is not a traditional interface; it is a high-end editorial experience that prioritizes content as a masterpiece. We move away from the rigid, "boxed-in" nature of SaaS dashboards toward a fluid, atmospheric layout. By utilizing intentional asymmetry, overlapping translucent layers, and a high-contrast typographic hierarchy, we create a sense of executive authority and technological grace. The layout should feel like a living document—dynamic, breathable, and deeply intentional.

## 2. Colors & The Mercury Theme
The palette is centered on a sophisticated "Mercury" spectrum. In dark mode, we utilize the deep obsidian of the `surface` token (#131313) to provide an infinite canvas, while light mode (implied via the Mercury theme) relies on soft, ethereal grays.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning or containment. Boundaries must be defined solely through background color shifts. For example, a content block should be defined by placing a `surface-container-low` section against a `surface` background. 

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers—stacked sheets of fine paper or frosted glass. 
- **Base Layer:** `surface` (#131313).
- **Secondary Content:** `surface-container-low`.
- **Primary Interaction Cards:** `surface-container-high`.
- **Floating Elements:** `surface-container-highest` with a `backdrop-blur`.

### The "Glass & Gradient" Rule
To elevate the experience beyond flat design, floating elements (modals, navigation bars) must use Glassmorphism. Utilize semi-transparent versions of `surface-variant` with a heavy `backdrop-blur`.
- **Signature Textures:** For primary calls to action, do not use flat fills. Apply a subtle linear gradient transitioning from `primary` (#ADC6FF) to `primary-container` (#4D8EFF) to provide a "lit-from-within" professional polish.

### Prism Blue Accent
The `primary` token (#3B82F6 / #ADC6FF) is our "Prism Blue." It is a high-energy pulse used sparingly. It should only appear for critical success states, primary actions, or as a subtle glow (5% opacity) behind hero elements to guide the eye.

## 3. Typography: Editorial Authority
Our typography is a dialogue between two distinct voices: the expressive serif and the functional sans.

- **The Voice (Newsreader/Playfair Display):** Used for all `display` and `headline` tokens. This serif choice brings a "New York Times" editorial prestige to the tech space. Use `display-lg` (3.5rem) to break the grid and create focal points.
- **The Engine (Inter):** Used for `title`, `body`, and `label` tokens. Inter provides the technical clarity required for data-heavy executive summaries.
- **Visual Contrast:** High contrast in scale is encouraged. Pair a `display-sm` headline with `body-sm` metadata to create an hierarchy that feels designed, not just "populated."

## 4. Elevation & Depth
Depth in this system is achieved through **Tonal Layering** rather than traditional structural lines.

- **The Layering Principle:** Stacking surface-container tiers creates a natural lift. A `surface-container-lowest` card placed on a `surface-container-low` section creates a soft, "submerged" depth.
- **Ambient Shadows:** When a floating effect is required (e.g., a dropdown), shadows must be extra-diffused. Use large blur values (spacing-10 or spacing-12) and a low-opacity (4%-8%) tint derived from the `on-surface` color. Avoid pure black shadows.
- **The Ghost Border:** If a boundary is strictly required for accessibility, use a "Ghost Border." This is the `outline-variant` token at 10% opacity. 100% opaque borders are strictly forbidden.
- **Glassmorphism:** Use `surface-bright` at 60% opacity with a 20px blur for any element that sits "above" the main document flow. This ensures the background colors bleed through, softening the edges of the UI.

## 5. Components

### Buttons
- **Primary:** Gradient fill (`primary` to `primary-container`), `rounded-md` (1.5rem), and `title-sm` Inter typography.
- **Secondary:** Transparent background with a "Ghost Border" (`outline-variant` at 20%). 
- **Tertiary:** Text-only using `primary` color, strictly for low-priority actions.

### Cards & Lists
- **Containers:** All cards must use `rounded-lg` (2rem) or `rounded-xl` (3rem) to eliminate "boxiness."
- **Separation:** Forbid the use of divider lines. Use vertical white space (spacing-6 or spacing-8) or a tonal shift to `surface-container-low` to separate items.

### Input Fields
- **Style:** "Submerged" look. Use `surface-container-highest` as the background with no border. Upon focus, transition to a subtle "Ghost Border" in `primary` blue.
- **Radii:** Always `rounded-md`.

### Chips
- **Selection:** Use `secondary-container` with `on-secondary-container` text. These should feel like small, smooth pebbles—pill-shaped (`rounded-full`) and tactile.

### Executive Dashboards (Special Component)
- **Data Overlays:** Inter `label-sm` text placed on a semi-transparent `surface-container-low` glass pane. This allows complex data to feel "light" and integrated into the editorial layout.

## 6. Do's and Don'ts

### Do:
- **Use Negative Space:** If you think there is enough whitespace, add 20% more. Space is a luxury brand's best friend.
- **Asymmetric Balance:** Align a large serif headline to the left and a small data table to the right, leaving "dead" space in the middle to emphasize the "Living Document" feel.
- **Tonal Depth:** Rely on the `surface-container` scale for all hierarchy needs.

### Don't:
- **No Boxy Containers:** Never use a 90-degree corner. The minimum radius is `rounded-sm` (0.5rem), but the standard is `rounded-md` (1.5rem).
- **No Heavy Dividers:** Never use a 100% opaque line to separate content. It kills the "fluid tech" aesthetic.
- **No Overuse of Prism Blue:** If the screen looks "Blue," you have used too much. It should be a surgical strike of color.
- **No Standard Grids:** Avoid the "3-column card grid" cliché. Vary card widths and heights to mimic a magazine layout.