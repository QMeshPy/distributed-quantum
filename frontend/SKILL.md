---

name: vercel-react-best-practices

description:

  React and Next.js performance optimization guidelines from Vercel Engineering.

  This skill should be used when writing, reviewing, or refactoring

  React/Next.js code to ensure optimal performance patterns. Triggers on tasks

  involving React components, Next.js pages, data fetching, bundle optimization,

  or performance improvements.

license: MIT

metadata:

  author: vercel

  version: '1.0.0'

---

# Vercel React Best Practices

Comprehensive performance optimization guide for React and Next.js applications,

maintained by Vercel. Contains 45 rules across 8 categories, prioritized by

impact to guide automated refactoring and code generation.

## When to Apply

Reference these guidelines when:

- Writing new React components or Next.js pages

- Implementing data fetching (client or server-side)

- Reviewing code for performance issues

- Refactoring existing React/Next.js code

- Optimizing bundle size or load times

## Project Package Manager

- This repository is Bun-only.

- Use `bun install` and `bun <script>` commands.

- Never use `npm`, `yarn`, or `pnpm` for this project.

## Required Companion Documents

For work in `phive-new-dashboard`, do not use this file alone. Read these files

together:

- `architecture.md` for repo-specific architecture, stack choices, caching,

  auth, and folder boundaries

- `DESIGN.md` for visual direction and interaction language

- `AGENTS.md` for Next.js/React performance, security, and structural rules

- `SKILL.md` as the condensed checklist and index

Conflict resolution:

- `architecture.md` decides repo-specific stack and architectural boundaries.

- `DESIGN.md` decides the visual system.

- `AGENTS.md` decides implementation quality, performance, and safety patterns.

- `SKILL.md` summarizes and reinforces the other three documents; it must not

  contradict them.

Repository-specific clarification:

- `phive-new-dashboard` uses TanStack Query for backend/server state.

- Treat the SWR rule in `AGENTS.md` as a generic deduplication principle.

- Use SWR only for narrow browser-only cases when the architecture explicitly

  allows it.

## Rule Categories by Priority

| Priority | Category                  | Impact      | Prefix       |

| -------- | ------------------------- | ----------- | ------------ |

| 1        | Eliminating Waterfalls    | CRITICAL    | `async-`     |

| 2        | Bundle Size Optimization  | CRITICAL    | `bundle-`    |

| 3        | Server-Side Performance   | HIGH        | `server-`    |

| 4        | Client-Side Data Fetching | MEDIUM-HIGH | `client-`    |

| 5        | Re-render Optimization    | MEDIUM      | `rerender-`  |

| 6        | Rendering Performance     | MEDIUM      | `rendering-` |

| 7        | JavaScript Performance    | LOW-MEDIUM  | `js-`        |

| 8        | Advanced Patterns         | LOW         | `advanced-`  |

## Quick Reference

### 1. Eliminating Waterfalls (CRITICAL)

- `async-defer-await` - Move await into branches where actually used

- `async-parallel` - Use Promise.all() for independent operations

- `async-dependencies` - Use better-all for partial dependencies

- `async-api-routes` - Start promises early, await late in API routes

- `async-suspense-boundaries` - Use Suspense to stream content

### 2. Bundle Size Optimization (CRITICAL)

- `bundle-barrel-imports` - Import directly, avoid barrel files

- `bundle-dynamic-imports` - Use next/dynamic for heavy components

- `bundle-defer-third-party` - Load analytics/logging after hydration

- `bundle-conditional` - Load modules only when feature is activated

- `bundle-preload` - Preload on hover/focus for perceived speed

### 3. Server-Side Performance (HIGH)

- `server-cache-react` - Use React.cache() for per-request deduplication

- `server-cache-lru` - Use LRU cache for cross-request caching

- `server-serialization` - Minimize data passed to client components

- `server-parallel-fetching` - Restructure components to parallelize fetches

- `server-after-nonblocking` - Use after() for non-blocking operations

### 4. Client-Side Data Fetching (MEDIUM-HIGH)

- `client-swr-dedup` - Use the project-standard deduplication layer; in

  `phive-new-dashboard`, that means TanStack Query for backend/server state and

  SWR only for narrow browser-only exceptions

- `client-event-listeners` - Deduplicate global event listeners

### 5. Re-render Optimization (MEDIUM)

- `rerender-defer-reads` - Don't subscribe to state only used in callbacks

- `rerender-memo` - Extract expensive work into memoized components

- `rerender-dependencies` - Use primitive dependencies in effects

- `rerender-derived-state` - Subscribe to derived booleans, not raw values

- `rerender-functional-setstate` - Use functional setState for stable callbacks

- `rerender-lazy-state-init` - Pass function to useState for expensive values

- `rerender-transitions` - Use startTransition for non-urgent updates

### 6. Rendering Performance (MEDIUM)

- `rendering-animate-svg-wrapper` - Animate div wrapper, not SVG element

- `rendering-content-visibility` - Use content-visibility for long lists

- `rendering-hoist-jsx` - Extract static JSX outside components

- `rendering-svg-precision` - Reduce SVG coordinate precision

- `rendering-hydration-no-flicker` - Use inline script for client-only data

- `rendering-activity` - Use Activity component for show/hide

- `rendering-conditional-render` - Use ternary, not && for conditionals

### 7. JavaScript Performance (LOW-MEDIUM)

- `js-batch-dom-css` - Group CSS changes via classes or cssText

- `js-index-maps` - Build Map for repeated lookups

- `js-cache-property-access` - Cache object properties in loops

- `js-cache-function-results` - Cache function results in module-level Map

- `js-cache-storage` - Cache localStorage/sessionStorage reads

- `js-combine-iterations` - Combine multiple filter/map into one loop

- `js-length-check-first` - Check array length before expensive comparison

- `js-early-exit` - Return early from functions

- `js-hoist-regexp` - Hoist RegExp creation outside loops

- `js-min-max-loop` - Use loop for min/max instead of sort

- `js-set-map-lookups` - Use Set/Map for O(1) lookups

- `js-tosorted-immutable` - Use toSorted() for immutability

### 8. Advanced Patterns (LOW)

- `advanced-event-handler-refs` - Store event handlers in refs

- `advanced-use-latest` - useLatest for stable callback refs

- `advanced-module-structure` - Enforce Module Structure and Pure UI Components

## How to Use

Use this file as a quick index, then refer to `ARCHITECTURE.md`, `DESIGN.md`,

and `AGENTS.md` together for the source rules.

Each rule contains:

- Brief explanation of why it matters

- Incorrect code example with explanation

- Correct code example with explanation

- Additional context and references

## Full Compiled Document

For the complete guide with all rules expanded: `AGENTS.md`