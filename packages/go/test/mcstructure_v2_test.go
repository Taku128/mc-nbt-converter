package test_test

import (
	"bytes"
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/sandertv/gophertunnel/minecraft/nbt"

	bedrocknbt "github.com/Taku128/mc-nbt-converter/packages/go"
)

// 統合版 26.50 で .mcstructure の版 2 が入った: block_indices が List[IntArray] になり、
// 2 層目 (水没など) は空なら省略される。版 1 は List[List[Int]]。
// gophertunnel は IntArray を [N]int32、List[Int] を []int32 で読み書きする。

func readRoot(t *testing.T, b []byte) map[string]interface{} {
	t.Helper()
	var root map[string]interface{}
	if err := nbt.UnmarshalEncoding(b, &root, nbt.LittleEndian); err != nil {
		t.Fatalf("nbt parse: %v", err)
	}
	return root
}

func layers(t *testing.T, root map[string]interface{}) []interface{} {
	t.Helper()
	s := root["structure"].(map[string]interface{})
	l, ok := s["block_indices"].([]interface{})
	if !ok {
		t.Fatalf("block_indices is %T", s["block_indices"])
	}
	return l
}

func toInt32s(t *testing.T, layer interface{}) []int32 {
	t.Helper()
	if s, ok := layer.([]int32); ok {
		return s
	}
	rv := reflect.ValueOf(layer)
	if rv.Kind() != reflect.Array || rv.Type().Elem().Kind() != reflect.Int32 {
		t.Fatalf("layer is %T", layer)
	}
	out := make([]int32, rv.Len())
	reflect.Copy(reflect.ValueOf(out), rv)
	return out
}

// rewrite は block_indices を書き換えて、LE の NBT に書き直す。
func rewrite(t *testing.T, b []byte, version int32, conv func([]int32) interface{}, keepSecond bool) []byte {
	t.Helper()
	root := readRoot(t, b)
	var out []interface{}
	for i, l := range layers(t, root) {
		if i > 0 && !keepSecond {
			break
		}
		out = append(out, conv(toInt32s(t, l)))
	}
	root["structure"].(map[string]interface{})["block_indices"] = out
	root["format_version"] = version
	enc, err := nbt.MarshalEncoding(root, nbt.LittleEndian)
	if err != nil {
		t.Fatalf("nbt encode: %v", err)
	}
	return enc
}

// asIntArray は版 2 の層 (IntArray)。
func asIntArray(s []int32) interface{} {
	arr := reflect.New(reflect.ArrayOf(len(s), reflect.TypeOf(int32(0)))).Elem()
	reflect.Copy(arr, reflect.ValueOf(s))
	return arr.Interface()
}

// asIntList は版 1 の層 (List[Int])。
func asIntList(s []int32) interface{} {
	return append([]int32(nil), s...)
}

func convertBytes(t *testing.T, b []byte) ([]byte, int, int) {
	t.Helper()
	out, _, blocks, palette, err := bedrocknbt.ConvertMcstructureBytes(b)
	if err != nil {
		t.Fatalf("convert: %v", err)
	}
	return out, blocks, palette
}

// 版 1 の elevator を版 2 に直しても、同じ出力になる。
func TestConvertMcstructureV2MatchesV1(t *testing.T) {
	v1, err := os.ReadFile("testdata/elevator.mcstructure")
	if err != nil {
		t.Fatal(err)
	}
	want, _, _ := convertBytes(t, v1)

	// 書き直しそのものが出力を変えないこと
	again := rewrite(t, v1, 1, asIntList, true)
	if typ := reflect.TypeOf(layers(t, readRoot(t, again))[0]); typ.Kind() != reflect.Slice {
		t.Fatalf("v1 layer was written as %v, not List[Int]", typ)
	}
	if got, _, _ := convertBytes(t, again); !bytes.Equal(got, want) {
		t.Fatal("rewriting v1 as v1 changed the output")
	}

	cases := []struct {
		name       string
		keepSecond bool
	}{
		{"two layers", true},
		{"second layer omitted", false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			v2 := rewrite(t, v1, 2, asIntArray, c.keepSecond)
			if typ := reflect.TypeOf(layers(t, readRoot(t, v2))[0]); typ.Kind() != reflect.Array {
				t.Fatalf("v2 layer was written as %v, not IntArray", typ)
			}
			got, _, _ := convertBytes(t, v2)
			if !bytes.Equal(got, want) {
				t.Fatal("v2 output differs from v1")
			}
		})
	}
}

// BDS 1.26.52.3 の Script API が書いた版 2 (redtact-live#29 の実測) を読める。版 1 に直したものと同じ出力になる。
func TestConvertMcstructureBDSV2(t *testing.T) {
	cases := []struct {
		file      string
		layers    int
		nonAir    int
		mustHaves []string
	}{
		// 8×4×8。チェスト・看板・ホッパー・コンパレーター・水没した階段入り
		{"bds-26.52-v2-small.mcstructure", 2, 77, []string{"minecraft:chest", "minecraft:hopper", "minecraft:repeater", "minecraft:comparator", "minecraft:redstone_wire", "minecraft:oak_stairs"}},
		// 16×16×16。水没が無いので 2 層目は省略されている
		{"bds-26.52-v2-one-layer.mcstructure", 1, 2304, []string{"minecraft:redstone_wire", "minecraft:repeater", "minecraft:redstone_lamp"}},
	}
	for _, c := range cases {
		t.Run(c.file, func(t *testing.T) {
			v2, err := os.ReadFile(filepath.Join("..", "..", "..", "tests", "golden", "fixtures", c.file))
			if err != nil {
				t.Fatal(err)
			}
			root := readRoot(t, v2)
			if fv, _ := root["format_version"].(int32); fv != 2 {
				t.Fatalf("fixture format_version = %v, want 2", root["format_version"])
			}
			if n := len(layers(t, root)); n != c.layers {
				t.Fatalf("fixture has %d layers, want %d", n, c.layers)
			}

			got, nonAir, _ := convertBytes(t, v2)
			if nonAir != c.nonAir {
				t.Fatalf("non-air blocks = %d, want %d", nonAir, c.nonAir)
			}
			if want, _, _ := convertBytes(t, rewrite(t, v2, 1, asIntList, true)); !bytes.Equal(got, want) {
				t.Fatal("v2 output differs from the same structure written as v1")
			}

			s, err := bedrocknbt.DecodeMcstructure(v2)
			if err != nil {
				t.Fatal(err)
			}
			if len(s.Blocks) != c.nonAir {
				t.Fatalf("DecodeMcstructure blocks = %d, want %d", len(s.Blocks), c.nonAir)
			}
			names := map[string]bool{}
			for _, p := range s.Palette {
				names[p.Name] = true
			}
			for _, n := range c.mustHaves {
				if !names[n] {
					t.Errorf("palette lacks %s (have %v)", n, names)
				}
			}
		})
	}
}
