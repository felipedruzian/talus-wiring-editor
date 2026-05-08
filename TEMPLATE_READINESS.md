# Template Readiness Checklist

This document lists the work needed before `ng-diagram-av-schematic` should be promoted as a recommended template for the ngDiagram community. Each item explains the problem, why it matters specifically for template adopters, the recommended action, and an effort estimate. Items are grouped by priority.

## What "Ready as Template" Means

A template is not just working code. It is a starting point that strangers will copy, adapt, and ship. The bar for templates is higher than for applications because:

- Adopters trust the template's conventions and propagate them across many projects.
- Adopters often skip the docs and assume the code teaches itself.
- Adopters report bugs and gaps publicly, which reflects on the maintainer's reputation.
- Adopters fork at a moment in time and may never pull future improvements.

Therefore a template must be runnable end to end, defended by automated checks, documented for contributors as well as users, and structured to scale beyond the demo's current scope.

## Priority Definitions

- **P0 Critical.** Block template promotion. These items either prevent adopters from succeeding or expose the template to immediate criticism.
- **P1 High.** Should ship before promotion. Quality issues that adopters will notice in the first hour.
- **P2 Medium.** Should ship soon after promotion. Polish that compounds over time.
- **P3 Low.** Nice to have. Polish that signals craft but does not block adoption.

## P0 Critical Items

### P0.1 Add ESLint with Angular and TypeScript Plugins

**Problem.** The project has no linter. `package.json` lists `prettier` only. Format is not enforced in CI. Code style violations are caught only on developer goodwill.

**Why It Matters For Template Adopters.** Adopters will fork this repo, add code, and discover within days that there is no automatic style enforcement. They will either add their own ESLint config (drift from the template) or skip linting entirely (technical debt). Either outcome reflects badly on the template author. Templates are expected to ship best practices preinstalled.

**Action.**

1. Install `angular-eslint`, `@typescript-eslint/eslint-plugin`, `eslint-plugin-import`.
2. Create `eslint.config.mjs` (flat config, ESLint 9 style) with the following rule sets:
   - `@angular-eslint/recommended`
   - `@angular-eslint/template/recommended`
   - `@typescript-eslint/strict-type-checked`
   - `@typescript-eslint/stylistic-type-checked`
3. Add npm scripts.
   ```json
   "lint": "eslint . --max-warnings=0",
   "lint:fix": "eslint . --fix"
   ```
4. Add a `lint` step to CI before `build`.
5. Fix all violations exposed by the initial run.

**Effort.** 2 to 4 hours including violation fixes.

### P0.2 Enforce Quality Gates in CI

**Problem.** [.github/workflows/ci.yml](.github/workflows/ci.yml) runs only `npm ci`, `npm run build`, `npm test`. There is no lint step, no format check, and no type-check step (the build incidentally type-checks but a dedicated `tsc --noEmit` is missing for spec files).

**Why It Matters For Template Adopters.** Adopters expect CI to fail on style issues. A green CI badge with no lint creates a false sense of safety. The first PR that breaks formatting will sail through review.

**Action.** Update `.github/workflows/ci.yml` to run, in order:

```yaml
- name: Format check
  run: npm run format:check

- name: Lint
  run: npm run lint

- name: Type check
  run: npm run type-check

- name: Test
  run: npm test

- name: Build
  run: npm run build
```

Add the missing scripts to `package.json`.

```json
"format:check": "prettier --check \"src/**/*.{ts,html,css,scss,md}\"",
"lint": "eslint . --max-warnings=0",
"type-check": "tsc --noEmit -p tsconfig.json"
```

**Effort.** 30 minutes.

### P0.3 Add Pre-commit Hooks via husky and lint-staged

**Problem.** No git hooks are configured. Developers can commit unformatted, unlinted code. The CI catches it after push, but only after wasted time and noise on the PR.

**Why It Matters For Template Adopters.** A template demonstrates the toolchain it endorses. Adopters who fork without husky will themselves never add it ("the original did not have it, must not be needed"). Templates create habits.

**Action.**

1. Install `husky`, `lint-staged`.
2. Add `prepare` script.
   ```json
   "prepare": "husky"
   ```
3. Create `.husky/pre-commit`.
   ```
   npx lint-staged
   ```
4. Add `lint-staged` config to `package.json`.
   ```json
   "lint-staged": {
     "*.{ts,html}": ["eslint --fix", "prettier --write"],
     "*.{css,scss,md,json}": ["prettier --write"]
   }
   ```
5. Document in README that contributors run `npm install` to install hooks.

**Effort.** 30 minutes.

### P0.4 Add Component and Service Test Coverage

**Problem.** The project has 50+ tests for the pure logic layer (`diagram/edge-reshaping/logic/` and `diagram/model/`). It has zero tests for Angular components, directives, and services. The handler, dispatcher, sidebars, forms, custom controls, and theme toggle are uncovered.

**Why It Matters For Template Adopters.** Templates teach by example. An adopter looking at `combobox.component.ts` to understand how to test a custom control will find nothing to learn from. They will then either skip testing (regression risk) or guess at patterns (drift). The template should demonstrate a Vitest test fixture for at least one component, one signal-based service, one directive, and one form.

**Action.** Write minimum exemplar tests covering:

1. **Component test.** [combobox.component.spec.ts](src/app/av-schematic/shared/combobox/combobox.component.spec.ts). Test open/close, keyboard navigation (ArrowDown, Enter, Escape), filter behavior, model binding. Use Angular's `TestBed` and `ComponentFixture`.
2. **Signal service test.** [properties-sidebar.service.spec.ts](src/app/av-schematic/properties-sidebar/properties-sidebar.service.spec.ts). Test computed `selectedNode`, `selectedEdge`, `sidebarState`. Mock `NgDiagramSelectionService` and `NgDiagramModelService`.
3. **Directive test.** [autofocus.directive.spec.ts](src/app/av-schematic/shared/autofocus/autofocus.directive.spec.ts). Test that focus is applied on signal change.
4. **Mutation service test.** [element-mutation.service.spec.ts](src/app/av-schematic/properties-sidebar/element-mutation.service.spec.ts). Test orphaned edge cleanup logic.
5. **Form test.** [device-form.component.spec.ts](src/app/av-schematic/shared/device-form/device-form.component.spec.ts). Test debounced field changes are emitted with the right payload.

These five tests model the patterns. Adopters extend from there.

**Effort.** 1 day for all five exemplar tests with helper utilities.

### P0.5 Add Persistence to the Library Sidebar

**Problem.** Edits to the device library are lost on page reload. [library.service.ts](src/app/av-schematic/library-sidebar/library.service.ts) keeps the device list in a `signal()` initialized from a static seed. There is no localStorage write or read.

**Why It Matters For Template Adopters.** A template demoing an editor where edits do not survive a refresh looks unfinished. The first thing every adopter will try is "edit a device, refresh, see if it sticks". When it does not, they will either fix it themselves (silent fork divergence) or assume the template is a toy demo (loss of trust).

**Action.** Add a `LibraryPersistenceService` that:

1. On startup, reads `localStorage.getItem('library')`. If present and parseable, hydrates the library signal.
2. Subscribes to `LibraryService.devices` via `effect()` and writes JSON to localStorage on change.
3. Provides a `reset()` method that clears localStorage and reloads from seed, exposed via a debug menu or a "Reset Library" button.

Schema versioning. Wrap stored data in `{ version: 1, devices: [...] }` so future schema changes can be migrated or rejected gracefully.

**Effort.** 2 hours including basic schema migration scaffold.

## P1 High Priority Items

### P1.1 Enable Zoneless Change Detection

**Problem.** [app.config.ts](src/app/app.config.ts) uses default zone-based change detection. The entire application is signal-first, OnPush everywhere, and uses no RxJS for state. This is the textbook scenario for `provideZonelessChangeDetection()` (stable in Angular 20+).

**Why It Matters For Template Adopters.** ngDiagram's main selling point in 2025 is performance with thousands of nodes. A template that does not opt into zoneless leaves performance on the table and signals to adopters that zoneless is "experimental and risky". The opposite is true. This template is the ideal demonstration.

**Action.**

1. Install nothing (built into `@angular/core` 20+).
2. Update [app.config.ts](src/app/app.config.ts).
   ```typescript
   import { provideZonelessChangeDetection } from '@angular/core';

   export const appConfig: ApplicationConfig = {
     providers: [
       provideZonelessChangeDetection(),
       provideBrowserGlobalErrorListeners(),
       provideRouter(routes),
     ],
   };
   ```
3. Remove `zone.js` from `polyfills` if explicitly listed (it is auto-included today; verify after the change).
4. Run the full app and exercise every feature. Watch for change detection bugs (rare but possible if any code accidentally relies on macrotask ticks).
5. Add a section to README explaining "This template runs zoneless".

**Effort.** 1 hour including manual smoke testing.

### P1.2 Tighten TypeScript Strictness

**Problem.** [tsconfig.json](tsconfig.json) enables `strict: true` and several Angular strict flags but is missing three high-value flags.

**Why It Matters For Template Adopters.** Templates set the bar for the project's lifetime. Tightening flags later is painful (forces fixes across the whole codebase). Tightening at template inception sets adopters up for success.

**Action.** Add to `compilerOptions`.

```json
"noUncheckedIndexedAccess": true,
"exactOptionalPropertyTypes": true,
"useDefineForClassFields": true
```

`noUncheckedIndexedAccess` is the most impactful. It will likely surface real bugs around `port?.label`-style access and `array[i]` use. Fix by adding explicit guards or non-null assertions where invariants hold.

`exactOptionalPropertyTypes` distinguishes `prop?: string` from `prop: string | undefined`. This matters for the model interfaces. Adopters extending the data shape will benefit from precise optionality.

`useDefineForClassFields` aligns class field initialization with the ECMAScript standard. Cosmetic but signals craft.

**Effort.** 2 to 4 hours depending on how many violations the codebase reveals.

### P1.3 Add Form Validation Examples

**Problem.** [debounced-form-controller.ts](src/app/av-schematic/shared/forms/debounced-form-controller.ts) does not configure validators. Forms accept anything. The only check is in [library-detail.component.ts:59](src/app/av-schematic/library-sidebar/components/library-detail/library-detail.component.ts) (`canSave` computed checks for non-empty manufacturer).

**Why It Matters For Template Adopters.** Adopters will need validation. Showing how to wire signal-form validators in `DebouncedFormController` is exactly the kind of thing a template should demonstrate.

**Action.** Extend `DebouncedFormController` to accept a `validators` option. Add at least one example validator (required field) on the `manufacturer` field. Display validation errors in the device form UI with `aria-invalid` and `aria-describedby` for accessibility.

**Effort.** 3 to 4 hours including UI work.

## P2 Medium Priority Items

### P2.1 Apply Structure Recommendations

See [STRUCTURE_RECOMMENDATIONS.md](STRUCTURE_RECOMMENDATIONS.md). Addresses three structural inconsistencies. Combined effort around 1 hour.

### P2.2 Wrap NgDiagram Event Listeners as Observables

**Problem.** [edge-endpoint-sync.service.ts](src/app/av-schematic/diagram/edge-reshaping/middleware/edge-endpoint-sync.service.ts) tracks `unsubscribers: Array<() => void>` manually because `NgDiagramService.addEventListener` returns a function, not an Observable. The rest of the codebase uses `takeUntilDestroyed()`. Style inconsistency.

**Why It Matters For Template Adopters.** A small util that wraps `addEventListener` into a `fromNgDiagramEvent$()` Observable would let this service follow the rest of the codebase's pattern. Templates should be internally consistent.

**Action.** Create `shared/utils/from-ng-diagram-event.ts`.

```typescript
export function fromNgDiagramEvent<T>(
  service: NgDiagramService,
  eventName: string
): Observable<T> {
  return new Observable<T>((subscriber) => {
    const unsubscribe = service.addEventListener(eventName, (event) => subscriber.next(event));
    return unsubscribe;
  });
}
```

Refactor `EdgeEndpointSyncService` to use it with `takeUntilDestroyed()`.

**Effort.** 1 hour.

### P2.3 De-duplicate Port Columns in Device Node Template

**Problem.** [device-node.component.html](src/app/av-schematic/diagram/node/device-node.component.html) lines 18 to 54 contain near-identical markup for input and output ports. Differences are limited to side, css class, and source array.

**Why It Matters For Template Adopters.** Adopters extending the node template (different shapes, more port types) will multiply the duplication. Showing how to factor this with a `PortColumnComponent` teaches a useful pattern.

**Action.** Extract a standalone `PortColumnComponent` that takes `ports` (signal input), `side: 'left' | 'right'`, and emits the per-port data. Use it twice in `DeviceNodeComponent`.

**Effort.** 1 hour.

## P3 Low Priority Items

### P3.1 Replace Magic Numbers with Named Constants

**Problem.** Several files use raw numbers (e.g., `event.button !== 0` for left mouse button check, `200` for animation timing).

**Action.** Extract to a `constants.ts` near the consumer. Names like `LEFT_MOUSE_BUTTON = 0`, `SIDEBAR_ANIMATION_MS = 200` improve readability.

**Effort.** 30 minutes total.

## Summary Checklist

Use this as a working checklist. Tick items as completed.

### Critical (block promotion)

- [ ] P0.1 Add ESLint with Angular and TypeScript plugins
- [ ] P0.2 Enforce quality gates in CI (lint, format check, type check)
- [ ] P0.3 Add pre-commit hooks via husky and lint-staged
- [ ] P0.4 Add component and service test coverage (5 exemplar tests)
- [ ] P0.5 Add persistence to the library sidebar (localStorage)

### High (ship before promotion)

- [ ] P1.1 Enable zoneless change detection
- [ ] P1.2 Tighten TypeScript strictness (3 additional flags)
- [ ] P1.3 Add form validation examples

### Medium (ship soon after promotion)

- [ ] P2.1 Apply structure recommendations (see STRUCTURE_RECOMMENDATIONS.md)
- [ ] P2.2 Wrap NgDiagram event listeners as Observables
- [ ] P2.3 De-duplicate port columns in device node template

### Low (polish)

- [ ] P3.1 Replace magic numbers with named constants

## Estimated Total Effort

- P0 Critical. About 2 days of focused work.
- P1 High. About 1 day of focused work.
- P2 Medium. About 0.5 day of focused work.
- P3 Low. Around 30 minutes.

Total. Around 3.5 to 4 working days to bring the template to reference quality. P0 alone (2 days) gets it to "ready to promote with caveats". P0 plus P1 (3 days) gets it to "ready to promote without caveats".

## After Promotion

Once promoted, expect:

- Issues from adopters who tried to use the template and hit gaps. Triage quickly.
- PRs from adopters proposing improvements. Review with the same standard you applied to the original code.
- Questions in discussions that reveal documentation gaps. Update README.
- Forks. Track via GitHub's network graph to see what features adopters are adding. Some may be worth pulling back upstream.

A good template is a living thing. Plan for ongoing maintenance, not a one-time release.
