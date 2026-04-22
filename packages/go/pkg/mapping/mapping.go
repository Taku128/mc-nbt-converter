package mapping

import (
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/Taku128/mc-nbt-converter/packages/go/data"
)

// MappingTable is the shared shape of chunker-mappings.json and overrides.json.
type MappingTable struct {
	Names   map[string]string                       `json:"names"`
	Flatten map[string]map[string]map[string]string `json:"flatten"`
}

type aliasesTable struct {
	BedrockAliases map[string]string `json:"bedrockAliases"`
}

type fallbacksTable struct {
	DefaultBlock              string `json:"defaultBlock"`
	UseIdentityFallback       bool   `json:"useIdentityFallback"`
	StripPropertiesOnFallback bool   `json:"stripPropertiesOnFallback"`
	LogUnmapped               bool   `json:"logUnmapped"`
}

var (
	chunker    MappingTable
	overrides  MappingTable
	aliases    aliasesTable
	fallbacks  fallbacksTable
	unmapped   = make(map[string]struct{})
	unmappedMu sync.Mutex
)

func init() {
	if err := json.Unmarshal(data.ChunkerMappings, &chunker); err != nil {
		fmt.Printf("Warning: failed to load chunker mappings: %v\n", err)
	}
	if err := json.Unmarshal(data.Overrides, &overrides); err != nil {
		fmt.Printf("Warning: failed to load overrides: %v\n", err)
	}
	if err := json.Unmarshal(data.Aliases, &aliases); err != nil {
		fmt.Printf("Warning: failed to load aliases: %v\n", err)
	}
	if err := json.Unmarshal(data.Fallbacks, &fallbacks); err != nil {
		fmt.Printf("Warning: failed to load fallbacks: %v\n", err)
	}
}

// KnownBedrockBlocks returns every Bedrock block name present in any of the
// mapping layers (chunker/overrides/aliases). Used for coverage testing.
func KnownBedrockBlocks() []string {
	set := make(map[string]struct{}, len(chunker.Names)+len(chunker.Flatten))
	for k := range chunker.Names {
		set[k] = struct{}{}
	}
	for k := range chunker.Flatten {
		set[k] = struct{}{}
	}
	for k := range overrides.Names {
		set[k] = struct{}{}
	}
	for k := range overrides.Flatten {
		set[k] = struct{}{}
	}
	for k := range aliases.BedrockAliases {
		set[k] = struct{}{}
	}
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	return out
}

// ReportUnmapped returns Bedrock block names that fell through all mapping layers
// during this process lifetime. Useful for coverage tests.
func ReportUnmapped() []string {
	unmappedMu.Lock()
	defer unmappedMu.Unlock()
	out := make([]string, 0, len(unmapped))
	for k := range unmapped {
		out = append(out, k)
	}
	return out
}

// ResetUnmapped clears the unmapped set (used in tests).
func ResetUnmapped() {
	unmappedMu.Lock()
	defer unmappedMu.Unlock()
	unmapped = make(map[string]struct{})
}

func recordUnmapped(name string) {
	unmappedMu.Lock()
	defer unmappedMu.Unlock()
	unmapped[name] = struct{}{}
}

// lookupFlatten applies a flatten table. On hit, the consumed state key is removed from props.
func lookupFlatten(flatten map[string]map[string]map[string]string, name string, props map[string]string) (string, bool) {
	rules, ok := flatten[name]
	if !ok {
		return "", false
	}
	for stateKey, valueMap := range rules {
		if val, has := props[stateKey]; has {
			if resolved, found := valueMap[val]; found {
				delete(props, stateKey)
				return resolved, true
			}
		}
	}
	return "", false
}

// resolveJavaName applies the 4-layer lookup:
//  1. aliases (normalize input)
//  2. overrides (flatten → names)
//  3. chunker (flatten → names)
//  4. fallbacks (identity or defaultBlock)
//
// Returns (javaName, resolved). resolved=false means the fallback layer was used.
func resolveJavaName(bedrockName string, props map[string]string) (string, bool) {
	if a, ok := aliases.BedrockAliases[bedrockName]; ok {
		bedrockName = a
	}

	if name, ok := lookupFlatten(overrides.Flatten, bedrockName, props); ok {
		return name, true
	}
	if name, ok := overrides.Names[bedrockName]; ok {
		return name, true
	}

	if name, ok := lookupFlatten(chunker.Flatten, bedrockName, props); ok {
		return name, true
	}
	if name, ok := chunker.Names[bedrockName]; ok {
		return name, true
	}

	if fallbacks.LogUnmapped {
		recordUnmapped(bedrockName)
	}

	if fallbacks.UseIdentityFallback {
		name := "minecraft:" + strings.TrimPrefix(bedrockName, "minecraft:")
		if fallbacks.StripPropertiesOnFallback {
			for k := range props {
				delete(props, k)
			}
		}
		return name, false
	}
	return fallbacks.DefaultBlock, false
}

type JavaBlockState struct {
	Name       string
	Properties map[string]string
}

var flipDir = map[string]string{
	"north": "south", "south": "north",
	"east": "west", "west": "east",
}

var trapdoorDir = map[string]string{
	"0": "east", "1": "west", "2": "south", "3": "north",
}

var railShape = map[string]string{
	"0": "north_south", "1": "east_west", "2": "ascending_east",
	"3": "ascending_west", "4": "ascending_north", "5": "ascending_south",
}

func parseString(val interface{}) string {
	switch v := val.(type) {
	case string:
		return v
	case float64:
		return fmt.Sprintf("%g", v)
	case int, int32, int64, byte:
		return fmt.Sprintf("%d", v)
	case bool:
		if v {
			return "true"
		}
		return "false"
	default:
		return fmt.Sprintf("%v", v)
	}
}

// MapBlock converts a Bedrock block name and its properties to a Java-compatible format.
func MapBlock(bedrockName string, bedrockProps map[string]interface{}) JavaBlockState {
	props := make(map[string]string)
	for k, v := range bedrockProps {
		props[k] = parseString(v)
	}

	// 1. Normalize namespaced property keys
	nsKeys := map[string]string{
		"minecraft:cardinal_direction": "cardinal_direction",
		"minecraft:facing_direction":   "mc_facing_direction",
		"minecraft:vertical_half":      "vertical_half",
		"minecraft:block_face":         "block_face",
		"minecraft:pillar_axis":        "pillar_axis",
	}
	for ns, local := range nsKeys {
		if val, ok := props[ns]; ok {
			props[local] = val
			delete(props, ns)
		}
	}

	// 2. Resolve Java name via 4-layer lookup (aliases → overrides → chunker → fallback)
	javaName, _ := resolveJavaName(bedrockName, props)

	shortName := strings.TrimPrefix(javaName, "minecraft:")

	// 3. Convert basic properties
	if val, ok := props["facing_direction"]; ok {
		fMap := []string{"down", "up", "north", "south", "west", "east"}
		if num, err := fmt.Sscanf(val, "%d", new(int)); err == nil && num == 1 {
			var idx int
			fmt.Sscanf(val, "%d", &idx)
			if idx >= 0 && idx < 6 {
				props["facing"] = fMap[idx]
			}
		} else {
			props["facing"] = val
		}
		delete(props, "facing_direction")
	}

	if val, ok := props["mc_facing_direction"]; ok {
		props["facing"] = val
		delete(props, "mc_facing_direction")
	}

	if val, ok := props["cardinal_direction"]; ok {
		props["facing"] = val
		delete(props, "cardinal_direction")
	}

	if val, ok := props["pillar_axis"]; ok {
		props["axis"] = val
		delete(props, "pillar_axis")
	}

	if val, ok := props["vertical_half"]; ok {
		if val == "top" {
			props["type"] = "top"
		} else {
			props["type"] = "bottom"
		}
		delete(props, "vertical_half")
	}

	// 4. Block-specific logic
	// Torches
	if shortName == "redstone_wall_torch" || shortName == "redstone_torch" {
		torchDir, hasDir := props["torch_facing_direction"]
		delete(props, "torch_facing_direction")
		isLit := !strings.Contains(bedrockName, "unlit")

		if hasDir && torchDir != "top" && torchDir != "unknown" {
			javaName = "minecraft:redstone_wall_torch"
			if flip, ok := flipDir[torchDir]; ok {
				props["facing"] = flip
			} else {
				props["facing"] = torchDir
			}
		} else {
			javaName = "minecraft:redstone_torch"
		}
		if isLit {
			props["lit"] = "true"
		} else {
			props["lit"] = "false"
		}
	}

	if shortName == "wall_torch" || shortName == "torch" {
		torchDir, hasDir := props["torch_facing_direction"]
		delete(props, "torch_facing_direction")
		if hasDir && torchDir != "top" && torchDir != "unknown" {
			javaName = "minecraft:wall_torch"
			if flip, ok := flipDir[torchDir]; ok {
				props["facing"] = flip
			} else {
				props["facing"] = torchDir
			}
		} else {
			javaName = "minecraft:torch"
		}
	}

	if shortName == "soul_wall_torch" || shortName == "soul_torch" {
		torchDir, hasDir := props["torch_facing_direction"]
		delete(props, "torch_facing_direction")
		if hasDir && torchDir != "top" && torchDir != "unknown" {
			javaName = "minecraft:soul_wall_torch"
			if flip, ok := flipDir[torchDir]; ok {
				props["facing"] = flip
			} else {
				props["facing"] = torchDir
			}
		} else {
			javaName = "minecraft:soul_torch"
		}
	}

	// Pistons
	if shortName == "piston_head" || shortName == "piston_arm_collision" {
		javaName = "minecraft:piston_head"
		if strings.Contains(bedrockName, "sticky") {
			props["type"] = "sticky"
		} else if _, ok := props["type"]; !ok {
			props["type"] = "normal"
		}
		if _, ok := props["short"]; !ok {
			props["short"] = "false"
		}
		if flip, ok := flipDir[props["facing"]]; ok {
			props["facing"] = flip
		}
	}

	if shortName == "piston" || shortName == "sticky_piston" {
		if _, ok := props["extended"]; !ok {
			props["extended"] = "false"
		}
		if flip, ok := flipDir[props["facing"]]; ok {
			props["facing"] = flip
		}
	}

	// Comparator
	if shortName == "comparator" {
		if val, ok := props["output_subtract_bit"]; ok {
			if val == "1" || val == "true" {
				props["mode"] = "subtract"
			} else {
				props["mode"] = "compare"
			}
			delete(props, "output_subtract_bit")
		} else if _, ok := props["mode"]; !ok {
			props["mode"] = "compare"
		}
		if val, ok := props["output_lit_bit"]; ok {
			if val == "1" || val == "true" {
				props["powered"] = "true"
			} else {
				props["powered"] = "false"
			}
			delete(props, "output_lit_bit")
		} else {
			if bedrockName == "minecraft:powered_comparator" {
				props["powered"] = "true"
			} else {
				props["powered"] = "false"
			}
		}
	}

	// Repeater
	if shortName == "repeater" {
		if bedrockName == "minecraft:powered_repeater" {
			props["powered"] = "true"
		} else {
			props["powered"] = "false"
		}
		if val, ok := props["repeater_delay"]; ok {
			var delay int
			fmt.Sscanf(val, "%d", &delay)
			props["delay"] = fmt.Sprintf("%d", delay+1)
			delete(props, "repeater_delay")
		} else if _, ok := props["delay"]; !ok {
			props["delay"] = "1"
		}
		if _, ok := props["locked"]; !ok {
			props["locked"] = "false"
		}
	}

	// Observer
	if shortName == "observer" {
		if val, ok := props["powered_bit"]; ok {
			if val == "1" || val == "true" {
				props["powered"] = "true"
			} else {
				props["powered"] = "false"
			}
			delete(props, "powered_bit")
		} else if _, ok := props["powered"]; !ok {
			props["powered"] = "false"
		}
	}

	// Button
	if strings.Contains(shortName, "button") {
		if val, ok := props["button_pressed_bit"]; ok {
			if val == "1" || val == "true" {
				props["powered"] = "true"
			} else {
				props["powered"] = "false"
			}
			delete(props, "button_pressed_bit")
		}
		if f, ok := props["facing"]; ok {
			if f == "down" {
				props["face"] = "ceiling"
				props["facing"] = "north"
			} else if f == "up" {
				props["face"] = "floor"
				props["facing"] = "north"
			} else {
				props["face"] = "wall"
			}
		}
	}

	// Barrel
	if shortName == "barrel" {
		if val, ok := props["open_bit"]; ok {
			if val == "1" || val == "true" {
				props["open"] = "true"
			} else {
				props["open"] = "false"
			}
			delete(props, "open_bit")
		} else if _, ok := props["open"]; !ok {
			props["open"] = "false"
		}
	}

	// Dropper/Dispenser
	if shortName == "dropper" || shortName == "dispenser" {
		if val, ok := props["triggered_bit"]; ok {
			if val == "1" || val == "true" {
				props["triggered"] = "true"
			} else {
				props["triggered"] = "false"
			}
			delete(props, "triggered_bit")
		}
	}

	// Hopper
	if shortName == "hopper" {
		if val, ok := props["toggle_bit"]; ok {
			if val == "0" || val == "false" {
				props["enabled"] = "true"
			} else {
				props["enabled"] = "false"
			}
			delete(props, "toggle_bit")
		}
	}

	// Trapdoor
	if strings.Contains(shortName, "trapdoor") {
		if val, ok := props["direction"]; ok {
			if rm, ok := trapdoorDir[val]; ok {
				props["facing"] = rm
			} else {
				props["facing"] = "north"
			}
			delete(props, "direction")
		}
		if val, ok := props["upside_down_bit"]; ok {
			if val == "1" || val == "true" {
				props["half"] = "top"
			} else {
				props["half"] = "bottom"
			}
			delete(props, "upside_down_bit")
		}
		if val, ok := props["open_bit"]; ok {
			if val == "1" || val == "true" {
				props["open"] = "true"
			} else {
				props["open"] = "false"
			}
			delete(props, "open_bit")
		}
		if _, ok := props["open"]; !ok {
			props["open"] = "false"
		}
		if _, ok := props["half"]; !ok {
			props["half"] = "bottom"
		}
		if _, ok := props["waterlogged"]; !ok {
			props["waterlogged"] = "false"
		}
		if _, ok := props["powered"]; !ok {
			props["powered"] = "false"
		}
	}

	// Rails
	if shortName == "powered_rail" || shortName == "activator_rail" || shortName == "detector_rail" {
		if val, ok := props["rail_direction"]; ok {
			if rs, ok := railShape[val]; ok {
				props["shape"] = rs
			} else {
				props["shape"] = "north_south"
			}
			delete(props, "rail_direction")
		}
		if val, ok := props["rail_data_bit"]; ok {
			if val == "1" || val == "true" {
				props["powered"] = "true"
			} else {
				props["powered"] = "false"
			}
			delete(props, "rail_data_bit")
		}
		if _, ok := props["powered"]; !ok {
			props["powered"] = "false"
		}
		if _, ok := props["waterlogged"]; !ok {
			props["waterlogged"] = "false"
		}
	}

	// Lectern
	if shortName == "lectern" {
		if val, ok := props["powered_bit"]; ok {
			if val == "1" || val == "true" {
				props["has_book"] = "true"
			} else {
				props["has_book"] = "false"
			}
			delete(props, "powered_bit")
		}
		if _, ok := props["powered"]; !ok {
			props["powered"] = "false"
		}
		if _, ok := props["has_book"]; !ok {
			props["has_book"] = "false"
		}
	}

	// Redstone wire
	if shortName == "redstone_wire" {
		if val, ok := props["redstone_signal"]; ok {
			props["power"] = val
			delete(props, "redstone_signal")
		}
		if _, ok := props["east"]; !ok {
			props["east"] = "none"
		}
		if _, ok := props["north"]; !ok {
			props["north"] = "none"
		}
		if _, ok := props["south"]; !ok {
			props["south"] = "none"
		}
		if _, ok := props["west"]; !ok {
			props["west"] = "none"
		}
		if _, ok := props["power"]; !ok {
			props["power"] = "0"
		}
	}

	// Filter metadata keys
	finalProps := make(map[string]string)
	for k, v := range props {
		if strings.Contains(k, "update") || k == "age_bit" || k == "age" {
			continue
		}
		if strings.HasPrefix(k, "minecraft:") {
			continue
		}
		finalProps[k] = v
	}

	return JavaBlockState{
		Name:       javaName,
		Properties: finalProps,
	}
}
