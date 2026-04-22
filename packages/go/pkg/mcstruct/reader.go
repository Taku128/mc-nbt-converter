package mcstruct

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/Taku128/mc-nbt-converter/packages/go/pkg/buildnbt"
	"github.com/Taku128/mc-nbt-converter/packages/go/pkg/mapping"

	"github.com/sandertv/gophertunnel/minecraft/nbt"
)

// ConvertMcstructure parses a Bedrock .mcstructure file and outputs a Java .nbt equivalent.
func ConvertMcstructure(filePath string) ([]byte, []int32, int, int, error) {
	b, err := os.ReadFile(filePath)
	if err != nil {
		return nil, nil, 0, 0, fmt.Errorf("readfile: %w", err)
	}

	var root map[string]interface{}
	err = nbt.UnmarshalEncoding(b, &root, nbt.LittleEndian)
	if err != nil {
		return nil, nil, 0, 0, fmt.Errorf("nbt parse: %w", err)
	}

	// Read Size
	var size []int32
	switch v := root["size"].(type) {
	case []int32:
		size = v
	case []interface{}:
		for _, i := range v {
			if num, ok := i.(int32); ok {
				size = append(size, num)
			}
		}
	}
	if len(size) != 3 {
		return nil, nil, 0, 0, fmt.Errorf("invalid or missing size tag in mcstructure")
	}
	sx, sy, sz := size[0], size[1], size[2]

	structureData, ok := root["structure"].(map[string]interface{})
	if !ok {
		return nil, nil, 0, 0, fmt.Errorf("missing structure map")
	}

	var blockIndices []int32
	if bi, has := structureData["block_indices"]; has {
		// Structure block indices are usually [][]int32 (layer 0 = blocks, layer 1 = waterlogged)
		if arr2d, ok := bi.([]interface{}); ok && len(arr2d) > 0 {
			switch firstLayer := arr2d[0].(type) {
			case []int32:
				blockIndices = firstLayer
			case []interface{}:
				for _, v := range firstLayer {
					if n, ok := v.(int32); ok {
						blockIndices = append(blockIndices, n)
					}
				}
			}
		}
	}

	if len(blockIndices) != int(sx*sy*sz) {
		return nil, nil, 0, 0, fmt.Errorf("block indices length mismatch (got %d, expected %d)", len(blockIndices), sx*sy*sz)
	}

	paletteContainer, ok := structureData["palette"].(map[string]interface{})
	if !ok {
		return nil, nil, 0, 0, fmt.Errorf("missing palette map")
	}
	defaultPalette, ok := paletteContainer["default"].(map[string]interface{})
	if !ok {
		return nil, nil, 0, 0, fmt.Errorf("missing palette.default map")
	}

	var rawPalette []map[string]interface{}
	switch pb := defaultPalette["block_palette"].(type) {
	case []interface{}:
		for _, v := range pb {
			if m, ok := v.(map[string]interface{}); ok {
				rawPalette = append(rawPalette, m)
			}
		}
	case []map[string]interface{}:
		rawPalette = pb
	}

	javaPaletteMap := make(map[string]int32)
	var javaPalette []buildnbt.PaletteEntry
	var javaBlocks []buildnbt.BlockPos

	for x := int32(0); x < sx; x++ {
		for y := int32(0); y < sy; y++ {
			for z := int32(0); z < sz; z++ {
				idx := x*sy*sz + y*sz + z
				paletteIdx := blockIndices[idx]

				if paletteIdx < 0 || int(paletteIdx) >= len(rawPalette) {
					continue
				}

				entry := rawPalette[paletteIdx]
				bedrockName := "minecraft:air"
				if n, ok := entry["name"].(string); ok {
					bedrockName = n
				}
				if bedrockName == "minecraft:air" {
					continue
				}

				bedrockStates := make(map[string]interface{})
				if st, ok := entry["states"].(map[string]interface{}); ok {
					for k, v := range st {
						bedrockStates[k] = v
					}
				}

				javaEntry := mapping.MapBlock(bedrockName, bedrockStates)
				if javaEntry.Name == "minecraft:air" {
					continue
				}

				// Generate deterministic mapping key
				keys := make([]string, 0, len(javaEntry.Properties))
				for k := range javaEntry.Properties {
					keys = append(keys, k)
				}
				sort.Strings(keys)
				var propPairs []string
				for _, k := range keys {
					propPairs = append(propPairs, fmt.Sprintf("%s=%s", k, javaEntry.Properties[k]))
				}
				stateKey := javaEntry.Name + "|" + strings.Join(propPairs, ",")

				jIdx, exists := javaPaletteMap[stateKey]
				if !exists {
					jIdx = int32(len(javaPalette))
					javaPaletteMap[stateKey] = jIdx
					pEntry := buildnbt.PaletteEntry{
						Name:       javaEntry.Name,
						Properties: javaEntry.Properties,
					}
					javaPalette = append(javaPalette, pEntry)
				}

				javaBlocks = append(javaBlocks, buildnbt.BlockPos{
					Pos:   []int32{x, y, z},
					State: jIdx,
				})
			}
		}
	}

	// Run post processing
	modBlocks, modPalette := buildnbt.PostProcessBlocks(javaBlocks, javaPalette)

	// Build Final Java Structure
	nbtBytes, err := buildnbt.BuildStructureNbt(size, modPalette, modBlocks, 3953)
	return nbtBytes, size, len(modBlocks), len(modPalette), err
}
