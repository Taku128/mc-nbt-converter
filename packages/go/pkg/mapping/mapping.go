package mapping

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"sync"

	"github.com/Taku128/mc-nbt-converter/packages/go/data"
)

// MappingTable is the shared shape of chunker-mappings.json and overrides.json.
type MappingTable struct {
	Names   map[string]string       `json:"names"`
	Flatten map[string]FlattenRules `json:"flatten"`
}

// FlattenRules preserves the JSON key order of one flatten entry.
//
// The JS implementation iterates rules in JSON order (Object.entries), and for
// blocks with several state keys — e.g. minecraft:cauldron declares fill_level
// before cauldron_liquid — that order decides which rule wins when the input
// has both states. A plain Go map iterates in randomized order and picked a
// different winner run-to-run (quartz_block measured 179/21 across 200 calls).
type FlattenRules struct {
	order []string
	rules map[string]map[string]string
}

func (f *FlattenRules) UnmarshalJSON(b []byte) error {
	// encoding/json の慣例: JSON null は no-op (素の map 型だった頃の挙動とも一致)。
	if string(bytes.TrimSpace(b)) == "null" {
		return nil
	}
	f.order = nil
	f.rules = make(map[string]map[string]string)
	dec := json.NewDecoder(bytes.NewReader(b))
	tok, err := dec.Token()
	if err != nil {
		return err
	}
	if d, ok := tok.(json.Delim); !ok || d != '{' {
		return fmt.Errorf("flatten rules: expected JSON object")
	}
	for dec.More() {
		keyTok, err := dec.Token()
		if err != nil {
			return err
		}
		key, ok := keyTok.(string)
		if !ok {
			return fmt.Errorf("flatten rules: expected string key")
		}
		var valueMap map[string]string
		if err := dec.Decode(&valueMap); err != nil {
			return err
		}
		f.order = append(f.order, key)
		f.rules[key] = valueMap
	}
	_, err = dec.Token() // closing }
	return err
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
	stateRules stateRulesTable
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
	if err := json.Unmarshal(data.StateRules, &stateRules); err != nil {
		fmt.Printf("Warning: failed to load state rules: %v\n", err)
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
// Rules are evaluated in JSON declaration order (same as the JS implementation).
func lookupFlatten(flatten map[string]FlattenRules, name string, props map[string]string) (string, bool) {
	fr, ok := flatten[name]
	if !ok {
		return "", false
	}
	for _, stateKey := range fr.order {
		if val, has := props[stateKey]; has {
			if resolved, found := fr.rules[stateKey][val]; found {
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

// ---------------------------------------------------------------------------
// data-driven state-rules engine (mirrors packages/js/core/src/block-mapping.ts).
// The op arrays preserve JSON order via slices, so no custom UnmarshalJSON is
// needed (unlike FlattenRules, which is a map).
// ---------------------------------------------------------------------------

// mapValue is a state-rules `map` value: either a string (set one key) or an
// object (set several keys).
type mapValue struct {
	str   string
	obj   map[string]string
	isObj bool
}

func (m *mapValue) UnmarshalJSON(b []byte) error {
	b = bytes.TrimSpace(b)
	if len(b) > 0 && b[0] == '"' {
		return json.Unmarshal(b, &m.str)
	}
	m.isObj = true
	return json.Unmarshal(b, &m.obj)
}

type mapOp struct {
	From         string              `json:"from"`
	To           string              `json:"to"`
	Default      string              `json:"default"`
	KeepUnmapped bool                `json:"keepUnmapped"`
	Values       map[string]mapValue `json:"values"`
}
type mapBoolOp struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Invert bool   `json:"invert"`
}
type renameOp struct {
	From string `json:"from"`
	To   string `json:"to"`
}
type wallVariantOp struct {
	From     string `json:"from"`
	Wall     string `json:"wall"`
	Standing string `json:"standing"`
	Flip     bool   `json:"flip"`
}
type stateOp struct {
	Map         *mapOp            `json:"map"`
	MapBool     *mapBoolOp        `json:"mapBool"`
	Rename      *renameOp         `json:"rename"`
	Set         map[string]string `json:"set"`
	SetDefault  map[string]string `json:"setDefault"`
	Drop        []string          `json:"drop"`
	SetName     string            `json:"setName"`
	WallVariant *wallVariantOp    `json:"wallVariant"`
}
type stateRule struct {
	Match string    `json:"match"`
	Ops   []stateOp `json:"ops"`
}
type stateRulesTable struct {
	Common struct {
		KeyAliases map[string]string `json:"keyAliases"`
		Ops        []stateOp         `json:"ops"`
		DropKeys   []string          `json:"dropKeys"`
	} `json:"common"`
	Rules []stateRule `json:"rules"`
}

func asBool(v string) bool { return v == "1" || v == "true" }

// wildcardMatch: '*' matches any run of characters; no other metacharacters.
func wildcardMatch(pattern, name string) bool {
	if !strings.Contains(pattern, "*") {
		return pattern == name
	}
	parts := strings.Split(pattern, "*")
	idx := 0
	for i, seg := range parts {
		if seg == "" {
			continue
		}
		if i == 0 {
			if !strings.HasPrefix(name, seg) {
				return false
			}
			idx = len(seg)
		} else if i == len(parts)-1 {
			return strings.HasSuffix(name[idx:], seg)
		} else {
			found := strings.Index(name[idx:], seg)
			if found == -1 {
				return false
			}
			idx += found + len(seg)
		}
	}
	return true
}

// applyOp mutates props and returns the (possibly new) Java name.
func applyOp(op stateOp, props map[string]string, name string) string {
	switch {
	case op.Rename != nil:
		if v, ok := props[op.Rename.From]; ok {
			props[op.Rename.To] = v
			delete(props, op.Rename.From)
		}
	case op.Map != nil:
		raw, ok := props[op.Map.From]
		if !ok {
			return name
		}
		if hit, found := op.Map.Values[raw]; found {
			delete(props, op.Map.From)
			if hit.isObj {
				for k, v := range hit.obj {
					props[k] = v
				}
			} else if op.Map.To != "" {
				props[op.Map.To] = hit.str
			}
		} else if op.Map.KeepUnmapped {
			if op.Map.To != "" && op.Map.To != op.Map.From {
				props[op.Map.To] = raw
				delete(props, op.Map.From)
			}
		} else if op.Map.Default != "" && op.Map.To != "" {
			delete(props, op.Map.From)
			props[op.Map.To] = op.Map.Default
		}
	case op.MapBool != nil:
		if v, ok := props[op.MapBool.From]; ok {
			b := asBool(v)
			if op.MapBool.Invert {
				b = !b
			}
			delete(props, op.MapBool.From)
			if b {
				props[op.MapBool.To] = "true"
			} else {
				props[op.MapBool.To] = "false"
			}
		}
	case op.Set != nil:
		for k, v := range op.Set {
			props[k] = v
		}
	case op.SetDefault != nil:
		for k, v := range op.SetDefault {
			if _, ok := props[k]; !ok {
				props[k] = v
			}
		}
	case op.Drop != nil:
		for _, k := range op.Drop {
			delete(props, k)
		}
	case op.SetName != "":
		return op.SetName
	case op.WallVariant != nil:
		dir, ok := props[op.WallVariant.From]
		delete(props, op.WallVariant.From)
		if ok && dir != "top" && dir != "unknown" && dir != "" {
			if op.WallVariant.Flip {
				if f, ok := flipDir[dir]; ok {
					props["facing"] = f
				} else {
					props["facing"] = dir
				}
			} else {
				props["facing"] = dir
			}
			return op.WallVariant.Wall
		}
		return op.WallVariant.Standing
	}
	return name
}

func applyOps(ops []stateOp, props map[string]string, name string) string {
	for _, op := range ops {
		name = applyOp(op, props, name)
	}
	return name
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

	// Step 1: normalize namespaced property keys (common.keyAliases)
	for ns, local := range stateRules.Common.KeyAliases {
		if val, ok := props[ns]; ok {
			props[local] = val
			delete(props, ns)
		}
	}

	// Step 2: resolve the Java name (4-layer). The rule match uses the
	// alias-applied Bedrock name, which is also what resolveJavaName consumes.
	matchName := bedrockName
	if a, ok := aliases.BedrockAliases[bedrockName]; ok {
		matchName = a
	}
	javaName, _ := resolveJavaName(bedrockName, props)

	// Step 3: common generic conversions
	javaName = applyOps(stateRules.Common.Ops, props, javaName)

	// Step 4: first matching per-block rule (declaration order)
	for _, rule := range stateRules.Rules {
		if wildcardMatch(rule.Match, matchName) {
			javaName = applyOps(rule.Ops, props, javaName)
			break
		}
	}

	// Step 5: final cleanup (common.dropKeys)
	finalProps := make(map[string]string)
	for k, v := range props {
		drop := false
		for _, pat := range stateRules.Common.DropKeys {
			if wildcardMatch(pat, k) {
				drop = true
				break
			}
		}
		if drop {
			continue
		}
		finalProps[k] = v
	}

	return JavaBlockState{
		Name:       javaName,
		Properties: finalProps,
	}
}
