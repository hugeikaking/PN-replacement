# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

被动件料号翻译 (Passive Component Part Number Translator) — 一款面向硬件行业采购/研发/资源开发人员的物料-料号互译工具。支持微信小程序和 H5 网页双端。

## Commands

```bash
# Development
npm run dev:h5          # Start H5 dev server (http://localhost:3000)
npm run build:h5        # Build H5 for production

# Testing
npm run test            # Run all unit tests (Vitest)
npm run test:watch      # Run tests in watch mode

# Linting
npm run lint            # ESLint check
npm run format          # Prettier format
```

## Architecture

```
src/
├── engine/          # ★ Pure TS translation engine (no UI deps, fully unit-testable)
│   ├── index.ts     # Entry: translateDescription(input, rule) → TranslationResult
│   ├── parser.ts    # Free-text → structured params (regex-based)
│   ├── matcher.ts   # Params → manufacturer codes (ref table lookup)
│   ├── builder.ts   # Codes → assembled PN string (template fill)
│   └── types.ts     # Shared type definitions
│
├── rules/           # ★ Knowledge base (JSON data, editable by non-engineers)
│   ├── _schema.json # JSON Schema contract for rule files
│   ├── shared/      # Cross-manufacturer lookup tables (size, voltage, tc, tolerance, capacitance)
│   └── murata/      # Murata PN rules per component type
│       └── mlcc.json
│
├── pages/           # Route-level Vue SFC pages
│   ├── index/       # Home (mode selection cards)
│   └── translate-single/  # Single translation page
│
├── components/      # Reusable UI components (WeUI-inspired)
├── stores/          # Pinia state (translation state + history)
└── utils/           # Cross-platform utilities (clipboard, router)
```

## Translation Pipeline (Mode A: Description → Murata PN)

```
Input: "0402 100nF 16V X7R ±10%"  →  Output: "GRM158R71C104KAxxD3D"
       │                                        │
       ├─ parser.ts (regex extract + normalize)─┤
       │  {size:"0402", cap:"100000", v:"16",   │
       │   tc:"X7R", tol:"10"}                  │
       │                                        │
       ├─ matcher.ts (ref table lookup) ────────┤
       │  {size:"15", cap:"104", v:"1C",        │
       │   tc:"R7", tol:"K"}                    │
       │                                        │
       └─ builder.ts (template assembly) ───────┘
```

## Key Design Decisions

- **Rule files are JSON** — domain experts can update without touching code. Schema validation at `rules/_schema.json`.
- **Engine is pure TypeScript** — no framework deps. Tests run on Node.js (Vitest, no DOM needed).
- **CSS variables follow WeUI spec** — `--color-primary: #07C160` (WeChat green), `--color-murata: #E60012`.
- **Phase 1 only supports Murata MLCC Mode A**. Other component types and Mode B (competitor PN decoding) are stubbed.
- **Future: SimSurfing API** — Murata's official API is being applied for. Integration point reserved at engine level.

## Current Status

- [x] Phase 1: Engine + Murata MLCC rule (29/29 tests passing)
- [x] Phase 2: H5 UI (home page + single translate page)
- [ ] Phase 3: Batch upload/export (Excel/CSV)
- [ ] Phase 4: Mode B + competitor rules
