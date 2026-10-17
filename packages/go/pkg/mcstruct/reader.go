package mcstruct

import (
	"fmt"
	"os"
	"reflect"
	"sort"
	"strings"

	"github.com/Taku128/mc-nbt-converter/packages/go/pkg/buildnbt"
	"github.com/Taku128/mc-nbt-converter/packages/go/pkg/mapping"

	"github.com/sandertv/gophertunnel/minecraft/nbt"
)

// JavaStructure is a Bedrock .mcstructure translated to Java block states, after post-processing
// (piston heads, redstone wire connections).
type JavaStructure struct {
	// Size is [x, y, z].
	Size []int32
	// Palette holds the Java block states in use. Air is not included.
	Palette []buildnbt.PaletteEntry
	// Blocks are the non-air blocks. Pos is relative to the structure origin.
	Blocks []buildnbt.BlockPos
}

// ConvertMcstructure parses a Bedrock .mcstructure file and outputs a Java .nbt equivalent.
func ConvertMcstructure(filePath string) ([]byte, []int32, int, int, error) {
	b, err := os.ReadFile(filePath)
	if err != nil {
		return nil, nil, 0, 0, fmt.Errorf("readfile: %w", err)
	}
	return ConvertMcstructureBytes(b)
}

// ConvertMcstructureBytes is ConvertMcstructure for an in-memory .mcstructure
// (uncompressed little-endian NBT).
func ConvertMcstructureBytes(b []byte) ([]byte, []int32, int, int, error) {
	s, err := DecodeMcstructure(b)
	if err != nil {
		return nil, nil, 0, 0, err
	}
	nbtBytes, err := buildnbt.BuildStructureNbt(s.Size, s.Palette, s.Blocks, 3953)
	return nbtBytes, s.Size, len(s.Blocks), len(s.Palette), err
}

// DecodeMcstructure reads an in-memory .mcstructure (uncompressed little-endian NBT, format
// version 1 or 2) and translates its blocks to Java block states.
func DecodeMcstructure(b []byte) (*JavaStructure, error) {
	// gophertunnel は宣言長を無検証で割り当てるため、細工ファイルによる巨大割当 (OOM) を
	// 防ぐべく、割り当てなしの pre-flight スキャンで長さの整合を先に確認する。
	if verr := validateNbtLE(b); verr != nil {
		return nil, fmt.Errorf("nbt validate: %w", verr)
	}

	var root map[string]interface{}
	if err := nbt.UnmarshalEncoding(b, &root, nbt.LittleEndian); err != nil {
		return nil, fmt.Errorf("nbt parse: %w", err)
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
		return nil, fmt.Errorf("invalid or missing size tag in mcstructure")
	}
	sx, sy, sz := size[0], size[1], size[2]

	structureData, ok := root["structure"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("missing structure map")
	}

	blockIndices := blockLayer(structureData["block_indices"])
	if len(blockIndices) != int(sx*sy*sz) {
		return nil, fmt.Errorf("block indices length mismatch (got %d, expected %d)", len(blockIndices), sx*sy*sz)
	}

	paletteContainer, ok := structureData["palette"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("missing palette map")
	}
	defaultPalette, ok := paletteContainer["default"].(map[string]interface{})
	if !ok {
		return nil, fmt.Errorf("missing palette.default map")
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
	return &JavaStructure{Size: size, Palette: modPalette, Blocks: modBlocks}, nil
}

// blockLayer は block_indices の 1 層目 (ブロック) を返す。2 層目 (水没など) は使わない。
//   - 版 1: List[List[Int]]。gophertunnel は層を []int32 で返す
//   - 版 2 (統合版 26.50〜): List[IntArray]。gophertunnel は層を長さごとの配列 ([256]int32 など) で返す。
//     2 層目は空なら省略される
func blockLayer(v interface{}) []int32 {
	layers, ok := v.([]interface{})
	if !ok || len(layers) == 0 {
		return nil
	}
	switch first := layers[0].(type) {
	case []int32:
		return first
	case []interface{}:
		out := make([]int32, 0, len(first))
		for _, e := range first {
			if n, ok := e.(int32); ok {
				out = append(out, n)
			}
		}
		return out
	}
	rv := reflect.ValueOf(layers[0])
	if rv.Kind() == reflect.Array && rv.Type().Elem().Kind() == reflect.Int32 {
		out := make([]int32, rv.Len())
		reflect.Copy(reflect.ValueOf(out), rv)
		return out
	}
	return nil
}
