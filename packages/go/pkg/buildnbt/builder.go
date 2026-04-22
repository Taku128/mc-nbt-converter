package buildnbt

import (
	"bytes"
	"compress/gzip"
	"io"

	"github.com/Tnze/go-mc/nbt"
)

// ListTag is a helper to force a TAG_List of Ints instead of TAG_Int_Array
type ListTag []int32

func (l ListTag) TagType() byte {
	return 9 // TAG_List
}

func (l ListTag) MarshalNBT(w io.Writer) error {
	var buf [5]byte
	buf[0] = 3 // TAG_Int
	buf[1] = byte(len(l) >> 24)
	buf[2] = byte(len(l) >> 16)
	buf[3] = byte(len(l) >> 8)
	buf[4] = byte(len(l))
	if _, err := w.Write(buf[:]); err != nil {
		return err
	}
	for _, v := range l {
		var vBuf [4]byte
		vBuf[0] = byte(v >> 24)
		vBuf[1] = byte(v >> 16)
		vBuf[2] = byte(v >> 8)
		vBuf[3] = byte(v)
		if _, err := w.Write(vBuf[:]); err != nil {
			return err
		}
	}
	return nil
}

type BlockPos struct {
	Pos   ListTag `nbt:"pos"`
	State int32   `nbt:"state"`
}

type PaletteEntry struct {
	Name       string            `nbt:"Name"`
	Properties map[string]string `nbt:"Properties,omitempty"`
}

type Structure struct {
	Size        ListTag        `nbt:"size"`
	Palette     []PaletteEntry `nbt:"palette"`
	Blocks      []BlockPos     `nbt:"blocks"`
	DataVersion int32          `nbt:"DataVersion"`
}

// BuildStructureNbt takes the structural components and returns a gzipped Java Edition NBT byte slice.
func BuildStructureNbt(size []int32, palette []PaletteEntry, blocks []BlockPos, dataVersion int32) ([]byte, error) {
	if dataVersion == 0 {
		dataVersion = 3953
	}

	s := Structure{
		Size:        ListTag(size),
		Palette:     palette,
		Blocks:      blocks,
		DataVersion: dataVersion,
	}

	var raw bytes.Buffer
	// Create an uncompressed NBT encoder (Go-MC writes big-endian)
	err := nbt.NewEncoder(&raw).Encode(s, "")
	if err != nil {
		return nil, err
	}

	var zipped bytes.Buffer
	w := gzip.NewWriter(&zipped)
	if _, err := w.Write(raw.Bytes()); err != nil {
		return nil, err
	}
	if err := w.Close(); err != nil {
		return nil, err
	}

	return zipped.Bytes(), nil
}
