# Design System Specification: The Executive Architect

## 1. Overview & Creative North Star
**Creative North Star: "The Editorial Authority"**

This design system moves away from the generic, "boxy" nature of standard SaaS platforms to embrace an editorial, high-end career coaching aesthetic. We treat the user’s career journey not as a series of data points, but as a prestigious portfolio. 

The system breaks the "template" look through **intentional asymmetry**, where heavy headlines are balanced by wide-open whitespace. We use **tonal layering** instead of rigid borders to create a sense of architectural depth—as if the interface is constructed from stacked layers of premium vellum and frosted glass. The result is an experience that feels sophisticated, authoritative, and deeply trustworthy.

---

## 2. Colors & Tonal Depth
Our palette is rooted in a command-level `primary` (#003466) to establish immediate trust, supported by a sophisticated range of `surface` tones that define the layout’s structure.

### The "No-Line" Rule
**Explicit Instruction:** 1px solid borders are strictly prohibited for sectioning or container definition. 
Boundaries must be defined solely through background color shifts. For instance, a `surface-container-low` section should sit directly on a `surface` background. If you feel the need for a line, increase the padding or shift the tonal value of the nested container instead.

### Surface Hierarchy & Nesting
Treat the UI as a physical stack. Each inner container should use a progressively higher or lower tier to define importance:
*   **Base Layer:** `surface` (#f8f9fb)
*   **Secondary Sections:** `surface-container-low` (#f2f4f6)
*   **Actionable Cards:** `surface-container-lowest` (#ffffff)
*   **Navigation/Overlays:** `surface-bright` (#f8f9fb) with Glassmorphism.

### The Glass & Gradient Rule
To prevent a "flat" feel, use **Backdrop Blurs** (`blur-xl`) on floating navigation elements using `surface` at 80% opacity. For primary CTAs and Hero sections, apply a subtle linear gradient:
*   **Signature Gradient:** `primary` (#003466) to `primary-container` (#1a4b84) at a 135-degree angle. This adds a "soul" to the interface that flat hex codes cannot replicate.

---

### 3. Typography
We utilize a dual-typeface system to balance character with utility.

*   **Display & Headlines (Manrope):** Chosen for its geometric precision and modern "tech-executive" feel.
    *   `display-lg` (3.5rem): Reserved for high-impact hero statements.
    *   `headline-md` (1.75rem): Used for section titles, providing an editorial rhythm.
*   **Body & Labels (Inter):** The workhorse of the system. 
    *   `body-lg` (1rem): Standard reading size for career descriptions.
    *   `label-md` (0.75rem): Used for metadata and overlines in `primary` or `secondary` color tokens.

**The Editorial Scale:** Always pair a `headline-sm` with a `label-sm` (uppercase with 0.05em tracking) positioned *above* the headline to create a sophisticated, curated look.

---

## 4. Elevation & Depth
We eschew traditional drop shadows in favor of **Ambient Light Layering.**

*   **The Layering Principle:** Place a `surface-container-lowest` card on a `surface-container-low` background. The shift from #f2f4f6 to #ffffff creates a natural, soft lift.
*   **Ambient Shadows:** For "floating" elements (modals, dropdowns), use a shadow with a 32px blur, 0px offset, and 6% opacity using the `on-surface` color. This mimics natural light rather than a digital "drop shadow."
*   **The Ghost Border Fallback:** If a container requires definition against an identical background for accessibility, use `outline-variant` (#c3c6d1) at **15% opacity**. Never use 100% opaque borders.

---

## 5. Components & Data Visualization

### Detailed Data Cards
*   **Structure:** No dividers. Use `8` (2rem) padding and vertical whitespace to separate header from body.
*   **Background:** `surface-container-lowest`.
*   **Success Green:** Use `tertiary_fixed` (#a3f69c) for score backgrounds with `on_tertiary_fixed` (#002204) text to indicate high career-match scores.

### Progress Bars
*   **Track:** `surface-container-highest` (#e0e3e5) with a `full` (9999px) radius.
*   **Indicator:** A gradient from `secondary` (#466270) to `primary` (#003466).
*   **Height:** Keep slim (8px) for a modern, refined look.

### File Upload Zones (The "Drop-Glass" Zone)
*   Instead of a dashed line, use a `surface-container-low` background with a `Ghost Border` (15% opacity `outline`).
*   On hover, transition the background to `secondary-container` (#c6e4f4) to provide encouraging, soft feedback.

### Input Fields & Controls
*   **Inputs:** `surface-container-low` background, no border. On focus, a subtle 1px "Ghost Border" at 40% opacity appears.
*   **Buttons:** 
    *   **Primary:** `primary` (#003466) with `on_primary` text. Use `xl` (0.75rem) roundedness for a modern but professional feel.
    *   **Secondary:** `surface-container-high` (#e6e8ea) with `on_surface`.

---

## 6. Do’s and Don’ts

### Do
*   **Do** use asymmetrical margins. For example, a left-aligned headline with a right-aligned description creates a high-end layout.
*   **Do** use `tertiary` (#003d0b) for positive career growth indicators. It should feel like a "Success Green" but stay sophisticated.
*   **Do** embrace whitespace. If a section feels crowded, use the `16` (4rem) spacing token rather than adding a divider line.

### Don't
*   **Don't** use pure black (#000000). Always use `on_surface` (#191c1e) for text.
*   **Don't** use standard "Shadow-MD" or "Shadow-LG" presets. Stick to the Ambient Shadow rules (low opacity, high blur).
*   **Don't** use 100% opaque borders to separate list items. Use a `surface-container-low` background shift or 1.5rem of vertical space.