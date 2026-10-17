// Package bedrocknbt provides a high-performance converter to translate Minecraft Bedrock Edition
// block structures (.mcworld and .mcstructure) into Java Edition Structure NBT formats.
package bedrocknbt

import (
	"github.com/Taku128/mc-nbt-converter/packages/go/pkg/mcstruct"
	"github.com/Taku128/mc-nbt-converter/packages/go/pkg/mcworld"
)

// ConvertMcworld extracts a Zlib-compressed Bedrock LevelDB (.mcworld) and converts a specific
// 3D region of chunks into a Java Structure NBT byte slice.
func ConvertMcworld(inputPath string, opts *mcworld.ConvertOptions) ([]byte, []int32, int, int, error) {
	return mcworld.ConvertMcworld(inputPath, opts)
}

// ConvertMcstructure parses a Bedrock Little-Endian NBT structure file (.mcstructure) and
// translates it into a Java Big-Endian Structure NBT byte slice. Both format version 1 and
// version 2 (Bedrock 26.50+, block_indices stored as IntArray) are read.
func ConvertMcstructure(filePath string) ([]byte, []int32, int, int, error) {
	return mcstruct.ConvertMcstructure(filePath)
}

// ConvertMcstructureBytes is ConvertMcstructure for an in-memory .mcstructure
// (uncompressed little-endian NBT).
func ConvertMcstructureBytes(b []byte) ([]byte, []int32, int, int, error) {
	return mcstruct.ConvertMcstructureBytes(b)
}

// DecodeMcstructure reads an in-memory .mcstructure and returns its blocks as Java block states
// (palette + non-air block positions), without building the Java NBT.
func DecodeMcstructure(b []byte) (*JavaStructure, error) {
	return mcstruct.DecodeMcstructure(b)
}

// JavaStructure is the result of DecodeMcstructure.
type JavaStructure = mcstruct.JavaStructure

// ConvertOptions is an alias for bounding box filtering when converting .mcworld directories.
type ConvertOptions = mcworld.ConvertOptions
