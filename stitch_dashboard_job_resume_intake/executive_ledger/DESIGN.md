# Design System Specification: The Executive Monograph

## 1. Overview & Creative North Star
**Creative North Star: "The Digital Curator"**
This design system moves away from the cluttered, "SaaS-standard" dashboard and toward the refined authority of a premium editorial publication. The goal is to make the user feel like they are interacting with a high-end physical dossier or a private concierge service.

The aesthetic breaks the "template" look by prioritizing **intentional asymmetry**—large, high-contrast serif headlines paired with expansive whitespace and tight, functional sans-serif metadata. We eschew traditional UI boundaries in favor of tonal depth, creating a layout that feels architectural and bespoke rather than modular and generic.

---

## 2. Colors & Surface Logic
The palette is rooted in the "Midnight & Sand" concept, utilizing deep charcoals and warm off-whites to create a sophisticated, low-fatigue environment for executive focus.

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders to section content. Boundaries must be defined through background color shifts.
*   **Primary Background:** `surface` (#faf9f8)
*   **Secondary Sectioning:** `surface-container-low` (#f4f3f2)
*   **Tertiary Accents:** `secondary` (#50635a) for forest green depth or `tertiary_fixed_dim` (#e9c176) for muted gold highlights.

### Surface Hierarchy & Nesting
Treat the UI as a series of stacked, fine-paper layers.
*   **Base Level:** `surface`
*   **In-Page Modules:** Use `surface-container` (#eeeeed) to group related content.
*   **Elevated Focus Elements:** Use `surface-container-lowest` (#ffffff) to make cards "pop" against a sand background without using a shadow.

### The "Glass & Texture" Rule
For floating menus or executive overlays, use Glassmorphism:
*   **Surface:** `surface_variant` at 80% opacity.
*   **Effect:** `backdrop-blur: 12px`.
*   **Soul:** Use a subtle linear gradient from `primary` (#000000) to `primary_container` (#1c1b1b) for high-impact CTAs to avoid the "flat" look of cheaper interfaces.

---

## 3. Typography
The typography scale creates an immediate sense of prestige by contrasting the intellectual weight of a serif with the technical precision of a sans-serif.

| Level | Font Family | Size | Intent |
| :--- | :--- | :--- | :--- |
| **Display-LG** | Newsreader | 3.5rem | Editorial impact / Hero moments |
| **Headline-MD** | Newsreader | 1.75rem | Section headers / Narrative beats |
| **Title-MD** | Inter | 1.125rem | Interface labels / Navigation |
| **Body-LG** | Inter | 1.0rem | Long-form executive summaries |
| **Label-SM** | Inter | 0.6875rem | Metadata / Technical data points |

*   **Editorial Contrast:** All narrative "Phase" descriptions use Newsreader. All interactive "Tool" elements use Inter.
*   **Tight Tracking:** For `label-` tokens, use `-0.02em` letter spacing to maintain a modern, "tight" executive feel.

---

## 4. Elevation & Depth
We reject the standard "Drop Shadow" in favor of **Tonal Layering**.

*   **The Layering Principle:** Depth is achieved by placing a `surface-container-lowest` card on a `surface-container-low` background. This creates a "soft lift."
*   **Ambient Shadows:** If a floating element (like a modal) is required, use a `24px` blur with 4% opacity of the `on-surface` color. It should feel like a soft glow, not a dark edge.
*   **The Ghost Border Fallback:** If accessibility requires a stroke, use `outline-variant` at 15% opacity. Never use a 100% opaque border.

---

## 5. Components

### The Phase Indicator (Signature Component)
Instead of a generic progress bar, use a "Chronicle Track."
*   **Style:** A horizontal or vertical line using `outline-variant`. 
*   **Active State:** The current phase is marked with a sharp, 2px square indicator in `secondary` (Forest Green).
*   **Typography:** Label the phase in `label-md` (Inter, All Caps, 0.05em tracking).

### Buttons
*   **Primary:** Solid `primary` (#000000) background, `on-primary` (#ffffff) text. Radius: `sm` (0.125rem). 
*   **Secondary:** No background. `outline-variant` Ghost Border. High-contrast label.
*   **Interaction:** On hover, shift background from `primary` to `primary_container`. No "bounce" animations—use subtle 200ms ease-in-out fades.

### Input Fields
*   **Form:** Forgo the box. Use a simple bottom-border (Ghost Border style) that transforms into a `secondary` (Forest Green) 2px line on focus.
*   **Typography:** Input text should be `body-lg` to ensure readability for executive users.

### Cards & Lists
*   **Rule:** Forbid divider lines.
*   **Implementation:** Use `Spacing Scale 6` (2rem) between list items. Use a subtle `surface-container-highest` background on hover to indicate interactivity.

---

## 6. Do’s and Don’ts

### Do:
*   **Embrace Asymmetry:** Align high-level headings to the left while keeping functional data in a narrower, centered column.
*   **Use Generous White Space:** If you think there is enough space, add `Spacing Scale 4` more.
*   **Tonal Transitions:** Use background colors to guide the eye from "Context" (Sand) to "Analysis" (Slate/Grey).

### Don't:
*   **Don't use "AI" Gradients:** No purple-to-blue neon. Use solid, confident `Midnight` or `Forest` colors.
*   **Don't use Rounded Corners:** Avoid the "bubbly" look. Keep all radii at `sm` (2px) or `none`.
*   **Don't use Pure Black Text on Pure White:** Use `on-surface` (#1a1c1c) on `surface` (#faf9f8) to maintain the premium, organic "paper" feel.