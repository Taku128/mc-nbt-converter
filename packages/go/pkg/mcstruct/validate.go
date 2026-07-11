package mcstruct

import (
	"encoding/binary"
	"errors"
)

// ErrNbtTooLarge は宣言された長さがバッファ残量と整合しない (細工ファイルの疑い) 場合に返す。
var ErrNbtTooLarge = errors.New("nbt: declared length exceeds remaining bytes")

// gophertunnel の LittleEndian NBT デコーダは TAG_Byte_Array / TAG_*_Array / TAG_List /
// TAG_String の宣言長を残余バイト数で検証せずに割り当てる。そのため数百バイトの細工
// ファイルで GB 級の割当を誘発でき、recover では捕捉できない runtime OOM の恐れがある。
//
// validateNbtLE は UnmarshalEncoding の前段で NBT を「割り当てなしに」走査し、すべての
// 宣言長がバッファ残量と要素サイズに対して整合することを確認する。整合しなければ
// ErrNbtTooLarge を返して巨大割当そのものを起こさせない。O(バイト数) で完了する。
const (
	nbtMaxDepth = 512 // 深いネストによるスタック枯渇の上限
)

type nbtScanner struct {
	b     []byte
	pos   int
	depth int
}

func validateNbtLE(b []byte) error {
	s := &nbtScanner{b: b}
	// ルートは名前付き compound (または稀に他タグ)。gophertunnel と同じく先頭タグを読む。
	typ, err := s.u8()
	if err != nil {
		return err
	}
	if typ == tagEnd {
		return nil
	}
	if err := s.skipName(); err != nil {
		return err
	}
	return s.skipPayload(typ)
}

const (
	tagEnd       = 0
	tagByte      = 1
	tagShort     = 2
	tagInt       = 3
	tagLong      = 4
	tagFloat     = 5
	tagDouble    = 6
	tagByteArray = 7
	tagString    = 8
	tagList      = 9
	tagCompound  = 10
	tagIntArray  = 11
	tagLongArray = 12
)

func (s *nbtScanner) u8() (byte, error) {
	if s.pos+1 > len(s.b) {
		return 0, ErrNbtTooLarge
	}
	v := s.b[s.pos]
	s.pos++
	return v, nil
}

// need は n バイトの残量を確認して消費する (割り当てはしない)。
func (s *nbtScanner) need(n int) error {
	if n < 0 || s.pos+n > len(s.b) || s.pos+n < s.pos { // オーバーフロー含む
		return ErrNbtTooLarge
	}
	s.pos += n
	return nil
}

func (s *nbtScanner) u16() (int, error) {
	if s.pos+2 > len(s.b) {
		return 0, ErrNbtTooLarge
	}
	v := int(binary.LittleEndian.Uint16(s.b[s.pos:]))
	s.pos += 2
	return v, nil
}

func (s *nbtScanner) i32() (int, error) {
	if s.pos+4 > len(s.b) {
		return 0, ErrNbtTooLarge
	}
	v := int(int32(binary.LittleEndian.Uint32(s.b[s.pos:])))
	s.pos += 4
	return v, nil
}

// skipName は tag 名 (u16 長 + bytes) を読み飛ばす。
func (s *nbtScanner) skipName() error {
	n, err := s.u16()
	if err != nil {
		return err
	}
	return s.need(n)
}

func (s *nbtScanner) skipPayload(typ byte) error {
	s.depth++
	if s.depth > nbtMaxDepth {
		return ErrNbtTooLarge
	}
	defer func() { s.depth-- }()

	switch typ {
	case tagByte:
		return s.need(1)
	case tagShort:
		return s.need(2)
	case tagInt, tagFloat:
		return s.need(4)
	case tagLong, tagDouble:
		return s.need(8)
	case tagByteArray:
		n, err := s.i32()
		if err != nil {
			return err
		}
		return s.need(n) // 1 byte/elem
	case tagString:
		n, err := s.u16()
		if err != nil {
			return err
		}
		return s.need(n)
	case tagIntArray:
		n, err := s.i32()
		if err != nil {
			return err
		}
		return s.needMul(n, 4)
	case tagLongArray:
		n, err := s.i32()
		if err != nil {
			return err
		}
		return s.needMul(n, 8)
	case tagList:
		elemType, err := s.u8()
		if err != nil {
			return err
		}
		n, err := s.i32()
		if err != nil {
			return err
		}
		if n < 0 {
			return ErrNbtTooLarge
		}
		for i := 0; i < n; i++ {
			if err := s.skipPayload(elemType); err != nil {
				return err
			}
		}
		return nil
	case tagCompound:
		for {
			ct, err := s.u8()
			if err != nil {
				return err
			}
			if ct == tagEnd {
				return nil
			}
			if err := s.skipName(); err != nil {
				return err
			}
			if err := s.skipPayload(ct); err != nil {
				return err
			}
		}
	case tagEnd:
		return nil
	default:
		return ErrNbtTooLarge // 未知タグ = 破損とみなす
	}
}

// needMul は count*elem バイトをオーバーフロー安全に確認・消費する。
func (s *nbtScanner) needMul(count, elem int) error {
	if count < 0 || elem <= 0 {
		return ErrNbtTooLarge
	}
	// count*elem のオーバーフローを避けるため残量との比較を割り算で行う。
	if count > (len(s.b)-s.pos)/elem {
		return ErrNbtTooLarge
	}
	s.pos += count * elem
	return nil
}
