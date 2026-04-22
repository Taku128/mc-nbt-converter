# go-bedrock-nbt-converter

A high-performance standalone Go library and CLI tool for converting Minecraft Bedrock Edition structures (`.mcworld` LevelDB chunks and `.mcstructure` tiles) into Java Edition (`.nbt`) Structure blocks.

By leveraging Go's memory efficiency and bypassing CGO, this parser seamlessly plows through the custom Bedrock Zlib databases with native concurrency.

## 🚀 Features
- **Extremely Fast:** Converts tens of thousands of Bedrock blocks into Java NBT in milliseconds.
- **Embedded Mappings:** Relies on the highly-accurate Hive Games Chunker block mapping JSON definitions, which are embedded directly into the binary at compile time (`//go:embed`). No external config needed!
- **State Logic Resolution:** Automatically patches cross-block state dependencies like extended Piston Heads and uninterrupted Redstone powder wire lines during NBT emission.

## 📦 Usage as a Go Library

If you plan to perform 3D rendering or custom programmatic analysis of Bedrock worlds, `go-bedrock-nbt-converter` is cleanly exported as a Go Module for easy importing.

### 1. Install

```bash
go get github.com/Taku128/go-bedrock-nbt-converter
```

### 2. Import into your application

```go
package main

import (
	"fmt"
	"os"

	"github.com/Taku128/go-bedrock-nbt-converter"
)

func main() {
	// Example 1: Read a specific .mcstructure tile
	nbtData, err := bedrocknbt.ConvertMcstructure("path/to/my_building.mcstructure")
	if err != nil {
		panic(err)
	}
	os.WriteFile("output_building.nbt", nbtData, 0644)

	// Example 2: Extract a bounding box from a full Bedrock .mcworld LevelDB zip
	opts := &bedrocknbt.ConvertOptions{
		MinX: -100, MaxX: 100,
		MinY: -64,  MaxY: 320,
		MinZ: -100, MaxZ: 100,
		Dimension: 0, // 0=Overworld, 1=Nether, 2=The End
	}

	nbtWorldData, err := bedrocknbt.ConvertMcworld("path/to/BedrockMap.mcworld", opts)
	if err != nil {
		panic(err)
	}
	os.WriteFile("output_world_region.nbt", nbtWorldData, 0644)
	fmt.Println("Successfully generated Java Structure NBT!")
}
```

## 🛠️ Usage as a Command Line Tool

### Building the CLI
```bash
go build -o bedrock-nbt-converter ./cmd/bedrock-nbt-converter
```

### Syntax
```text
bedrock-nbt-converter <inputPath> [options]
```
The input path can be a `.mcworld` map directory (zip format) or a `.mcstructure` file.

### CLI Examples

**Convert an `.mcstructure` file instantly:**
```bash
./bedrock-nbt-converter elevator.mcstructure -o output.nbt
```

**Convert a bounding area from an `.mcworld` database:**
```bash
./bedrock-nbt-converter MyWorld.mcworld -o MyWorldChunk.nbt -x -64 -X 64 -y -64 -Y 64 -z -64 -Z 64
```

## Automated Mapping Sync (GitHub Actions)
This repository contains a GitHub Actions workflow that automatically queries the [Chunker](https://github.com/HiveGamesOSS/Chunker) upstream every week. Any newly introduced blocks or metadata formats are automatically parsed, updated within `data/chunker-mappings.json`, and pushed to this repo—so the Go binary naturally stays up-to-date with the latest Bedrock beta updates without any source-code intervention.
