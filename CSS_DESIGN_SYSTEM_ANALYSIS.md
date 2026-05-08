# CSS and Design System Analysis

This document captures the high-impact CSS findings from a deep audit of the design system in `ng-diagram-av-schematic`. The audit covered the 862-line `tokens.css`, typography, theming mechanism, component SCSS, font loading, focus states, asset strategy, and writing-mode readiness.

The token foundation inherited from ng-diagram is professional and follows the DTCG layered pattern (primitives → semantic → component). Theming via `data-theme` attribute is implemented correctly. Component SCSS uses pseudo-BEM, has no `::ng-deep`, no `!important`, no deeply nested selectors. Modern CSS features (`color-mix`, `:has`, `display: contents`) are used where appropriate.

This file focuses only on the four highest-impact issues. Smaller observations from the audit are intentionally omitted.

## Priority Definitions

- **P1 High.** Should ship before promoting the template. Real impact on bundle size, accessibility, or maintainability.
- **P2 Medium.** Quality improvement. Easy to fix.
- **P3 Low.** Polish.

## P1.1 Trim Font Variants from 38 to 4

**Problem.** [index.html:16-18](src/index.html#L16-L18) loads Poppins from Google Fonts with all 19 weight variants in both italic and regular styles. That is 38 font files. The CSS only uses 4 weights (400, 500, 600, 700) based on the audit of every component SCSS file.

**Why It Matters.** Each font variant is a separate woff2 download. Even with HTTP/2 multiplexing, this wastes roughly 80% of font bandwidth on weights that are never rendered. On slow networks this is the difference between LCP at 1.5 seconds and LCP at 3 seconds. For a template that is meant to set best practices, shipping 80% wasted asset weight is a poor signal.

There is also no `preconnect` to the Google Fonts hosts, which adds an extra round trip before fonts can start downloading.

**Action.**

1. Trim the URL to the four weights actually used:

   ```html
   <link rel="preconnect" href="https://fonts.googleapis.com">
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
   <link
     href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
     rel="stylesheet"
   />
   ```

2. If italic is used anywhere (audit suggests not), add `ital,wght@0,400;0,500;0,600;0,700;1,400` instead.

3. As a follow-up, consider tokenizing the font family in `tokens.css`:

   ```css
   :root {
     --font-family-sans: 'Poppins', system-ui, sans-serif;
   }
   ```

   Then [styles.css:16](src/styles.css#L16) uses `var(--font-family-sans)`. This makes font swap a one-line change for adopters.

**Effort.** 15 minutes for the URL change. Another 30 minutes if tokenizing the family.

## P1.2 Use the Focus Ring Tokens That Already Exist

**Problem.** [tokens.css:297-301](src/tokens.css#L297-L301) defines focus ring tokens (`--ngd-focus-ring-element`, `--ngd-focus-ring-node-active`, `--ngd-focus-ring-node-error`, `--ngd-focus-ring-node-warning`). A grep across the entire codebase finds **zero usages** of these tokens. Buttons, inputs, comboboxes, and ports rely on the browser default focus outline, which clashes visually with the rest of the polished UI.

**Why It Matters.** Two problems compound here.

First, accessibility. Keyboard users (including users with motor disabilities and power users who never touch the mouse) need a clear focus indicator on every interactive element. The browser default is functional but not styled to fit. Some browsers render it inconsistently.

Second, design system integrity. Defining tokens and never using them is worse than not defining them at all. It signals to adopters that the design system is incomplete or untrustworthy. Adopters then write their own focus styles, drifting from the system.

**Action.**

1. Add a global focus style in [styles.css](src/styles.css) using the existing tokens:

   ```css
   :focus-visible {
     outline: 2px solid var(--ngd-focus-ring-element);
     outline-offset: 2px;
     border-radius: 2px;
   }

   /* Reset for elements that draw their own focus indicator */
   button:focus-visible,
   input:focus-visible,
   select:focus-visible,
   textarea:focus-visible,
   [role='button']:focus-visible,
   [role='combobox']:focus-visible {
     outline: 2px solid var(--ngd-focus-ring-element);
     outline-offset: 2px;
   }
   ```

2. Audit interactive components and remove any `outline: none` that suppresses focus visibility (this is a common anti-pattern hidden in older code).

3. For the bend handles in `WireEdgeComponent` and the device node selection in `DeviceNodeComponent`, add explicit focus styles using the relevant `--ngd-focus-ring-node-*` token.

4. Test the entire UI with keyboard only. Tab through every interactive element and verify the focus indicator is visible.

**Effort.** 2 hours including a full keyboard pass.

## P2.1 Consolidate SVG Icons into a Sprite

**Problem.** The codebase has 28 separate SVG icons in `src/assets/`. They are referenced from component SCSS via `mask-image: url('...')`. Each icon is a separate HTTP request, separate cache entry, separate parser pass. Examples:

- `mask-image: url('../../../assets/sun.svg')` ([theme-toggle.component.scss:14](src/app/av-schematic/top-navbar/theme-toggle.component.scss#L14))
- `mask-image: url('../../../../assets/plus.svg')` ([ports-editor.component.scss:119](src/app/av-schematic/shared/ports-editor/ports-editor.component.scss#L119))
- `mask-image: url('../../../../../assets/sidebar.svg')` ([sidebar-header.component.scss:39](src/app/av-schematic/properties-sidebar/components/sidebar-header/sidebar-header.component.scss#L39))

The relative path counts (`../../../`, `../../../../`, `../../../../../`) also reveal the asset path is fragile. Refactoring a component folder breaks SVG references silently.

**Why It Matters.** Three problems compound.

First, network. With HTTP/2 the parallelism mitigates the cost, but each SVG is still a separate cache entry to invalidate and a separate decode. Bundling them into one file removes 27 round trips on cold cache.

Second, refactor fragility. The `../` chains are tied to the file's depth. Moving a component breaks every icon reference. The compiler does not catch it, the test suite does not catch it (no styling tests), it only fails visually at runtime.

Third, theming. SVG used as `mask-image` cannot be styled internally (you can only set the mask color). Inline SVG can be styled with CSS, support multi-color icons, and respond to theme changes without separate light and dark variants.

**Action.** Pick one of two approaches.

**Option A. SVG sprite with `<use href="#id">`.** Combine all icons into one `assets/icons.svg` with `<symbol id="...">` elements. Reference from templates:

```html
<svg class="icon" aria-hidden="true">
  <use href="/assets/icons.svg#sun"></use>
</svg>
```

CSS controls color via `fill: currentColor`. One HTTP request, cached forever, clean references.

**Option B. Inline SVG icon component.** Create `IconComponent` that takes a `name` input and renders the corresponding SVG inline:

```typescript
@Component({
  selector: 'app-icon',
  template: `
    @switch (name()) {
      @case ('sun') { <svg viewBox="0 0 24 24"><path d="..." /></svg> }
      @case ('moon') { <svg viewBox="0 0 24 24"><path d="..." /></svg> }
      <!-- etc -->
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  readonly name = input.required<IconName>();
}
```

Pros. Type safety on icon names. Multi-color icons possible. No extra HTTP request.

Cons. Larger initial bundle. Less suitable if there are many icons (50+).

**Recommended.** Option A for this codebase. 28 icons is not enough to bloat the bundle if inlined, but the sprite pattern is the standard solution for this scale and demonstrates a transferable pattern for adopters.

**Effort.** 3 hours including the sprite build, replacing all 28 references, and verifying visual parity.

## P2.2 Adopt Logical Properties for RTL Readiness

**Problem.** Across the entire codebase, only **two** uses of CSS logical properties exist (`padding-block-end` in [device-form.component.scss](src/app/av-schematic/shared/device-form/device-form.component.scss) and [wire-form.component.scss](src/app/av-schematic/properties-sidebar/components/wire-form/wire-form.component.scss)). Everywhere else uses physical properties: `padding-left`, `padding-right`, `margin-top`, `border-bottom`, `text-align: right`, and so on.

**Why It Matters.** RTL readiness is roughly 5%. For an audio video schematic editor used globally (Arabic, Hebrew, and Persian markets all have AV integration firms), a layout that does not flip in RTL is a real adoption blocker.

Beyond RTL, logical properties are simply more semantic. `margin-inline-start` says "the start of the inline axis", which adapts to the writing mode. `margin-left` says "the left side regardless of context", which is rigid. Modern CSS prefers logical properties for any code that might encounter rotated text, vertical writing modes, or RTL languages.

This is also a transferable pattern. Adopters copying this template will inherit the convention. If the template uses physical properties, every adopter project starts behind on RTL.

**Action.** Refactor in two phases.

**Phase 1. New code only.** Establish the convention "all new SCSS uses logical properties". Add a brief note to [STRUCTURE_RECOMMENDATIONS.md](STRUCTURE_RECOMMENDATIONS.md) or a new `STYLE_GUIDE.md` documenting the rule. Optionally configure a stylelint rule once stylelint is added to the project (it is not currently).

**Phase 2. Sweep existing code.** Mechanically replace physical properties with logical equivalents:

| Physical | Logical |
|---|---|
| `margin-left` | `margin-inline-start` |
| `margin-right` | `margin-inline-end` |
| `margin-top` | `margin-block-start` |
| `margin-bottom` | `margin-block-end` |
| `padding-left` | `padding-inline-start` |
| `padding-right` | `padding-inline-end` |
| `padding-top` | `padding-block-start` |
| `padding-bottom` | `padding-block-end` |
| `border-left` | `border-inline-start` |
| `border-right` | `border-inline-end` |
| `border-top` | `border-block-start` |
| `border-bottom` | `border-block-end` |
| `left: 0` | `inset-inline-start: 0` |
| `right: 0` | `inset-inline-end: 0` |
| `top: 0` | `inset-block-start: 0` |
| `bottom: 0` | `inset-block-end: 0` |
| `text-align: left` | `text-align: start` |
| `text-align: right` | `text-align: end` |
| `width: X` | `inline-size: X` |
| `height: X` | `block-size: X` |

For shorthand `padding: 10px 20px 10px 20px`, switch to `padding-block: 10px; padding-inline: 20px`. For `margin: 0 auto`, that is already mode-agnostic and can be left.

After the sweep, smoke test by adding `dir="rtl"` to `<html>` temporarily and checking the layout flips correctly. Sidebars should swap sides, icons should mirror, text should align to the new start edge.

**Effort.** 4 hours for the sweep across ~25 SCSS files. Add another 1 hour for an RTL smoke test and any visual fixes.

## Summary Checklist

### High (ship before promotion)

- [ ] P1.1 Trim font variants from 38 to 4
- [ ] P1.2 Use the focus ring tokens that already exist

### Medium (ship soon after promotion)

- [ ] P2.1 Consolidate SVG icons into a sprite
- [ ] P2.2 Adopt logical properties for RTL readiness

## Estimated Total Effort

About 1.5 days of focused work for all four items. P1.1 alone is 15 minutes and worth doing immediately for the bandwidth win.

## What Else Was Audited

For transparency, the audit also looked at typography (sparse, not yet a token system), motion (no tokens, hardcoded durations everywhere), spacing (good primitives, no semantic layer), responsive design (none, desktop-only), token discoverability (no comments or docs in the 862-line `tokens.css`), and several other areas. These were judged lower priority and are not included here per the scope agreed for this document. They can be addressed later if and when the template's adopter feedback identifies pain points.
