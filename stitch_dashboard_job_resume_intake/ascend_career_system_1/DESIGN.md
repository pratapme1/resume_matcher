# Design System Specification: Editorial Kinetic

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Intelligent Atelier."** 

This system rejects the "SaaS-template" aesthetic in favor of a high-end, bespoke digital workspace. It combines the authoritative weight of a premium editorial publication with the fluid, layered depth of a futuristic interface. By marrying the structural grace of **Newsreader** (Serif) with the functional precision of **Manrope** (Sans), we create an environment that feels like a high-end consultant’s private office: focused, quiet, and profoundly intelligent.

### Breaking the Template
To achieve an "Editorial Kinetic" feel, designers must:
*   **Embrace Asymmetry:** Avoid perfectly centered grids. Use the `24` (8.5rem) spacing token to create intentional "white space lungs" that let content breathe.
*   **Scale Contrast:** Pair massive `display-lg` headlines with tiny, precise `label-sm` metadata to create a sense of hierarchy and drama.
*   **Kinetic Depth:** Elements should not sit *on* the screen; they should exist *within* a pressurized environment of light and glass.

---

## 2. Colors & Tonal Architecture
Our palette, **Slate & Cobalt**, moves away from generic neutrals into a sophisticated, cool-toned spectrum.

### The "No-Line" Rule
**Standard 1px borders are strictly prohibited for sectioning.** Boundaries must be defined through background color shifts. To separate a sidebar from a main feed, use `surface-container-low` against a `surface` background. If you feel the need for a line, use space instead.

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked sheets of fine paper or frosted glass.
*   **Base:** `surface` (#0b1326) / `surface-dim`.
*   **Sectioning:** `surface-container-low` (#131b2e) for secondary regions.
*   **Interaction Hubs:** `surface-container` (#171f33) or `surface-container-high` (#222a3d) for the primary workspace.
*   **Floating Elements:** `surface-container-highest` (#2d3449) with glassmorphism.

### The "Glass & Gradient" Rule
For high-impact areas (Hero sections, Progress Trackers), use a subtle linear gradient:
`linear-gradient(135deg, primary-container 0%, primary 100%)`
This adds a "visual soul" that flat hex codes cannot replicate. Floating panels should use `surface-bright` with a 60% opacity and a `backdrop-filter: blur(20px)` to simulate premium frosted glass.

---

## 3. Typography: The Editorial Voice
The system uses a bi-font strategy to balance tradition and technology.

| Role | Token | Font | Size | Weight / Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Display** | `display-lg` | Newsreader | 3.5rem | High-drama editorial statements. |
| **Headline** | `headline-md` | Newsreader | 1.75rem | Authoritative section headers. |
| **Title** | `title-lg` | Manrope | 1.375rem | Functional, bold navigation titles. |
| **Body** | `body-md` | Manrope | 0.875rem | The workhorse for all deep reading. |
| **Label** | `label-sm` | Manrope | 0.6875rem | All-caps, tracked out (+5%) for metadata. |

**Pairing Logic:** Use Newsreader for the "Story" (headers, quotes, insights) and Manrope for the "System" (data, inputs, labels).

---

## 4. Elevation & Depth
We convey importance through **Tonal Layering** rather than structural geometry.

*   **The Layering Principle:** Depth is achieved by "stacking." A `surface-container-lowest` card placed on a `surface-container-low` section creates a soft, natural lift without the "dirty" look of heavy shadows.
*   **Ambient Shadows:** For floating menus, use an extra-diffused shadow: `box-shadow: 0 20px 40px rgba(0, 0, 0, 0.12);`. The shadow color should be a tinted version of the surface color, never pure black.
*   **The Ghost Border:** If a border is required for accessibility, use the `outline-variant` token at 15% opacity. High-contrast, 100% opaque borders are forbidden as they "trap" the kinetic flow of the layout.

---

## 5. Components

### Buttons: The Kinetic Action
*   **Primary:** Uses the `primary-container` (#2e5bff) with `on-primary-container`. Corner radius: `DEFAULT` (4px). Include a subtle `0.5rem` glow on hover using the `primary` color.
*   **Secondary:** Glass-style. `surface-bright` at 10% opacity with a `backdrop-filter`.
*   **Tertiary:** Pure text using `primary` color, `label-md` specs, with a 1px underline that expands on hover.

### Inputs: The Focused Field
*   **Styling:** No bottom line. Use `surface-container-highest` with a `none` border. 
*   **State:** On focus, the background remains, but a 1px "Ghost Border" of `primary` appears at 40% opacity.

### Cards & Lists: The No-Divider Standard
*   **Forbid Dividers:** Do not use lines to separate list items. Use the spacing scale (`1.5` or `2`) to create clear groupings.
*   **Editorial Cards:** Use `surface-container-low`. Top-align the `label-sm` metadata, followed by a `headline-sm` title. This "top-heavy" alignment mimics high-end magazine layouts.

### New Component: The "Insight Rail"
A vertical, slim container (`surface-container-lowest`) used on the far right of the workspace for persistent, high-level metrics (e.g., "Career Velocity"). It uses `glassmorphism` to feel like an overlay rather than a fixed sidebar.

---

## 6. Do’s and Don’ts

### Do:
*   **Do** use `Newsreader` for any text that is meant to be "consumed" or "reflected upon."
*   **Do** use the `16` (5.5rem) spacing token between major vertical sections to create a "Master Edition" sense of luxury.
*   **Do** apply `4px` (`DEFAULT`) radius to small elements (chips, buttons) and `8px` (`lg`) to larger containers (cards, modals).

### Don’t:
*   **Don’t** use pure black (#000000) for shadows; it kills the "Slate & Cobalt" atmosphere. Use a dark navy tint.
*   **Don’t** use center-alignment for headlines. Stick to a sophisticated left-flush editorial grid.
*   **Don’t** use standard "Blue" links. Use the `primary` token (#b8c3ff) and lean on the typography weight to signify interactivity.

---

## 7. Spacing Strategy
Space is our primary "structural material." 
*   **Gutter:** Use `6` (2rem) for standard grid gutters.
*   **Section Breathing:** Use `12` (4rem) to separate distinct content modules.
*   **Micro-spacing:** Use `1.5` (0.5rem) to group labels with their corresponding data points.

By strictly adhering to the spacing scale and the "No-Line" rule, the design system maintains a sense of "Kinetic" flow—unburdened by boxes, yet perfectly organized.