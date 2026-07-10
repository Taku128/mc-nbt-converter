---
"@taku128/core": patch
"@taku128/mcworld": patch
---

@taku128/core: pin the flatten lookup order (JSON declaration order, matching the Go implementation which previously picked a random rule per run for blocks like quartz_block/cauldron), and add a block-family unit-test suite for mapBlock. @taku128/mcworld: clean up the extracted temp directory and close the LevelDB handle on all error paths, and guard against malformed 9/13-byte subchunk keys that crashed enumerateChunks with a RangeError.
