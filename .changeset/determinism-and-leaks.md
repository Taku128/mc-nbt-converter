---
"@taku128/core": patch
"@taku128/mcworld": patch
---

@taku128/core: add a block-family unit-test suite for mapBlock (no runtime change — the flatten lookup-order fix landed in the Go implementation, which previously picked a random rule per run for blocks like quartz_block/cauldron; the JS implementation was already deterministic via JSON declaration order). @taku128/mcworld: clean up the extracted temp directory and close the LevelDB handle on all error paths (both best-effort), and guard against malformed 9/13-byte subchunk keys that crashed enumerateChunks with a RangeError.
