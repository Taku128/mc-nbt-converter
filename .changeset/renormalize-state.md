---
"@taku128/core": minor
---

Add `renormalizeState(javaName, javaProps)`: re-maps a Java block whose state properties are still in raw Bedrock form (e.g. `lever_direction`, `weirdo_direction`, `rail_direction`, `cardinal_direction`) through the current state-rules, without doing Bedrock→Java name resolution. Idempotent — blocks that carry no residual Bedrock state key are returned unchanged, so already-correct Java states (including split wall/floor torches) are never mis-converted. Intended for backfilling structures converted by pre-0.3.0 versions (e.g. stored `.mcworld`-derived `.nbt`) where stairs/doors/rails were left with unconverted orientation.
