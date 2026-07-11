package mcstruct

import (
	"encoding/binary"
	"errors"
	"testing"
)

// craftHugeIntArray は「TAG_Int_Array で巨大長を宣言するが実データが無い」細工 NBT を作る。
// gophertunnel はこの宣言長で make([]int32, n) を試み ~n*4 バイトを割り当ててしまう。
func craftHugeIntArray(declared int32) []byte {
	var b []byte
	b = append(b, tagCompound) // root
	b = append(b, 0x00, 0x00)  // root name len 0
	b = append(b, tagIntArray) // child
	b = append(b, 0x03, 0x00)  // name len 3
	b = append(b, 'e', 'v', 'l')
	le := make([]byte, 4)
	binary.LittleEndian.PutUint32(le, uint32(declared))
	b = append(b, le...) // 宣言長のみ (実データなし)
	// TAG_End は付けない (validator が宣言長で先に弾く)
	return b
}

func TestValidateNbtLE_RejectsHugeArray(t *testing.T) {
	b := craftHugeIntArray(0x1FFFFFFF) // ~536M 要素 = ~2GiB
	if err := validateNbtLE(b); !errors.Is(err, ErrNbtTooLarge) {
		t.Fatalf("expected ErrNbtTooLarge, got %v", err)
	}
}

func TestValidateNbtLE_RejectsHugeByteArray(t *testing.T) {
	var b []byte
	b = append(b, tagCompound, 0x00, 0x00)
	b = append(b, tagByteArray, 0x01, 0x00, 'x')
	le := make([]byte, 4)
	binary.LittleEndian.PutUint32(le, 0x7FFFFFFF)
	b = append(b, le...)
	if err := validateNbtLE(b); !errors.Is(err, ErrNbtTooLarge) {
		t.Fatalf("expected ErrNbtTooLarge, got %v", err)
	}
}

func TestValidateNbtLE_RejectsHugeString(t *testing.T) {
	var b []byte
	b = append(b, tagCompound, 0x00, 0x00)
	b = append(b, tagString, 0x01, 0x00, 's')
	b = append(b, 0xFF, 0xFF) // string len 0xFFFF, no data
	if err := validateNbtLE(b); !errors.Is(err, ErrNbtTooLarge) {
		t.Fatalf("expected ErrNbtTooLarge, got %v", err)
	}
}

func TestValidateNbtLE_AcceptsValidNbt(t *testing.T) {
	// {"": {"n": TAG_Int 42, "arr": TAG_Int_Array [1,2]}} を LE で組む
	var b []byte
	b = append(b, tagCompound, 0x00, 0x00) // root
	// child TAG_Int "n" = 42
	b = append(b, tagInt, 0x01, 0x00, 'n')
	iv := make([]byte, 4)
	binary.LittleEndian.PutUint32(iv, 42)
	b = append(b, iv...)
	// child TAG_Int_Array "arr" = [1, 2]
	b = append(b, tagIntArray, 0x03, 0x00, 'a', 'r', 'r')
	n := make([]byte, 4)
	binary.LittleEndian.PutUint32(n, 2)
	b = append(b, n...)
	for _, v := range []uint32{1, 2} {
		e := make([]byte, 4)
		binary.LittleEndian.PutUint32(e, v)
		b = append(b, e...)
	}
	b = append(b, tagEnd) // close root
	if err := validateNbtLE(b); err != nil {
		t.Fatalf("valid NBT rejected: %v", err)
	}
}

// craftHugeIntArray の入力が実際に ConvertMcstructure で棄却されること (巨大割当なし)。
func TestConvertMcstructure_RejectsCraftedHugeLength(t *testing.T) {
	b := craftHugeIntArray(0x1FFFFFFF)
	if err := validateNbtLE(b); !errors.Is(err, ErrNbtTooLarge) {
		t.Fatalf("pre-flight should reject: %v", err)
	}
}
