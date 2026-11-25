package test_test

import (
	"bytes"
	"compress/zlib"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/sandertv/gophertunnel/minecraft/nbt"

	bedrocknbt "github.com/Taku128/mc-nbt-converter/packages/go"
)

// 統合版 26.60 から、ゲームが書き出す .mcstructure はルートの compression が 1 になり、
// structure が「structure の compound を LE の NBT に書いて zlib で縮めた ByteArray」になる。
// gophertunnel は ByteArray を [N]byte で読み書きする。

// asByteArray は NBT の ByteArray ([N]byte)。
func asByteArray(b []byte) interface{} {
	arr := reflect.New(reflect.ArrayOf(len(b), reflect.TypeOf(byte(0)))).Elem()
	reflect.Copy(arr, reflect.ValueOf(b))
	return arr.Interface()
}

func zlibBytes(t *testing.T, b []byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	w, err := zlib.NewWriterLevel(&buf, zlib.BestCompression)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Write(b); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// compressStructure は b の structure を zlib で縮めた形 (compression = compression) に書き直す。
func compressStructure(t *testing.T, b []byte, compression int32, packed func(inner []byte) []byte) []byte {
	t.Helper()
	root := readRoot(t, b)
	inner, err := nbt.MarshalEncoding(root["structure"], nbt.LittleEndian)
	if err != nil {
		t.Fatalf("nbt encode structure: %v", err)
	}
	root["structure"] = asByteArray(packed(inner))
	root["compression"] = compression
	enc, err := nbt.MarshalEncoding(root, nbt.LittleEndian)
	if err != nil {
		t.Fatalf("nbt encode: %v", err)
	}
	return enc
}

func readFixture(t *testing.T, name string) []byte {
	t.Helper()
	p := filepath.Join("..", "..", "..", "tests", "golden", "fixtures", name)
	if name == "elevator.mcstructure" {
		p = filepath.Join("testdata", name)
	}
	b, err := os.ReadFile(p)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// 版 1・版 2 の構造を zlib で縮めても、縮めていないものと同じ出力になる。
func TestConvertMcstructureZlibMatchesUncompressed(t *testing.T) {
	for _, name := range []string{
		"elevator.mcstructure",               // 版 1
		"bds-26.52-v2-small.mcstructure",     // 版 2 (2 層)
		"bds-26.52-v2-one-layer.mcstructure", // 版 2 (2 層目なし)
	} {
		t.Run(name, func(t *testing.T) {
			plain := readFixture(t, name)
			want, _, _ := convertBytes(t, plain)

			z := compressStructure(t, plain, 1, func(inner []byte) []byte { return zlibBytes(t, inner) })
			root := readRoot(t, z)
			if _, ok := root["structure"].(map[string]interface{}); ok {
				t.Fatal("structure is still a compound")
			}
			got, _, _ := convertBytes(t, z)
			if !bytes.Equal(got, want) {
				t.Fatal("compressed output differs from uncompressed")
			}
		})
	}
}

// tools/gen-zlib-fixture.mjs が作った見本 (26.62 の実物と同じ形) が、元の版 2 と同じ出力になる。
func TestConvertMcstructureZlibFixture(t *testing.T) {
	z := readFixture(t, "bds-26.52-v2-small-zlib.mcstructure")
	root := readRoot(t, z)
	if c, _ := root["compression"].(int32); c != 1 {
		t.Fatalf("fixture compression = %v, want 1", root["compression"])
	}
	want, _, _ := convertBytes(t, readFixture(t, "bds-26.52-v2-small.mcstructure"))
	got, nonAir, _ := convertBytes(t, z)
	if nonAir != 77 {
		t.Fatalf("non-air blocks = %d, want 77", nonAir)
	}
	if !bytes.Equal(got, want) {
		t.Fatal("zlib fixture output differs from bds-26.52-v2-small")
	}
}

func TestConvertMcstructureZlibRejects(t *testing.T) {
	plain := readFixture(t, "bds-26.52-v2-small.mcstructure")
	cases := []struct {
		name        string
		compression int32
		packed      func(inner []byte) []byte
		wantErr     string
	}{
		{"unknown compression", 2, func(inner []byte) []byte { return zlibBytes(t, inner) }, "unknown structure compression 2"},
		{"not zlib", 1, func(inner []byte) []byte { return inner }, "structure zlib"},
		{"truncated zlib", 1, func(inner []byte) []byte { z := zlibBytes(t, inner); return z[:len(z)/2] }, "structure zlib"},
		{"inflated data is not nbt", 1, func([]byte) []byte { return zlibBytes(t, []byte{0x0a, 0x00, 0x00, 0x07, 0x01, 0x00}) }, "structure nbt"},
		// 64 KiB ほどが 64 MiB を超えて膨らむ (zip bomb)
		{"inflates past the limit", 1, func([]byte) []byte { return zlibBytes(t, make([]byte, 64<<20+1)) }, "inflated size exceeds"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			b := compressStructure(t, plain, c.compression, c.packed)
			_, _, _, _, err := bedrocknbt.ConvertMcstructureBytes(b)
			if err == nil || !strings.Contains(err.Error(), c.wantErr) {
				t.Fatalf("err = %v, want it to contain %q", err, c.wantErr)
			}
		})
	}
}
