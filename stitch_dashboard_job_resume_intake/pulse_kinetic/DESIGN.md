# Design System Specification: Kinetic Fluidity

## 1. Overview & Creative North Star: "The Digital Pulse"
This design system rejects the static, boxy constraints of traditional enterprise software. Our Creative North Star is **The Digital Pulse**—an aesthetic where data flows like liquid and interfaces breathe. We move beyond "The Template" by using intentional asymmetry, overlapping translucent layers, and high-contrast typographic scales.

The goal is to evoke the "Future of Work": an environment that feels high-tech and precise, yet organic and responsive. We achieve this by prioritizing **Tonal Layering** over borders and **Kinetic Energy** over static alignment.

---

### 2. Colors & Surface Philosophy
The palette is built on a deep monochromatic foundation, punctuated by a singular, high-vibrancy "Energy" accent (`primary`).

*   **The "No-Line" Rule:** 1px solid borders are strictly prohibited for sectioning. Structural boundaries must be defined solely by shifts in background tokens (e.g., a `surface-container-low` card resting on a `surface` background).
*   **Surface Hierarchy & Nesting:** Treat the UI as stacked sheets of frosted glass. 
    *   **Base:** `surface` (#131315)
    *   **Sunken Elements:** `surface-container-lowest` (#0e0e10)
    *   **Raised Elements:** `surface-container-high` (#2a2a2c)
*   **The Glass & Gradient Rule:** Floating modals and navigation rails must utilize Glassmorphism. Use semi-transparent `surface-variant` with a `backdrop-blur` of 20px–40px. 
*   **Signature Textures:** Main CTAs should not be flat. Apply a linear gradient from `primary` (#cabeff) to `primary-container` (#5d3fd3) at a 135° angle to create a sense of internal luminescence.

---

### 3. Typography: The Editorial Impact
We pair the aggressive, ultra-wide `spaceGrotesk` with the utilitarian precision of `manrope`.

*   **Display & Headlines (`spaceGrotesk`):** Use for impact. These should feel architectural. `display-lg` (3.5rem) is our primary tool for establishing a "Magazine" feel in hero sections.
*   **Body & Technicals (`manrope`):** Used for sustained reading. The `body-md` (0.875rem) provides the legibility required for high-tech data environments.
*   **Labels (`spaceGrotesk`):** Small caps or wide-spaced labels in `label-md` convey a "technical readout" aesthetic, perfect for metadata and status indicators.

---

### 4. Elevation & Depth
Depth is a functional tool, not a decoration. We use **Tonal Layering** to define the Z-axis.

*   **The Layering Principle:** To create a "lifted" card, place a `surface-container-highest` object on a `surface-container` background. The subtle 2-3% shift in luminosity is sufficient for the human eye to perceive hierarchy without the "noise" of a border.
*   **Ambient Shadows:** For high-priority floating elements (Tooltips/Modals), use a "Long Shadow" approach:
    *   Blur: 40px–60px
    *   Opacity: 6%
    *   Color: Tonal `on-surface` (#e5e1e4), never pure black.
*   **The "Ghost Border" Fallback:** If accessibility requirements demand a stroke, use `outline-variant` (#484554) at 15% opacity. It should be felt, not seen.
*   **Kinetic Glass:** When an element is hovered, increase the `backdrop-blur` and shift the background from `surface-container-high` to `surface-bright` to simulate a "glow" from beneath the glass.

---

### 5. Components

#### **Buttons**
*   **Primary:** Gradient fill (`primary` to `primary-container`). Roundedness: `full`. No border. Text: `label-md` in `on-primary`.
*   **Secondary:** Glass-fill. `surface-variant` at 20% opacity + `backdrop-blur`. 
*   **Tertiary:** Ghost style. No background, `primary` text. Use for low-emphasis actions.

#### **Input Fields**
*   **Structure:** No bottom line. Use `surface-container-low` with a `md` (0.75rem) corner radius.
*   **Active State:** Transition background to `surface-container-high`. The cursor (caret) should be the `primary` "energy" color.
*   **Error:** Background shifts to `error_container` at 10% opacity; text uses `error`.

#### **Cards & Lists**
*   **No Dividers:** Forbid the use of horizontal rules. Use vertical whitespace (Spacing `8` or `10`) to separate list items.
*   **Interaction:** On hover, a card should scale slightly (1.02x) and shift to `surface-container-highest`.

#### **The "Pulse" Progress Bar (Signature Component)**
Instead of a flat loading bar, use a `primary` to `tertiary` gradient string that "pulses" in width and opacity, mimicking a heart rate or data stream.

---

### 6. Do’s and Don’ts

#### **Do:**
*   **Do** use asymmetrical margins (e.g., Spacing `16` on the left, Spacing `8` on the right) for editorial layouts.
*   **Do** lean into `primary-fixed-dim` for disabled states to keep the "energy" visible but muted.
*   **Do** use `spaceGrotesk` for numbers to give data a "high-end instrument" look.

#### **Don't:**
*   **Don't** use 100% opaque black or white. Always use the `surface` and `on-surface` tokens to maintain the tonal depth.
*   **Don't** use standard drop shadows. If it doesn't look like ambient light, it doesn't belong.
*   **Don't** use more than one "Energy" color per screen. If `primary` is used for the CTA, use `secondary` for secondary indicators to avoid visual exhaustion.

---

### 7. Spacing & Rhythm
We use a non-linear spacing scale to create "breathing rooms."
*   **Micro-spacing (`0.5` to `2`):** For internal component relationships (label to input).
*   **Macro-spacing (`12` to `24`):** For section breaks. Large-scale negative space is a luxury signal; do not be afraid to leave large areas of `surface` empty to draw focus to the "Energy" accent.