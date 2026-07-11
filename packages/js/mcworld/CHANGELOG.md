# @taku128/mcworld

## 0.1.3

### Patch Changes

- Updated dependencies [315e176]
  - @taku128/core@0.4.0

## 0.1.2

### Patch Changes

- Updated dependencies [a775e2d]
  - @taku128/core@0.3.0

## 0.1.1

### Patch Changes

- acabf01: @taku128/core: add a block-family unit-test suite for mapBlock (no runtime change — the flatten lookup-order fix landed in the Go implementation, which previously picked a random rule per run for blocks like quartz_block/cauldron; the JS implementation was already deterministic via JSON declaration order). @taku128/mcworld: clean up the extracted temp directory and close the LevelDB handle on all error paths (both best-effort), and guard against malformed 9/13-byte subchunk keys that crashed enumerateChunks with a RangeError.
- Updated dependencies [acabf01]
  - @taku128/core@0.2.3
