package buildnbt

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/Taku128/go-bedrock-nbt-converter/data"
)

var redstoneConnectables = make(map[string]bool)
var dirOffsets = map[string][]int32{
	"down":  {0, -1, 0},
	"up":    {0, 1, 0},
	"north": {0, 0, -1},
	"south": {0, 0, 1},
	"west":  {-1, 0, 0},
	"east":  {1, 0, 0},
}

func init() {
	var d struct {
		RedstoneConnectables []string `json:"redstoneConnectables"`
	}
	if err := json.Unmarshal(data.ChunkerMappings, &d); err == nil {
		for _, v := range d.RedstoneConnectables {
			redstoneConnectables[v] = true
		}
	}
}

func isRedstoneConnectable(name string, props map[string]string, dx, dz int32) bool {
	if name == "minecraft:redstone_wire" {
		return true
	}
	if name == "minecraft:repeater" || name == "minecraft:comparator" || name == "minecraft:observer" {
		facing := props["facing"]
		if dx != 0 && (facing == "east" || facing == "west") {
			return true
		}
		if dz != 0 && (facing == "north" || facing == "south") {
			return true
		}
		return false
	}
	if redstoneConnectables[name] {
		return true
	}
	if strings.Contains(name, "button") || strings.Contains(name, "pressure_plate") || strings.Contains(name, "trapdoor") || strings.Contains(name, "door") || strings.Contains(name, "rail") {
		return true
	}
	return false
}

func makePropStr(props map[string]string) string {
	if len(props) == 0 {
		return ""
	}
	keys := make([]string, 0, len(props))
	for k := range props {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(props))
	for _, k := range keys {
		parts = append(parts, fmt.Sprintf("%s=%s", k, props[k]))
	}
	return strings.Join(parts, ",")
}

func makePaletteKey(name string, props map[string]string) string {
	return name + "|" + makePropStr(props)
}

// PostProcessBlocks applies structural context like matching pistons to their heads and forming redstone wire connections.
func PostProcessBlocks(blocks []BlockPos, palette []PaletteEntry) ([]BlockPos, []PaletteEntry) {
	posMap := make(map[string]int)
	for i, b := range blocks {
		posMap[fmt.Sprintf("%d,%d,%d", b.Pos[0], b.Pos[1], b.Pos[2])] = i
	}

	modPalette := make([]PaletteEntry, len(palette))
	copy(modPalette, palette)

	paletteMap := make(map[string]int32)
	for i, p := range modPalette {
		paletteMap[makePaletteKey(p.Name, p.Properties)] = int32(i)
	}

	getOrCreatePalette := func(name string, props map[string]string) int32 {
		key := makePaletteKey(name, props)
		if idx, has := paletteMap[key]; has {
			return idx
		}
		idx := int32(len(modPalette))
		newProps := make(map[string]string)
		for k, v := range props {
			newProps[k] = v
		}
		modPalette = append(modPalette, PaletteEntry{Name: name, Properties: newProps})
		paletteMap[key] = idx
		return idx
	}

	getBlockAt := func(x, y, z int32) *PaletteEntry {
		idx, ok := posMap[fmt.Sprintf("%d,%d,%d", x, y, z)]
		if !ok {
			return nil
		}
		return &modPalette[blocks[idx].State]
	}

	for i, b := range blocks {
		stateIdx := b.State
		entry := modPalette[stateIdx]
		name := entry.Name
		hx, hy, hz := b.Pos[0], b.Pos[1], b.Pos[2]

		// Piston Head
		if name == "minecraft:piston_head" {
			facing, hasFac := entry.Properties["facing"]
			if hasFac {
				if off, ok := dirOffsets[facing]; ok {
					bx, by, bz := hx-off[0], hy-off[1], hz-off[2]
					if baseIdx, ok := posMap[fmt.Sprintf("%d,%d,%d", bx, by, bz)]; ok {
						baseEntry := modPalette[blocks[baseIdx].State]
						if baseEntry.Name == "minecraft:piston" || baseEntry.Name == "minecraft:sticky_piston" {
							extProps := make(map[string]string)
							for k, v := range baseEntry.Properties {
								extProps[k] = v
							}
							extProps["extended"] = "true"
							blocks[baseIdx].State = getOrCreatePalette(baseEntry.Name, extProps)
						}
					}
				}
			}
		}

		// Redstone Wire
		if name == "minecraft:redstone_wire" {
			newProps := make(map[string]string)
			for k, v := range entry.Properties {
				newProps[k] = v
			}

			checkDir := func(dx, dz int32) string {
				sideBlock := getBlockAt(hx+dx, hy, hz+dz)
				if sideBlock != nil && isRedstoneConnectable(sideBlock.Name, sideBlock.Properties, dx, dz) {
					return "side"
				}

				upBlock := getBlockAt(hx+dx, hy+1, hz+dz)
				if upBlock != nil && upBlock.Name == "minecraft:redstone_wire" {
					return "up"
				}

				downBlock := getBlockAt(hx+dx, hy-1, hz+dz)
				if downBlock != nil && downBlock.Name == "minecraft:redstone_wire" {
					return "side"
				}
				return "none"
			}

			north := checkDir(0, -1)
			south := checkDir(0, 1)
			east := checkDir(1, 0)
			west := checkDir(-1, 0)

			hasNs := north != "none" || south != "none"
			hasEw := east != "none" || west != "none"

			if hasNs && !hasEw {
				if north == "none" {
					north = "side"
				}
				if south == "none" {
					south = "side"
				}
			} else if hasEw && !hasNs {
				if east == "none" {
					east = "side"
				}
				if west == "none" {
					west = "side"
				}
			}

			newProps["north"] = north
			newProps["south"] = south
			newProps["east"] = east
			newProps["west"] = west

			blocks[i].State = getOrCreatePalette(name, newProps)
		}
	}

	return blocks, modPalette
}
