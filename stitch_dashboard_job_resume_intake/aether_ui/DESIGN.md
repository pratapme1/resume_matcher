```markdown
# Design System Specification: Cinematic Intelligence

## 1. Overview & Creative North Star
**Creative North Star: The Sentient Interface**
This design system rejects the "flat web" in favor of a three-dimensional, cinematic experience. It is designed to feel like a high-end tactical display from a near-future sci-fi epic—authoritative, precise, and deeply immersive. We move beyond "templates" by utilizing intentional asymmetry, edge-to-edge layouts, and a "light-in-the-dark" philosophy where the interface doesn't just sit on the screen; it glows within a void.

The system breaks traditional grids by layering high-energy neon accents against an obsidian abyss, using depth and motion to guide the user’s eye rather than rigid containment.

---

## 2. Colors & Surface Philosophy

### Palette Breakdown
*   **Base (Obsidian):** `surface` (#131313) and `surface_container_lowest` (#0e0e0e). This is the "void" that provides the infinite depth of the system.
*   **Primary (Cyber Lime):** `primary_fixed` (#c3f400). Use this for high-energy highlights, critical data points, and primary actions.
*   **Tertiary (Electric Violet):** `tertiary_fixed_dim` (#dfb7ff). Use for secondary data streams or "analytical" status indicators.
*   **On-Surface (The Glow):** `on_surface` (#e5e2e1). Text is never pure white; it is a soft, high-contrast grey that prevents eye fatigue in dark environments.

### The "No-Line" Rule
**1px solid borders are strictly prohibited for sectioning.** To define boundaries, use:
1.  **Tonal Shifts:** Place a `surface_container_high` (#2a2a2a) element against a `surface` (#131313) background.
2.  **Luminous Separation:** Use a soft 48px vertical margin (Spacing Scale `12`) to allow content to breathe.
3.  **Shadow Depth:** Use ambient, wide-spread shadows to "lift" elements rather than boxing them in.

### The "Glass & Glow" Rule
To achieve the "Cinematic" feel, interactive panels must utilize **Glassmorphism**. Use `surface_variant` (#353534) at 40% opacity with a `backdrop-filter: blur(20px)`. 
*   **Signature Texture:** For Hero CTAs, apply a linear gradient from `primary` to `primary_container`.
*   **Edge Illumination:** Instead of a border, apply a 1px inner-glow using `outline_variant` (#444933) at 20% opacity to simulate light catching the edge of a glass pane.

---

## 3. Typography: The "Tech-Lab" Editorial
The typographic soul of this system is the tension between the cinematic and the mathematical.

*   **The Display Layer (Epilogue):** Used for `display` and `headline` scales. This ultra-bold, wide sans-serif provides the "authoritative" cinematic weight. It should be tracked tightly (-2%) to feel dense and powerful.
*   **The Data Layer (Space Grotesk):** Used for `title`, `body`, and `label` scales. This mono-spaced leaning font provides the "tech-lab" precision. It should be used for all functional information and data readouts.

**Hierarchy Strategy:**
*   Large `display-lg` headings should be treated as architectural elements, often overlapping background textures or images.
*   Small `label-sm` text should be used generously for "metadata" (e.g., timestamps, coordinates, version numbers) to reinforce the sci-fi aesthetic.

---

## 4. Elevation & Depth: Tonal Layering

### The Layering Principle
We do not use structural lines. Depth is achieved by "stacking" the surface-container tiers:
1.  **Background:** `surface_dim` (#131313)
2.  **Sectioning:** `surface_container_low` (#1c1b1b)
3.  **Interactive Cards:** `surface_container_highest` (#353534)

### Ambient Shadows
When an element must float (e.g., a modal or a primary chip), use an ultra-diffused shadow:
*   **Shadow:** `0px 20px 50px rgba(0, 0, 0, 0.6)`
*   **Accent Glow:** For critical alerts, add a secondary outer glow using the `primary` token at 10% opacity: `0px 0px 15px rgba(171, 214, 0, 0.2)`.

### The Ghost Border
If accessibility requires a container boundary, use a **Ghost Border**: `outline_variant` at 15% opacity. This creates a "suggestion" of a container without breaking the immersive flow.

---

## 5. Components

### Buttons (The "Power Cells")
*   **Primary:** Background `primary_fixed`, Text `on_primary_fixed`. No border. On hover, add a `primary` outer glow.
*   **Secondary (Glass):** Background `surface_variant` (40% opacity + blur), Ghost Border (20%), Text `primary`.
*   **Tertiary:** No background. Text `on_surface`. Underline only on hover with a 2px `primary` stroke.

### Input Fields (The "Terminal")
*   **Style:** No "box." Only a bottom stroke (2px) using `outline_variant`.
*   **Active State:** The bottom stroke transitions to `primary`, and a subtle `primary` gradient (5% opacity) fades upward from the line.
*   **Font:** Always use `spaceGrotesk` (`body-md`) for input text.

### Cards & Modules
*   **Rule:** Forbid divider lines.
*   **Separation:** Use Spacing Scale `8` (2.75rem) to separate content blocks.
*   **Shape:** Use Roundedness `xl` (0.75rem) for a sophisticated, molded feel, or `none` for a brutalist, edge-to-edge cinematic look. Avoid `md` or `sm` as they feel "standard."

### Supplemental Component: The "Data Scrubber"
A custom slider for navigating timelines or data sets. Use a `primary` thin horizontal line (1px) with a `primary_fixed` vertical bar (4px wide) as the handle, emitting a faint glow.

---

## 6. Do’s and Don’ts

### Do:
*   **Use Asymmetry:** Offset text blocks and images to create a dynamic, editorial feel.
*   **Embrace the Dark:** Allow large areas of `surface_container_lowest` to exist. Negative space is your strongest tool for "sophistication."
*   **Animate Transitions:** Elements should "fade and slide" or "blur-in," never just snap into existence.

### Don’t:
*   **Don't use 100% Opaque Borders:** This immediately kills the immersive "Cinematic" vibe and makes the UI feel like a standard SaaS dashboard.
*   **Don't Use Standard Icons:** Avoid "rounded" or "playful" icons. Use sharp, geometric, "thin-stroke" icons that match the `outline` token.
*   **Don't Overuse the Neon:** The `primary` neon color is a weapon. Use it sparingly for maximum impact. If everything glows, nothing is important.

---

## 7. Spacing & Rhythm
Use the provided scale to create "high-pressure" and "low-pressure" zones.
*   **High Pressure:** Use Spacing `1` and `2` for data density in "lab" sections.
*   **Low Pressure:** Use Spacing `16` (5.5rem) and `20` (7rem) to separate major narrative sections. This creates the "breathing room" found in high-end cinema.```