package mcworld

import (
	"archive/zip"
	"encoding/binary"
	"fmt"
	"io"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/Taku128/go-bedrock-nbt-converter/pkg/buildnbt"
	"github.com/Taku128/go-bedrock-nbt-converter/pkg/mapping"
	"github.com/Taku128/go-bedrock-nbt-converter/pkg/subchunk"

	"github.com/df-mc/goleveldb/leveldb"
	"github.com/df-mc/goleveldb/leveldb/opt"
)

type ConvertOptions struct {
	MinX, MaxX int32
	MinY, MaxY int32
	MinZ, MaxZ int32
	Dimension  int32
}

const tagSubchunkPrefix = 47

func findDbDir(extractedDir string) (string, error) {
	dbDir := filepath.Join(extractedDir, "db")
	if info, err := os.Stat(dbDir); err == nil && info.IsDir() {
		return dbDir, nil
	}
	entries, err := os.ReadDir(extractedDir)
	if err != nil {
		return "", err
	}
	for _, entry := range entries {
		if entry.IsDir() {
			candidate := filepath.Join(extractedDir, entry.Name(), "db")
			if info, err := os.Stat(candidate); err == nil && info.IsDir() {
				return candidate, nil
			}
		}
	}
	return "", fmt.Errorf("could not find db/ directory in .mcworld")
}

func extractMcworld(path string) (string, error) {
	r, err := zip.OpenReader(path)
	if err != nil {
		return "", err
	}
	defer r.Close()

	tmpDir, err := os.MkdirTemp("", "mcworld-")
	if err != nil {
		return "", err
	}

	for _, f := range r.File {
		fpath := filepath.Join(tmpDir, f.Name)
		if !strings.HasPrefix(fpath, filepath.Clean(tmpDir)+string(os.PathSeparator)) {
			continue
		}
		if f.FileInfo().IsDir() {
			os.MkdirAll(fpath, os.ModePerm)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(fpath), os.ModePerm); err != nil {
			return tmpDir, err
		}
		dst, err := os.OpenFile(fpath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			return tmpDir, err
		}
		src, err := f.Open()
		if err != nil {
			dst.Close()
			return tmpDir, err
		}
		_, err = io.Copy(dst, src)
		dst.Close()
		src.Close()
		if err != nil {
			return tmpDir, err
		}
	}
	return tmpDir, nil
}

func buildSubChunkKey(x, y, z int32, dimId int32) []byte {
	if dimId != 0 {
		buf := make([]byte, 14)
		binary.LittleEndian.PutUint32(buf[0:4], uint32(x))
		binary.LittleEndian.PutUint32(buf[4:8], uint32(z))
		binary.LittleEndian.PutUint32(buf[8:12], uint32(dimId))
		buf[12] = tagSubchunkPrefix
		buf[13] = byte(y)
		return buf
	}
	buf := make([]byte, 10)
	binary.LittleEndian.PutUint32(buf[0:4], uint32(x))
	binary.LittleEndian.PutUint32(buf[4:8], uint32(z))
	buf[8] = tagSubchunkPrefix
	buf[9] = byte(y)
	return buf
}

type chunkPointer struct {
	x, z      int32
	subchunks []int
}

func ConvertMcworld(inputPath string, opts *ConvertOptions) ([]byte, []int32, int, int, error) {
	if opts == nil {
		opts = &ConvertOptions{
			MinX: -math.MaxInt32, MaxX: math.MaxInt32,
			MinY: -64, MaxY: 320,
			MinZ: -math.MaxInt32, MaxZ: math.MaxInt32,
			Dimension: 0,
		}
	}

	extractedDir, err := extractMcworld(inputPath)
	if err != nil {
		return nil, nil, 0, 0, fmt.Errorf("failed to extract zip: %w", err)
	}
	defer os.RemoveAll(extractedDir)

	dbDir, err := findDbDir(extractedDir)
	if err != nil {
		return nil, nil, 0, 0, err
	}

	db, err := leveldb.OpenFile(dbDir, &opt.Options{
		Compression: opt.FlateCompression,
		ReadOnly:    true,
	})
	if err != nil {
		return nil, nil, 0, 0, fmt.Errorf("failed to open leveldb: %w", err)
	}
	defer db.Close()

	// Enumerate SubChunks
	chunks := make(map[string]*chunkPointer)
	iter := db.NewIterator(nil, nil)
	for iter.Next() {
		key := iter.Key()
		l := len(key)
		if l < 9 {
			continue
		}
		cx := int32(binary.LittleEndian.Uint32(key[0:4]))
		cz := int32(binary.LittleEndian.Uint32(key[4:8]))

		isOverworld := (l == 9 || l == 10)
		isOtherDim := (l == 13 || l == 14)

		var tagByte byte
		var dim int32
		if isOverworld {
			tagByte = key[8]
			dim = 0
		} else if isOtherDim {
			dim = int32(binary.LittleEndian.Uint32(key[8:12]))
			tagByte = key[12]
		} else {
			continue
		}

		if dim != opts.Dimension {
			continue
		}

		posKey := fmt.Sprintf("%d,%d", cx, cz)
		if tagByte == tagSubchunkPrefix {
			var cy int8
			if isOverworld {
				cy = int8(key[9])
			} else {
				cy = int8(key[13])
			}

			if _, ok := chunks[posKey]; !ok {
				chunks[posKey] = &chunkPointer{x: cx, z: cz}
			}
			chunks[posKey].subchunks = append(chunks[posKey].subchunks, int(cy))
		}
	}
	iter.Release()

	// Math filtering
	// Floor divides
	minCX := int32(math.Floor(float64(opts.MinX) / 16))
	maxCX := int32(math.Floor(float64(opts.MaxX) / 16))
	minCZ := int32(math.Floor(float64(opts.MinZ) / 16))
	maxCZ := int32(math.Floor(float64(opts.MaxZ) / 16))
	minSY := int32(math.Floor(float64(opts.MinY) / 16))
	maxSY := int32(math.Floor(float64(opts.MaxY) / 16))

	paletteMap := make(map[string]int32)
	var finalPalette []buildnbt.PaletteEntry
	var finalBlocks []buildnbt.BlockPos

	actualMinX, actualMinY, actualMinZ := int32(math.MaxInt32), int32(math.MaxInt32), int32(math.MaxInt32)
	actualMaxX, actualMaxY, actualMaxZ := int32(-math.MaxInt32), int32(-math.MaxInt32), int32(-math.MaxInt32)

	// Collect chunk keys and sort them so NBT generation byte stream is deterministic
	var chunkKeys []string
	for k := range chunks {
		chunkKeys = append(chunkKeys, k)
	}
	sort.Strings(chunkKeys)

	for _, ck := range chunkKeys {
		c := chunks[ck]
		if c.x < minCX || c.x > maxCX || c.z < minCZ || c.z > maxCZ {
			continue
		}
		sort.Ints(c.subchunks)

		for _, sectionY := range c.subchunks {
			sy := int32(sectionY)
			if sy < minSY || sy > maxSY {
				continue
			}

			key := buildSubChunkKey(c.x, sy, c.z, opts.Dimension)
			data, err := db.Get(key, nil)
			if err != nil || len(data) == 0 {
				continue
			}

			parsed, err := subchunk.ParseSubChunk(data)
			if err != nil || parsed == nil {
				continue
			}

			rawPalette := parsed.Palette
			rawBlocks := parsed.Blocks

			for idx := 0; idx < 4096; idx++ {
				rawIdx := rawBlocks[idx]
				if int(rawIdx) >= len(rawPalette) {
					continue
				}

				entry := rawPalette[rawIdx]
				if entry.Name == "minecraft:air" {
					continue
				}

				by := int32(idx % 16)
				bz := int32((idx / 16) % 16)
				bx := int32(idx / 256)

				worldX := (c.x * 16) + bx
				worldY := (sy * 16) + by
				worldZ := (c.z * 16) + bz

				if worldX < opts.MinX || worldX > opts.MaxX {
					continue
				}
				if worldY < opts.MinY || worldY > opts.MaxY {
					continue
				}
				if worldZ < opts.MinZ || worldZ > opts.MaxZ {
					continue
				}

				javaEntry := mapping.MapBlock(entry.Name, entry.Properties)

				// Deterministic string key
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

				paletteIdx, exists := paletteMap[stateKey]
				if !exists {
					paletteIdx = int32(len(finalPalette))
					paletteMap[stateKey] = paletteIdx
					finalPalette = append(finalPalette, buildnbt.PaletteEntry{
						Name:       javaEntry.Name,
						Properties: javaEntry.Properties,
					})
				}

				finalBlocks = append(finalBlocks, buildnbt.BlockPos{
					Pos:   []int32{worldX, worldY, worldZ},
					State: paletteIdx,
				})

				if worldX < actualMinX {
					actualMinX = worldX
				}
				if worldY < actualMinY {
					actualMinY = worldY
				}
				if worldZ < actualMinZ {
					actualMinZ = worldZ
				}
				if worldX > actualMaxX {
					actualMaxX = worldX
				}
				if worldY > actualMaxY {
					actualMaxY = worldY
				}
				if worldZ > actualMaxZ {
					actualMaxZ = worldZ
				}
			}
		}
	}

	if len(finalBlocks) == 0 {
		return nil, nil, 0, 0, fmt.Errorf("no blocks found in specified range")
	}

	sizeX := actualMaxX - actualMinX + 1
	sizeY := actualMaxY - actualMinY + 1
	sizeZ := actualMaxZ - actualMinZ + 1

	for i := range finalBlocks {
		finalBlocks[i].Pos[0] -= actualMinX
		finalBlocks[i].Pos[1] -= actualMinY
		finalBlocks[i].Pos[2] -= actualMinZ
	}

	modBlocks, modPalette := buildnbt.PostProcessBlocks(finalBlocks, finalPalette)

	nbtBytes, err := buildnbt.BuildStructureNbt([]int32{sizeX, sizeY, sizeZ}, modPalette, modBlocks, 3953)
	return nbtBytes, []int32{sizeX, sizeY, sizeZ}, len(finalBlocks), len(finalPalette), err
}
