package subchunk

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"strings"
)

// Constants for NBT Tags
const (
	TagEnd       = 0
	TagByte      = 1
	TagShort     = 2
	TagInt       = 3
	TagLong      = 4
	TagFloat     = 5
	TagDouble    = 6
	TagByteArray = 7
	TagString    = 8
	TagList      = 9
	TagCompound  = 10
	TagIntArray  = 11
	TagLongArray = 12
)

type BlockPaletteEntry struct {
	Name       string
	Properties map[string]interface{}
}

type SubChunkResult struct {
	Palette []BlockPaletteEntry
	Blocks  []uint16
}

type nbtReader struct {
	buf []byte
	pos int
}

func (r *nbtReader) readByte() byte {
	if r.pos >= len(r.buf) {
		return 0
	}
	b := r.buf[r.pos]
	r.pos++
	return b
}

func (r *nbtReader) readSignedByte() int8 {
	return int8(r.readByte())
}

func (r *nbtReader) readShortLE() int16 {
	if r.pos+2 > len(r.buf) {
		return 0
	}
	v := int16(binary.LittleEndian.Uint16(r.buf[r.pos:]))
	r.pos += 2
	return v
}

func (r *nbtReader) readIntLE() int32 {
	if r.pos+4 > len(r.buf) {
		return 0
	}
	v := int32(binary.LittleEndian.Uint32(r.buf[r.pos:]))
	r.pos += 4
	return v
}

func (r *nbtReader) readLongLE() int64 {
	if r.pos+8 > len(r.buf) {
		return 0
	}
	v := int64(binary.LittleEndian.Uint64(r.buf[r.pos:]))
	r.pos += 8
	return v
}

func (r *nbtReader) readFloatLE() float32 {
	if r.pos+4 > len(r.buf) {
		return 0
	}
	v := math.Float32frombits(binary.LittleEndian.Uint32(r.buf[r.pos:]))
	r.pos += 4
	return v
}

func (r *nbtReader) readDoubleLE() float64 {
	if r.pos+8 > len(r.buf) {
		return 0
	}
	v := math.Float64frombits(binary.LittleEndian.Uint64(r.buf[r.pos:]))
	r.pos += 8
	return v
}

func (r *nbtReader) readStringLE() string {
	if r.pos+2 > len(r.buf) {
		return ""
	}
	l := int(binary.LittleEndian.Uint16(r.buf[r.pos:]))
	r.pos += 2
	if r.pos+l > len(r.buf) {
		r.pos = len(r.buf)
		return ""
	}
	s := string(r.buf[r.pos : r.pos+l])
	r.pos += l
	return s
}

func (r *nbtReader) readNamedTag() (string, byte, interface{}) {
	t := r.readByte()
	if t == TagEnd {
		return "", t, nil
	}
	name := r.readStringLE()
	val := r.readPayload(t)
	return name, t, val
}

func (r *nbtReader) readCompound() map[string]interface{} {
	m := make(map[string]interface{})
	for r.pos < len(r.buf) {
		name, t, val := r.readNamedTag()
		if t == TagEnd {
			break
		}
		m[name] = val
	}
	return m
}

func (r *nbtReader) readPayload(t byte) interface{} {
	switch t {
	case TagByte:
		return r.readSignedByte()
	case TagShort:
		return r.readShortLE()
	case TagInt:
		return r.readIntLE()
	case TagLong:
		return r.readLongLE()
	case TagFloat:
		return r.readFloatLE()
	case TagDouble:
		return r.readDoubleLE()
	case TagByteArray:
		l := int(r.readIntLE())
		if r.pos+l > len(r.buf) {
			l = len(r.buf) - r.pos
		}
		arr := make([]byte, l)
		copy(arr, r.buf[r.pos:r.pos+l])
		r.pos += l
		return arr
	case TagString:
		return r.readStringLE()
	case TagList:
		listType := r.readByte()
		listLen := int(r.readIntLE())
		if listLen < 0 || listLen > 10000 {
			return nil
		}
		arr := make([]interface{}, listLen)
		for i := 0; i < listLen; i++ {
			arr[i] = r.readPayload(listType)
		}
		return arr
	case TagCompound:
		return r.readCompound()
	case TagIntArray:
		l := int(r.readIntLE())
		if l < 0 || l > 10000 {
			return nil
		}
		arr := make([]int32, l)
		for i := 0; i < l; i++ {
			arr[i] = r.readIntLE()
		}
		return arr
	case TagLongArray:
		l := int(r.readIntLE())
		if l < 0 || l > 10000 {
			return nil
		}
		arr := make([]int64, l)
		for i := 0; i < l; i++ {
			arr[i] = r.readLongLE()
		}
		return arr
	default:
		// recover gracefully from bad tags instead of crashing
		return nil
	}
}

func readPaletteCompound(r *nbtReader) (BlockPaletteEntry, error) {
	t := r.readByte()
	if t != TagCompound {
		return BlockPaletteEntry{}, errors.New("expected TagCompound")
	}
	r.readStringLE() // Empty root name
	comp := r.readCompound()

	name := "minecraft:air"
	if n, ok := comp["name"].(string); ok {
		name = n
	}
	if !strings.Contains(name, ":") {
		name = "minecraft:" + name
	}

	props := make(map[string]interface{})
	if states, ok := comp["states"].(map[string]interface{}); ok {
		for k, v := range states {
			// Extract mapped value directly to match js semantics for primitive mappings
			if valMap, isMap := v.(map[string]interface{}); isMap {
				if actualVal, hasVal := valMap["value"]; hasVal {
					props[k] = actualVal
					continue
				}
			}
			props[k] = v
		}
	}

	return BlockPaletteEntry{Name: name, Properties: props}, nil
}

func ParseSubChunk(buffer []byte) (*SubChunkResult, error) {
	if len(buffer) == 0 {
		return nil, errors.New("empty buffer")
	}
	offset := 0
	version := buffer[offset]
	offset++

	if version < 8 {
		return nil, fmt.Errorf("unsupported subchunk version: %d", version)
	}

	numLayers := buffer[offset]
	offset++
	if version == 9 {
		offset++ // skip y-index
	}
	if numLayers == 0 {
		return nil, errors.New("no block layers")
	}

	if offset >= len(buffer) {
		return nil, errors.New("buffer too small")
	}

	header := buffer[offset]
	offset++
	bitsPerBlock := uint(header >> 1)

	blocks := make([]uint16, 4096)
	if bitsPerBlock == 0 {
		r := &nbtReader{buf: buffer, pos: offset}
		comp, _ := readPaletteCompound(r)
		return &SubChunkResult{
			Palette: []BlockPaletteEntry{comp},
			Blocks:  blocks,
		}, nil
	}

	blocksPerWord := 32 / bitsPerBlock
	numWords := int(math.Ceil(4096.0 / float64(blocksPerWord)))
	mask := uint32((1 << bitsPerBlock) - 1)

	blockIndex := 0
	for word := 0; word < numWords; word++ {
		if offset+4 > len(buffer) {
			break
		}
		val := binary.LittleEndian.Uint32(buffer[offset:])
		offset += 4
		for b := 0; b < int(blocksPerWord) && blockIndex < 4096; b++ {
			blocks[blockIndex] = uint16((val >> (bitsPerBlock * uint(b))) & mask)
			blockIndex++
		}
	}

	if offset+4 > len(buffer) {
		return &SubChunkResult{
			Palette: []BlockPaletteEntry{{Name: "minecraft:air", Properties: make(map[string]interface{})}},
			Blocks:  blocks,
		}, nil
	}

	paletteSize := int(binary.LittleEndian.Uint32(buffer[offset:]))
	offset += 4

	palette := make([]BlockPaletteEntry, 0, paletteSize)
	reader := &nbtReader{buf: buffer, pos: offset}

	for i := 0; i < paletteSize; i++ {
		entry, err := readPaletteCompound(reader)
		if err != nil {
			palette = append(palette, BlockPaletteEntry{Name: "minecraft:unknown", Properties: make(map[string]interface{})})
			break
		}
		palette = append(palette, entry)
	}

	return &SubChunkResult{
		Palette: palette,
		Blocks:  blocks,
	}, nil
}
