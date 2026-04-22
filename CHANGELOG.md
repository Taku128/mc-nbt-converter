# Changelog

## [2.0.0] - 2026-04-22

### Breaking Changes
- Package restructured into a monorepo with granular sub-packages:
  - `@mc-nbt/core` — browser + Node mapping, NBT builder, SubChunk parser
  - `@mc-nbt/mcstructure` — browser + Node `.mcstructure` converter
  - `@mc-nbt/mcworld` — Node-only `.mcworld` (LevelDB) converter
  - `bedrock-nbt-converter` — thin meta-package re-exporting the above (backward-compatible API)
- Replaced Node-only `zlib` with `fflate` → output now works in browsers

### New Features
- 4-layer block mapping: `aliases.json` → `overrides.json` → `chunker-mappings.json` → `fallbacks.json`
- 246/246 known Bedrock block names resolve without error
- `@mc-nbt/mcstructure` browser entry: `convertMcstructureBuffer(Uint8Array | ArrayBuffer)`
- `@mc-nbt/mcstructure/node` subpath: `convertMcstructure(filePath)` (Node-only)
- `@mc-nbt/core` exports: `mapBlock`, `reportUnmapped`, `resetUnmapped`, `buildStructureNbt`, `parseSubChunk`, `postProcessBlocks`
- Weekly automated mapping sync via GitHub Actions

### Internal
- Go implementation kept in repository (`packages/go/`) with full test suite; not published to pkg.go.dev

## [1.0.0] - 2024

Initial release as a single `bedrock-nbt-converter` npm package.
