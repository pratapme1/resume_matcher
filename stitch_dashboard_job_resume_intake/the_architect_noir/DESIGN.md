```markdown
# Design System Strategy: The Architect

## 1. Overview & Creative North Star: "The Silent Authority"
This design system is not a set of components; it is a philosophy of space. Our Creative North Star is **The Silent Authority**. Like a masterwork of brutalist architecture softened by moonlight, the UI must feel immovable yet weightless. 

We break the "template" look by rejecting the grid as a cage. Instead, we use **Intentional Asymmetry**. Large-scale typography acts as a structural anchor, while expansive negative space (white space) creates a vacuum that pulls the user’s eye to high-priority content. We do not use lines to define containers; we use the "void" and subtle tonal shifts to imply boundaries. The result is a bespoke, editorial experience that feels curated rather than generated.

## 2. Colors & Tonal Depth
The palette is a study in Noir—deep, atmospheric, and high-contrast.

*   **Primary Surface:** `surface` (#0A0E14) – A deep midnight that absorbs light.
*   **The Accent:** `secondary` (#939EB4) and `outline` (#6A768A) – Derived from Slate Blue, used sparingly to guide the eye without breaking the monochromatic immersion.
*   **The "No-Line" Rule:** 1px solid borders are strictly prohibited for sectioning. To separate content, transition from `surface` to `surface-container-low` (#0E141C). Hierarchy is felt, not seen.
*   **Surface Hierarchy & Nesting:** Treat the interface as layers of fine material.
    *   *Base Level:* `surface-dim` (#0A0E14).
    *   *Mid-Level (Content Sections):* `surface-container` (#121A25).
    *   *High-Level (Interactive Cards):* `surface-container-highest` (#1A2637).
*   **The Glass & Gradient Rule:** For floating navigation or elevated modals, use `surface-bright` (#1E2D41) at 60% opacity with a `20px` backdrop blur. Main CTAs should utilize a subtle linear gradient from `primary` (#C6C6C7) to `primary-dim` (#B8B9B9) to create a metallic, "lathed" finish.

## 3. Typography: The Editorial Voice
Typography is our primary tool for architectural structure. We pair a wide, authoritative Sans-Serif with a soulful, high-contrast Serif.

*   **Display & Headlines (Plus Jakarta Sans):** These are the "beams" of the building. Use `display-lg` (3.5rem) with wide letter-spacing to command attention. They should often be placed with asymmetrical margins to create a modern, editorial feel.
*   **Body & Title (Noto Serif):** The "human" element. Use `body-lg` (1rem) for long-form content. The high contrast of the Serif adds a layer of luxury and traditional craftsmanship to the digital space.
*   **Labels (Plus Jakarta Sans):** Small, all-caps labels using `label-sm` (0.6875rem) provide a technical, "blueprint" aesthetic to functional elements.

## 4. Elevation & Depth
In a Noir system, shadows are not black; they are depths of blue and light.

*   **The Layering Principle:** Avoid `elevation-1/2/3` naming. Use the **Tonal Stack**: Place a `surface-container-highest` element over a `surface` background. The change in hex value is enough to signify a "lift."
*   **Ambient Shadows:** If a floating element requires a shadow, use a color derived from `on-surface` at 4% opacity with a blur radius of `40px`. It should feel like a soft glow of light being blocked, not a drop-shadow.
*   **The "Ghost Border" Fallback:** For accessibility in form inputs, use `outline-variant` (#3C495B) at 20% opacity. It should be barely perceptible, appearing only as a suggestion of an edge.
*   **Glassmorphism:** Navigation bars must use a semi-transparent `surface-container` with a heavy backdrop blur. This allows content to bleed through as the user scrolls, maintaining a sense of atmospheric continuity.

## 5. Components

### Buttons
*   **Primary:** A "Solid Slab." Background: `primary` (#C6C6C7), Text: `on-primary` (#3F4041). Shape: `rounded-md` (0.75rem). No shadow.
*   **Secondary:** The "Ghost." Background: Transparent, Border: 1px `outline-variant` at 20% opacity, Text: `primary`.
*   **Tertiary:** Text-only in `label-md`. Interaction is signaled by a 2px underline that expands from the center on hover.

### Input Fields
*   **Structure:** No background. A single 1px line using `outline-variant` at the bottom of the field only.
*   **States:** On focus, the line transitions to `secondary` (#939EB4) and the `label-sm` floats above in `primary` white.

### Cards & Lists
*   **No Dividers:** Lists are separated by `spacing-4` (1.4rem) of vertical "air." 
*   **Nesting:** Cards should be `surface-container-low` (#0E141C) with a `rounded-lg` (1rem) corner radius. To highlight a featured item, shift its background to `surface-container-high` (#16202E).

### Signature Component: The "Architectural Spacer"
Use `spacing-24` (8.5rem) between major sections. This extreme padding is the hallmark of luxury. It forces the user to breathe and process one piece of information at a time.

## 6. Do’s and Don’ts

### Do:
*   **Use extreme white space.** If a section feels "tight," double the padding.
*   **Align to the edges.** Use the wide Sans-Serif headlines to "frame" the content.
*   **Mix weights.** Pair a Bold wide Sans headline with a Light Serif body for a high-end contrast.

### Don't:
*   **Never use pure black (#000000).** It kills the atmospheric depth of the Midnight Navy.
*   **Avoid "Floating" Boxes.** If you use a card, ensure it feels integrated into the background via tonal shifting, not like a sticker slapped on top.
*   **No heavy icons.** Use ultra-thin (1pt) stroke icons that match the `outline` color. Thick icons break the "Architect" aesthetic.
*   **No harsh animations.** Transitions should be long (300ms-500ms) with a `cubic-bezier(0.2, 0, 0, 1)` easing for a cinematic feel.```