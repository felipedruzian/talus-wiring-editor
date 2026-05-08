# Project Structure Recommendations

This document describes proposed refactors to the folder structure of `ng-diagram-av-schematic`. The current structure is logical and predictable in 80 percent of places. The remaining 20 percent contains three concrete inconsistencies that break the mental model for newcomers reading the project for the first time. Each recommendation below explains what the inconsistency is, why it matters, and how to fix it with minimal disruption.

## Current Structure Overview

```
src/app/
├── app.component.ts
├── app.config.ts
├── app.routes.ts
└── av-schematic/
    ├── av-schematic.config.ts
    ├── pages/                         // composition root for the feature
    ├── diagram/                       // canvas + node + edge + model
    │   ├── model/
    │   ├── node/
    │   ├── node-visibility/
    │   └── edge-reshaping/
    │       ├── commands/
    │       ├── directives/
    │       ├── handlers/
    │       ├── logic/
    │       └── middleware/
    ├── library-sidebar/
    │   └── components/
    ├── properties-sidebar/
    │   └── components/
    │       ├── sidebar-header/
    │       ├── sidebar-placeholder/
    │       └── wire-form/
    ├── top-navbar/
    │   ├── theme-toggle.component.ts  // flat
    │   └── export-menu/                // foldered
    ├── minimap-panel/
    ├── export/
    │   ├── dxf/
    │   └── dxf-av-schematic/
    └── shared/
        ├── autofocus/
        ├── combobox/
        ├── device-form/                // misplaced (domain leak)
        ├── form-field/
        ├── forms/
        ├── ports-editor/
        ├── sidebar-shell/
        └── random-short-id.ts
```

## Recommendation 1. Symmetrize Property Forms

### Problem

`properties-sidebar/components/` contains `wire-form/` but not `device-form/`. The device form lives at `shared/device-form/`. When you open the properties sidebar to find the form for editing a node, you find only the wire form. You then need to grep the codebase to discover that node editing lives in a folder named `shared`. This breaks the principle of locality of behavior. Two functionally equivalent forms live in two different places.

### Why It Matters

The `shared/` folder is conventionally reserved for generic, reusable building blocks (combobox, form-field, autofocus directive, utility functions). `device-form/` is heavily domain specific. It depends on `DEVICE_CATEGORIES`, port mappers, and device data interfaces. Calling it "shared" misleads readers into thinking it is a primitive. It is not. It is a feature component used by two consumers.

The asymmetry also creates friction during code review and pair programming. When a senior reviewer mentions "the node form", a junior reads "properties-sidebar" first and finds nothing. Time wasted compounds across team interactions.

### Recommended Action

Pick one of two equally valid approaches.

**Option A. Promote to first-class feature.**

Create a sibling feature folder for the form, since it is consumed by two features.

```
av-schematic/
├── device-form/                  // new sibling
│   ├── device-form.component.{ts,html,scss}
│   ├── device-form.service.ts
│   └── device-form.mappers.ts
├── library-sidebar/              // imports from ../device-form
└── properties-sidebar/           // imports from ../device-form
```

Pros. Clean separation. Both consumers import symmetrically. The form has a clear owner in the file tree.

Cons. Adds another top-level folder under `av-schematic/`.

**Option B. Place under primary consumer.**

Move device-form to `properties-sidebar/components/device-form/` next to `wire-form/`. Allow `library-sidebar` to cross-import.

```
properties-sidebar/components/
├── device-form/                  // moved here
├── sidebar-header/
├── sidebar-placeholder/
└── wire-form/

library-sidebar/components/library-detail/library-detail.component.ts
  // imports DeviceFormComponent from '../../../properties-sidebar/components/device-form/...'
```

Pros. Restores symmetry inside properties-sidebar. Smaller diff.

Cons. Cross feature import. Some teams find this uncomfortable, but it is a normal pattern when one feature owns the implementation and another reuses it.

**Recommended.** Option A. The form is owned by neither sidebar exclusively. Promotion to a first-class feature reflects reality.

### Steps

1. Create `src/app/av-schematic/device-form/` directory.
2. Move all files from `src/app/av-schematic/shared/device-form/` to the new directory.
3. Update imports in [library-detail.component.ts](src/app/av-schematic/library-sidebar/components/library-detail/library-detail.component.ts) and [properties-sidebar.component.ts](src/app/av-schematic/properties-sidebar/properties-sidebar.component.ts).
4. Run `npm test` and `npm run build` to verify.

### Effort

15 minutes. Mechanical move plus import updates.

## Recommendation 2. Symmetrize Sub Components in Top Navbar

### Problem

[top-navbar/](src/app/av-schematic/top-navbar/) contains two sub components placed inconsistently.

```
top-navbar/
├── top-navbar.component.{ts,html,scss}
├── theme-toggle.component.{ts,html,scss}    // flat
└── export-menu/                              // foldered
    └── export-menu.component.{ts,html,scss}
```

Two sub components, two conventions. The reader cannot predict where the next sub component will live without reading the existing files. Predictability is the whole point of a structural convention.

### Why It Matters

Inconsistent placement seems trivial in a 2-component scenario. It scales badly. The third sub component's author has to make a decision (folder or flat?) and is biased by whichever pattern they happened to read first. The codebase drifts. Six months later you have half of the sub components in folders and half flat with no logical reason behind the split.

### Recommended Action

Adopt the rule "every sub component lives in its own folder". This is the dominant convention in modern Angular projects and aligns with the existing `library-sidebar/components/` and `properties-sidebar/components/` patterns.

### Steps

1. Create `src/app/av-schematic/top-navbar/theme-toggle/` directory.
2. Move all three theme-toggle files into it.
3. Update import in [top-navbar.component.ts](src/app/av-schematic/top-navbar/top-navbar.component.ts).
4. Optionally also create `top-navbar/components/` to fully match the sidebar pattern, although for two children this is overkill.

### Effort

5 minutes.

## Recommendation 3. Subdivide the Shared Folder

### Problem

After Recommendation 1 removes `shared/device-form/`, the `shared/` folder still mixes three abstraction levels.

```
shared/
├── autofocus/                       // generic directive
├── combobox/                        // generic UI control
├── form-field/                      // generic UI control
├── forms/                           // generic helper
│   └── debounced-form-controller.ts
├── ports-editor/                    // semi-domain (uses DevicePort type)
├── sidebar-shell/                   // semi-domain (sidebar styling)
│   └── _sidebar-shell.scss
└── random-short-id.ts               // generic util at root
```

Pure UI primitives, generic utilities, and semi-domain components live as siblings. A newcomer asking "what is this folder for?" cannot answer without reading every entry.

### Why It Matters

A `shared/` folder without internal organization becomes a magnet for dumping. Every new developer adds something they think is reusable. Six months later, `shared/` has 40 entries spanning 5 abstraction levels. The folder loses meaning. It becomes "things I did not know where else to put".

The fix is preventive. Establish the subdivision now while there are 7 entries, not later when there are 40.

### Recommended Action

Split into four predictable subfolders.

```
shared/
├── ui/                              // visual building blocks
│   ├── combobox/
│   ├── form-field/
│   └── ports-editor/                // moved here, see note below
├── directives/                      // standalone behavioral directives
│   └── autofocus/
├── forms/                           // form infrastructure
│   └── debounced-form-controller.ts
├── styles/                          // SCSS partials and mixins
│   └── _sidebar-shell.scss
└── utils/                           // pure functions
    └── random-short-id.ts
```

`ports-editor/` is a borderline case. It uses the `DevicePort` domain type, but the editor itself is a generic form control. Two viable placements.

- Keep in `shared/ui/ports-editor/` and accept the type coupling. This is fine because the type is small and stable.
- Move to `device-form/` since ports are part of device editing. This tightens domain cohesion.

Pick whichever matches your mental model. I recommend keeping in `shared/ui/` because the editor is generic enough to be reused in non device contexts (for example, future audio-channel editor).

### Steps

1. Create the four subfolders under `shared/`.
2. Move each existing entry to its new location.
3. Update imports across the codebase. There are roughly 15 to 20 import sites.
4. Run `npm run build` to catch any missed imports.

### Effort

30 minutes including import updates.

## Recommendation 4. Optional Tweaks

### 4.1 Component Folders in Diagram Root

[diagram/](src/app/av-schematic/diagram/) has `diagram.component.{ts,html,scss}` and `wire-edge.component.{ts,html,scss}` flat in the root, while `device-node` lives under `node/`. This is a minor inconsistency. For consistency, move both root components into folders.

```
diagram/
├── canvas/
│   ├── diagram.component.{ts,html,scss}
│   ├── data.ts
│   ├── port-focus.service.ts
│   └── viewport-animation.service.ts
├── wire-edge/
│   └── wire-edge.component.{ts,html,scss}
├── device-node/                           // renamed from node/
│   └── device-node.component.{ts,html,scss}
├── model/
├── node-visibility/
└── edge-reshaping/
```

Effort. 15 minutes. Low priority.

### 4.2 Rename `node/` to `device-node/`

The current folder name `node/` is generic, but the only contents are `device-node.component.{ts,html,scss}`. Rename for accuracy and to match the file names. This also leaves room for future node templates (`device-node/`, `group-node/`, `comment-node/`) without confusion.

Effort. 2 minutes.

### 4.3 Add an `index.ts` to Logic

[diagram/edge-reshaping/logic/](src/app/av-schematic/diagram/edge-reshaping/logic/) already has [index.ts](src/app/av-schematic/diagram/edge-reshaping/logic/index.ts). Good. Consider adding similar barrel exports for `commands/`, `model/`, and `shared/ui/`. Barrels reduce import noise and signal which symbols are public to the rest of the codebase.

Effort. 10 minutes per barrel.

### 4.4 Co-locate `av-schematic.config.ts`

[av-schematic.config.ts](src/app/av-schematic/av-schematic.config.ts) sits at the feature root. This is fine. Consider whether it should live in `pages/` next to the page that consumes it, since the page is the only consumer. Marginal improvement.

Effort. 5 minutes.

## Implementation Order

Do these in sequence, committing after each step.

1. **Recommendation 2** (5 minutes). Smallest change, lowest risk. Builds momentum.
2. **Recommendation 1** (15 minutes). Highest user-visible impact. Resolves the most painful inconsistency.
3. **Recommendation 3** (30 minutes). Largest diff but mechanical. Do this after Rec 1 because the device-form move affects the `shared/` cleanup.
4. **Recommendation 4** (optional). Polish only. Skip if time-constrained.

Total. Around 50 minutes for the three core recommendations. After this, the structure is reference-quality for the Angular community.

## Acceptance Criteria

After all changes, verify:

- `npm run build` succeeds with zero warnings.
- `npm test` passes all existing tests.
- Every sub component in the project follows the rule "one folder per sub component".
- `shared/` contains only generic primitives organized into `ui/`, `directives/`, `forms/`, `styles/`, `utils/`.
- A first-time reader can predict the location of any component within 5 seconds of reading the feature folder name.

## Why Not Refactor More Aggressively

Some readers will ask why this document does not propose a full Domain Driven Design split (`domain/`, `application/`, `infrastructure/`, `presentation/`) or an Nx workspace migration. Two reasons.

The project is a template, not a large enterprise application. DDD ceremony at this size is overhead without payoff.

The current structure is already 80 percent correct. Wholesale refactor would discard working conventions and cost a week. The recommendations above target the specific 20 percent that breaks reader expectations, with surgical changes that preserve everything that works.
