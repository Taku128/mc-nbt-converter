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
// translates it into a Java Big-Endian Structure NBT byte slice.
func ConvertMcstructure(filePath string) ([]byte, []int32, int, int, error) {
	return mcstruct.ConvertMcstructure(filePath)
}

// ConvertOptions is an alias for bounding box filtering when converting .mcworld directories.
type ConvertOptions = mcworld.ConvertOptions
