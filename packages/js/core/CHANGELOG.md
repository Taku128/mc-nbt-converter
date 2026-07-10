# @taku128/core

## 0.3.0

### Minor Changes

- a775e2d: Make Bedrock→Java block-state conversion data-driven via `shared/mappings/state-rules.json` (a `common` pass + per-block `rules` applied by a small op engine, matched on the alias-applied Bedrock name in declaration order). The JS and Go implementations now read the same JSON instead of duplicating ~1000 lines of hand-written branches. The 15 previously-hardcoded families are preserved exactly (the Elevator fixture converts byte-identically before/after). Adds correct conversion for eight families that used to pass through as invalid Java state — lever, stairs (weirdo_direction), doors (`minecraft:cardinal_direction`, which also fixes a 90° facing error), regular rail curves (rail_direction 0–9), tripwire_hook, daylight_detector, sculk_sensor, crafter — plus redstone_lamp `lit` defaulting and cauldron `cauldron_liquid` residue removal, all verified against GeyserMC/mappings (Java 1.21.11). JS/Go parity is covered by a new oriented-block golden fixture.

## 0.2.3

### Patch Changes

- acabf01: @taku128/core: add a block-family unit-test suite for mapBlock (no runtime change — the flatten lookup-order fix landed in the Go implementation, which previously picked a random rule per run for blocks like quartz_block/cauldron; the JS implementation was already deterministic via JSON declaration order). @taku128/mcworld: clean up the extracted temp directory and close the LevelDB handle on all error paths (both best-effort), and guard against malformed 9/13-byte subchunk keys that crashed enumerateChunks with a RangeError.
