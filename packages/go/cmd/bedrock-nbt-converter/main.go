package main

import (
	"flag"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Taku128/mc-nbt-converter/packages/go/pkg/mcstruct"
	"github.com/Taku128/mc-nbt-converter/packages/go/pkg/mcworld"
)

func main() {
	// Reorder os.Args to allow flags after positional arguments (like Node.js CLI)
	var flags []string
	var positionals []string
	for i := 1; i < len(os.Args); i++ {
		arg := os.Args[i]
		if strings.HasPrefix(arg, "-") {
			flags = append(flags, arg)
			// If it's not a boolean flag, it might have a value
			if arg != "-v" && arg != "--verbose" && arg != "-verbose" {
				if i+1 < len(os.Args) && !strings.HasPrefix(os.Args[i+1], "-") {
					flags = append(flags, os.Args[i+1])
					i++
				}
			}
		} else {
			positionals = append(positionals, arg)
		}
	}
	os.Args = append([]string{os.Args[0]}, flags...)
	os.Args = append(os.Args, positionals...)

	var outPath string
	var minX, maxX, minY, maxY, minZ, maxZ int
	var verbose bool

	flag.StringVar(&outPath, "o", "", "Output file path (default: <input>.nbt)")
	flag.StringVar(&outPath, "out", "", "Output file path (default: <input>.nbt)")

	flag.IntVar(&minX, "x", math.MinInt32, "Minimum X coordinate (only for .mcworld)")
	flag.IntVar(&minX, "min-x", math.MinInt32, "Minimum X coordinate (only for .mcworld)")
	flag.IntVar(&maxX, "X", math.MaxInt32, "Maximum X coordinate (only for .mcworld)")
	flag.IntVar(&maxX, "max-x", math.MaxInt32, "Maximum X coordinate (only for .mcworld)")

	flag.IntVar(&minY, "y", -64, "Minimum Y coordinate (only for .mcworld)")
	flag.IntVar(&minY, "min-y", -64, "Minimum Y coordinate (only for .mcworld)")
	flag.IntVar(&maxY, "Y", 320, "Maximum Y coordinate (only for .mcworld)")
	flag.IntVar(&maxY, "max-y", 320, "Maximum Y coordinate (only for .mcworld)")

	flag.IntVar(&minZ, "z", math.MinInt32, "Minimum Z coordinate (only for .mcworld)")
	flag.IntVar(&minZ, "min-z", math.MinInt32, "Minimum Z coordinate (only for .mcworld)")
	flag.IntVar(&maxZ, "Z", math.MaxInt32, "Maximum Z coordinate (only for .mcworld)")
	flag.IntVar(&maxZ, "max-z", math.MaxInt32, "Maximum Z coordinate (only for .mcworld)")

	flag.BoolVar(&verbose, "v", false, "Enable verbose output")
	flag.BoolVar(&verbose, "verbose", false, "Enable verbose output")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Usage: bedrock-nbt-converter <inputPath> [options]\n\n")
		flag.PrintDefaults()
	}

	flag.Parse()

	args := flag.Args()
	if len(args) < 1 {
		flag.Usage()
		os.Exit(1)
	}

	inputPath := args[0]
	ext := strings.ToLower(filepath.Ext(inputPath))

	if outPath == "" {
		outPath = strings.TrimSuffix(inputPath, ext) + ".nbt"
	}

	if verbose {
		fmt.Printf("Input: %s\n", inputPath)
		fmt.Printf("Output: %s\n", outPath)
		if ext == ".mcworld" {
			fmt.Printf("Bounding Box: X[%d, %d] Y[%d, %d] Z[%d, %d]\n", minX, maxX, minY, maxY, minZ, maxZ)
		}
	}

	startTime := time.Now()
	var nbtData []byte
	var size []int32
	var blockCount, paletteCount int
	var err error

	if ext == ".mcworld" {
		opts := &mcworld.ConvertOptions{
			MinX: int32(minX), MaxX: int32(maxX),
			MinY: int32(minY), MaxY: int32(maxY),
			MinZ: int32(minZ), MaxZ: int32(maxZ),
			Dimension: 0,
		}
		nbtData, size, blockCount, paletteCount, err = mcworld.ConvertMcworld(inputPath, opts)
	} else if ext == ".mcstructure" {
		nbtData, size, blockCount, paletteCount, err = mcstruct.ConvertMcstructure(inputPath)
	} else {
		fmt.Fprintf(os.Stderr, "Error: Unknown file extension '%s'. Must be .mcworld or .mcstructure.\n", ext)
		os.Exit(1)
	}

	if err != nil {
		fmt.Fprintf(os.Stderr, "Conversion failed: %v\n", err)
		os.Exit(1)
	}

	err = os.WriteFile(outPath, nbtData, 0644)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to write output file: %v\n", err)
		os.Exit(1)
	}

	sizeMb := float64(len(nbtData)) / (1024 * 1024)

	fmt.Printf("\n📦 Converting %s (%s)...\n", filepath.Base(inputPath), strings.TrimPrefix(ext, "."))
	fmt.Printf("✅ Size: %d×%d×%d\n", size[0], size[1], size[2])
	fmt.Printf("   Blocks: %d, Palette: %d\n", blockCount, paletteCount)
	fmt.Printf("💾 Written to %s (%.2f MB)\n", outPath, sizeMb)

	elapsed := time.Since(startTime)
	if verbose {
		fmt.Printf("⏱️ Conversion finished in %s\n", elapsed)
	}
}
