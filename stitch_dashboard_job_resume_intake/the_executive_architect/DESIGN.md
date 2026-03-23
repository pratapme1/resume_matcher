# Design System Strategy: High-End Editorial Intelligence

## 1. Overview & Creative North Star: "The Digital Curator"
This design system is built on the philosophy of **The Digital Curator**. It rejects the generic, rounded "SaaS-standard" aesthetic in favor of a high-contrast, sharp-edged environment that mirrors the precision of a bespoke architectural blueprint and the gravitas of a global business journal.

The system breaks the "template" look by using **intentional asymmetry** and **typographic tension**. By pairing a utilitarian Sans (Manrope) with an intellectual Serif (Newsreader), we create a dialogue between data and insight. The UI is not a collection of boxes; it is a curated canvas where content is separated by tonal shifts and negative space rather than rigid lines.

---

## 2. Colors & Tonal Depth
The palette is rooted in `surface` (#0b1326) and `primary_container` (#2563eb), creating a high-authority, nocturnal environment.

### The "No-Line" Rule
**Explicit Instruction:** Do not use 1px solid borders for sectioning or containment. 
Structure must be defined through:
- **Background Color Shifts:** Use `surface_container_low` for secondary sections sitting on a `surface` background.
- **Negative Space:** Utilize the Spacing Scale (e.g., `spacing-8` or `spacing-12`) to create mental boundaries.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Hierarchy is achieved by "stacking" container tiers:
- **Level 0 (Base):** `surface` (#0b1326) – The canvas.
- **Level 1 (Sectioning):** `surface_container_low` (#131b2e) – To define large content areas.
- **Level 2 (Cards/Modules):** `surface_container` (#171f33) – For primary interactive modules.
- **Level 3 (Prominence):** `surface_container_highest` (#2d3449) – For active states or high-priority flyouts.

### The "Glass & Gradient" Rule
To prevent the dark UI from feeling "flat," use **Glassmorphism** for floating elements (e.g., navigation bars, modals). Apply `surface_bright` with a 60% opacity and a `backdrop-blur` of 20px. 
*Signature Polish:* Use a subtle linear gradient on main CTAs, transitioning from `primary_container` (#2563eb) to `primary` (#b4c5ff) at a 45-degree angle to simulate light hitting a high-end material.

---

## 3. Typography: The Intellectual Dialogue
We use typography to distinguish between "System/Data" and "Insight/Narrative."

*   **Newsreader (Serif):** Used for `display`, `headline`, and editorial insights. This font carries the "Executive" weight. It should be typeset with slightly tighter letter-spacing (-2%) to feel modern.
*   **Manrope (Sans):** Used for `title`, `body`, and `label`. This is the "Architect" component—clean, geometric, and highly legible for data points.

**Scale Highlights:**
- **Display-LG:** `newsreader`, 3.5rem. Use for high-impact hero statements.
- **Title-MD:** `manrope`, 1.125rem. Use for data labels and navigation items.
- **Body-SM:** `manrope`, 0.75rem. Use for metadata, utility text, and micro-copy.

---

## 4. Elevation & Depth
In this design system, "Up" does not mean "Shadow." It means "Lighter."

### The Layering Principle
Depth is achieved by stacking. A `surface_container_lowest` card placed on a `surface_container_low` background creates a "sunken" architectural effect. Conversely, placing `surface_container_high` on `surface` creates a natural "lift."

### Ambient Shadows
Shadows are a last resort. When used (e.g., for a floating menu), they must be:
- **Color:** `on_background` at 8% opacity.
- **Blur:** 40px to 60px.
- **Spread:** -10px.
This creates a "glow" of light occlusion rather than a harsh drop shadow.

### The "Ghost Border" Fallback
If contrast testing (WCAG) requires a border, use a **Ghost Border**: `outline_variant` at 15% opacity. It should feel like a suggestion of an edge, not a cage.

---

## 5. Components

### Buttons
- **Primary:** Sharp edges (0px radius). Background: `primary_container`. Text: `on_primary_container`. On hover, transition to `primary_fixed` with a 200ms ease-in-out.
- **Secondary:** Ghost style. No background. Border: 1px `outline_variant` at 20% opacity. Text: `primary`.
- **Tertiary:** Text only. `manrope` bold, all caps, `label-md` scale.

### Cards & Lists
- **Rule:** Forbid divider lines. 
- **Execution:** Use `spacing-4` (1.4rem) of vertical white space to separate list items. For cards, use `surface_container` to distinguish the card area from the `surface` background.

### Input Fields
- **Style:** Underline only. Use `outline_variant` for the default state (1px). On focus, the line transforms into `primary` (2px).
- **Labels:** Always use `manrope` `label-sm` in `on_surface_variant`.

### The "Executive Insight" Module (Custom Component)
A specific layout pattern: A `surface_container_low` background with a left-accent "Velocity Blue" (`primary_container`) vertical bar (4px wide). Typography inside uses `newsreader` `headline-sm` for the insight text.

---

## 6. Do's and Don'ts

### Do
- **Do** use sharp 0px corners for everything. It communicates precision.
- **Do** lean into extreme white space. If a layout feels "full," it isn't premium enough.
- **Do** use `newsreader` for any text that is meant to be "read" (articles, quotes, summaries).
- **Do** use `manrope` for any text that is meant to be "processed" (numbers, buttons, labels).

### Don't
- **Don't** use a border when a tonal shift in `surface_container` will suffice.
- **Don't** use standard "Blue" links in a paragraph. Use `on_surface` with a `primary` underline.
- **Don't** use heavy shadows. The system should feel like a physical desk, not a floating cloud.
- **Don't** use any border radius. Even a 2px radius breaks the architectural authority of this system.

### Accessibility Note
While we prioritize high-end aesthetics, ensure that the contrast between `on_surface` and `surface_container` tiers meets a minimum of 4.5:1 for body text. Use `primary_fixed` for interactive elements that require high visibility against dark backgrounds.