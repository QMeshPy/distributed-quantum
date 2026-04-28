# Design System Inspired by Plane.so

## 1. Visual Theme & Atmosphere

Plane.so is a dark-first, minimal project management platform built for developers. The design language prioritizes information density, keyboard-driven workflows, and functional clarity over decoration. Every element serves a purpose—no gradients, no playful animations, no unnecessary polish. The aesthetic is austere but not cold: subtle borders, careful spacing, and a sophisticated gray scale create a professional workspace that doesn't demand attention.

The color palette is built on deep charcoals and slate grays (`#0d1117`, `#1f2937`, `#374151`) with white and near-white text for maximum contrast. Status colors—blue, green, yellow, red—are reserved for badges and indicators, never for large surfaces. Borders are thin (`1px`) and use muted grays that recede into the background. Shadows are almost nonexistent; when present, they're subtle (`0 1px 3px rgba(0,0,0,0.12)`), never dramatic.

Typography leans heavily on system fonts and monospace for technical data. Inter or -apple-system for UI text, JetBrains Mono or SF Mono for IDs, timestamps, and code. Type sizes are conservative (14px body, 12px secondary) with tight line-heights (1.4–1.5) to maximize information per screen. Weight 500 for labels, 400 for body, 600 sparingly for emphasis.

What makes Plane distinctive is its keyboard-first interaction model: command palette (⌘K), inline shortcuts, and a sidebar that collapses to icons. Hover states are minimal—a slight background tint, nothing more. No rotation, no hard shadows, no spring animations. Transitions are 150ms ease-out, barely perceptible. The entire UI feels like a precision tool: fast, predictable, and invisible until you need it.

**Key Characteristics:**
- Dark-first: `#0d1117` base, `#1f2937` elevated surfaces, `#374151` hover states
- Minimal borders: `1px solid rgba(255,255,255,0.1)` on dark backgrounds
- Tight spacing: 8px base unit, 12px–16px between major sections
- Flat hierarchy: subtle shadows (`0 1px 3px rgba(0,0,0,0.12)`) or none
- Status accent colors: blue (`#3b82f6`), green (`#10b981`), yellow (`#f59e0b`), red (`#ef4444`)
- Monospace for technical data: IDs, paths, timestamps
- Command palette (⌘K) as primary navigation aid
- Collapsible sidebar: full-width with labels or icon-only rail

## 2. Color Palette & Roles

### Dark Mode (Primary)

**Backgrounds**
- **Base** (`#0d1117`): Main canvas—issues list, background behind cards
- **Elevated** (`#1f2937`): Cards, modals, sidebar, panels
- **Hover** (`#374151`): Interactive element hover state
- **Border** (`rgba(255,255,255,0.1)`): Thin dividers, card outlines

**Text**
- **Primary** (`#f9fafb`): Headings, primary labels
- **Secondary** (`#9ca3af`): Body text, descriptions
- **Tertiary** (`#6b7280`): Muted labels, timestamps, metadata

**Accents (Status & Priority)**
- **Blue** (`#3b82f6`): In Progress, Info, Links
- **Green** (`#10b981`): Completed, Success
- **Yellow** (`#f59e0b`): Backlog, Warning
- **Red** (`#ef4444`): Urgent, Error, Blocked
- **Purple** (`#8b5cf6`): Custom states

### Light Mode (Secondary)

**Backgrounds**
- **Base** (`#ffffff`): Main canvas
- **Elevated** (`#f9fafb`): Cards, sidebar
- **Hover** (`#f3f4f6`): Interactive hover
- **Border** (`#e5e7eb`): Dividers

**Text**
- **Primary** (`#111827`): Headings, labels
- **Secondary** (`#4b5563`): Body text
- **Tertiary** (`#9ca3af`): Muted labels

## 3. Typography Rules

### Font Families
- **UI Text**: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- **Monospace**: `"JetBrains Mono", "SF Mono", "Roboto Mono", monospace`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Page Title | Inter | 24px | 600 | 1.3 | -0.02em | Rare—page headers only |
| Section Heading | Inter | 18px | 600 | 1.4 | -0.01em | Section dividers |
| Card Title | Inter | 16px | 500 | 1.4 | normal | Issue titles, card headers |
| Body | Inter | 14px | 400 | 1.5 | normal | Primary UI text |
| Label | Inter | 12px | 500 | 1.4 | normal | Form labels, sidebar items |
| Caption | Inter | 11px | 400 | 1.4 | normal | Metadata, timestamps |
| Mono ID | Monospace | 13px | 400 | 1.5 | normal | Issue IDs, paths |
| Mono Small | Monospace | 11px | 400 | 1.4 | normal | Inline code, keys |

### Principles
- **Tight hierarchy**: Only 3–4 distinct sizes. Most UI is 14px or 12px.
- **Weight 500 for labels**: Not bold (600), not regular (400)—the middle ground.
- **Monospace for technical data**: Any ID, path, timestamp, or code snippet.
- **Negative tracking on headings**: -0.01em to -0.02em for tighter optical spacing.

## 4. Component Stylings

### Buttons

**Primary**
- Background: `#3b82f6`
- Text: `#ffffff`
- Padding: 8px 16px
- Border radius: 6px
- Hover: `#2563eb` (darker blue)
- Transition: 150ms ease-out

**Secondary (Ghost)**
- Background: transparent
- Text: `#9ca3af`
- Border: `1px solid rgba(255,255,255,0.1)`
- Padding: 8px 16px
- Hover: background `#374151`

**Icon Button**
- Size: 32px × 32px
- Border radius: 6px
- Background: transparent
- Hover: `#374151`

### Cards

- Background: `#1f2937` (dark) or `#f9fafb` (light)
- Border: `1px solid rgba(255,255,255,0.1)` (dark) or `1px solid #e5e7eb` (light)
- Border radius: 8px
- Padding: 16px
- Shadow: `0 1px 3px rgba(0,0,0,0.12)` (optional, often omitted)

### Inputs

- Background: `#0d1117` (darker than card)
- Border: `1px solid rgba(255,255,255,0.1)`
- Border radius: 6px
- Padding: 8px 12px
- Font size: 14px
- Focus: border `#3b82f6`, ring `0 0 0 3px rgba(59,130,246,0.1)`

### Badges (Status)

- Padding: 4px 8px
- Border radius: 4px
- Font size: 11px
- Weight: 500
- Colors:
  - In Progress: background `rgba(59,130,246,0.1)`, text `#3b82f6`
  - Completed: background `rgba(16,185,129,0.1)`, text `#10b981`
  - Backlog: background `rgba(245,158,11,0.1)`, text `#f59e0b`
  - Blocked: background `rgba(239,68,68,0.1)`, text `#ef4444`

### Sidebar

- Background: `#1f2937` (dark) or `#f9fafb` (light)
- Width: 240px (expanded) or 64px (collapsed)
- Border right: `1px solid rgba(255,255,255,0.1)`
- Item padding: 8px 12px
- Item hover: `#374151`
- Item active: `#374151` + left border `3px solid #3b82f6`

### Navigation

- Sticky top nav at `h-14` (56px)
- Background: `#1f2937` with backdrop blur
- Border bottom: `1px solid rgba(255,255,255,0.1)`
- Logo left, search center, actions right
- Command palette trigger: ⌘K

### Command Palette

- Modal overlay: `rgba(0,0,0,0.8)`
- Panel: `#1f2937`, width 600px, border radius 12px
- Search input at top: 48px height, no visible border
- Results list: 400px max height, scroll
- Keyboard hint badges: `#374151` background, 11px mono

## 5. Layout Principles

### Spacing System
- Base unit: 4px
- Scale: 4px, 8px, 12px, 16px, 24px, 32px, 48px

### Grid & Structure
- Sidebar: 240px (or 64px collapsed)
- Main content: remaining width, max 1400px centered for wide screens
- Cards in grid: 2–3 columns, 16px gap
- List items: full width, 1px border between

### Information Density
- **Compact by default**: 8px padding on list items, 12px on cards
- **Tight line heights**: 1.4–1.5 for most text
- **Minimal whitespace between sections**: 24px–32px, not 64px+
- **Inline metadata**: timestamps, assignees, labels inline with title

### Border Radius Scale
- Buttons, inputs: 6px
- Cards: 8px
- Modals, panels: 12px
- Avatars: 50% (circle)

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Base (0) | Background `#0d1117`, no shadow | Canvas |
| Elevated (1) | Background `#1f2937`, optional subtle shadow | Cards, sidebar, modals |
| Hover (2) | Background `#374151` | Interactive hover state |
| Focus (3) | Border `#3b82f6` + ring `0 0 0 3px rgba(59,130,246,0.1)` | Keyboard focus |

**Shadow Philosophy**: Shadows are almost invisible. When used, they're `0 1px 3px rgba(0,0,0,0.12)`—just enough to separate a card from the background, nothing more. Most borders do the work instead.

## 7. Interaction Patterns

### Hover States
- Background tint: transparent → `#374151`
- Transition: 150ms ease-out
- No rotation, no scale, no hard shadows

### Focus States
- Keyboard focus: blue border + ring
- No focus visible for mouse clicks (`:focus-visible`)

### Command Palette (⌘K)
- Modal overlay with centered search
- Fuzzy search across issues, projects, settings
- Keyboard navigation: ↑↓ to select, Enter to go, Esc to close

### Inline Editing
- Click text to edit in place
- Input appears with same styling as static text
- Save on Enter or blur, cancel on Esc

## 8. Do's and Don'ts

### Do
- Use dark backgrounds (`#0d1117`, `#1f2937`) as primary surfaces
- Keep borders thin (1px) and muted (`rgba(255,255,255,0.1)`)
- Reserve accent colors for status badges and icons
- Use monospace for IDs, paths, timestamps
- Keep spacing tight and information dense
- Implement command palette for power users
- Collapse sidebar to icons for more workspace

### Don't
- Don't use gradients or colorful section backgrounds
- Don't add playful animations (rotation, bounce, spring)
- Don't use large border radius (>12px) except for circles
- Don't use dramatic shadows (offset, blur >3px)
- Don't make buttons or cards overly padded
- Don't use decorative elements that don't serve function
- Don't use multiple accent colors in the same view (pick one status color per item)

## 9. Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | <640px | Sidebar collapses to overlay, single column |
| Tablet | 640–1024px | Sidebar becomes icon rail or hidden |
| Desktop | 1024px+ | Full layout with expanded sidebar |

### Mobile Adaptations
- Hamburger menu reveals sidebar as slide-over
- Command palette opens full-screen
- Cards stack vertically
- Metadata moves below title instead of inline

## 10. Agent Prompt Guide

### Quick Color Reference (Dark Mode)
- Background base: `#0d1117`
- Background elevated: `#1f2937`
- Background hover: `#374151`
- Border: `rgba(255,255,255,0.1)`
- Text primary: `#f9fafb`
- Text secondary: `#9ca3af`
- Text tertiary: `#6b7280`
- Accent blue: `#3b82f6`
- Accent green: `#10b981`
- Accent yellow: `#f59e0b`
- Accent red: `#ef4444`

### Example Component Prompts
- "Create a dark sidebar on `#1f2937` background. Items at 14px Inter weight 400, padding 8px 12px. Hover state `#374151`. Active item gets left border 3px `#3b82f6`."
- "Design a status badge: background `rgba(59,130,246,0.1)`, text `#3b82f6`, padding 4px 8px, border radius 4px, font 11px weight 500."
- "Build a card: background `#1f2937`, border `1px solid rgba(255,255,255,0.1)`, radius 8px, padding 16px. Title 16px weight 500, body 14px weight 400 `#9ca3af`."
- "Create a primary button: background `#3b82f6`, text white, padding 8px 16px, radius 6px. Hover background `#2563eb`, transition 150ms ease-out."
- "Design an input: background `#0d1117`, border `1px solid rgba(255,255,255,0.1)`, radius 6px, padding 8px 12px, 14px Inter. Focus border `#3b82f6` + ring `0 0 0 3px rgba(59,130,246,0.1)`."

### Iteration Guide
1. Start with dark base (`#0d1117`), never light
2. Borders are thin and muted—recede, don't define
3. Accent colors only for status, never for decoration
4. Spacing is tight: 8px inside, 16px between
5. Shadows are subtle or nonexistent
6. Transitions are 150ms, barely noticeable
7. Monospace for any technical identifier
