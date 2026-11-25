# @taku128/mcstructure

## 0.2.7

### Patch Changes

- 566f3b9: Read `.mcstructure` format version 2 (Bedrock 26.50+). Version 2 stores each `block_indices` layer as an IntArray instead of a List of Int, and leaves out the second layer when it is empty; structures saved or exported with 26.50 or later were rejected with `[mcstructure] block_indices list is empty`. Also read the zlib-compressed form Bedrock 26.60+ writes: the root `compression` is 1 and `structure` is a ByteArray holding the structure compound as zlib-compressed little-endian NBT (it is inflated with `DecompressionStream`, up to 64 MiB). Files exported from 26.60 or later failed with the same message. Version 1 files convert exactly as before. The Go module (`packages/go`) gets the same fix plus `ConvertMcstructureBytes` / `DecodeMcstructure` for in-memory input (#12).

## 0.2.6

### Patch Changes

- Updated dependencies [315e176]
  - @taku128/core@0.4.0

## 0.2.5

### Patch Changes

- Updated dependencies [a775e2d]
  - @taku128/core@0.3.0

## 0.2.4

### Patch Changes

- Updated dependencies [acabf01]
  - @taku128/core@0.2.3
