---
"@taku128/mcstructure": patch
---

Read `.mcstructure` format version 2 (Bedrock 26.50+). Version 2 stores each `block_indices` layer as an IntArray instead of a List of Int, and leaves out the second layer when it is empty; structures saved or exported with 26.50 or later were rejected with `[mcstructure] block_indices list is empty`. Version 1 files convert exactly as before. The Go module (`packages/go`) gets the same fix plus `ConvertMcstructureBytes` / `DecodeMcstructure` for in-memory input (#12).
