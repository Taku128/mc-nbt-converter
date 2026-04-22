package test_test

import (
	"bytes"
	"compress/gzip"
	"flag"
	"os"
	"reflect"
	"testing"

	"github.com/Tnze/go-mc/nbt"
	bedrocknbt "github.com/Taku128/mc-nbt-converter/packages/go"
)

var update = flag.Bool("update", false, "update the generated expected NBT snapshot")

func TestConvertMcworldSnapshot(t *testing.T) {
	opts := &bedrocknbt.ConvertOptions{
		MinX:      -100,
		MaxX:      100,
		MinY:      -64,
		MaxY:      320,
		MinZ:      -100,
		MaxZ:      100,
		Dimension: 0,
	}

	resultZipped, _, _, _, err := bedrocknbt.ConvertMcworld("testdata/Elevator.mcworld", opts)
	if err != nil {
		t.Fatalf("failed to convert .mcworld: %v", err)
	}

	compareSnapshot(t, "testdata/expected_mcworld.nbt", resultZipped)
}

func TestConvertMcstructureSnapshot(t *testing.T) {
	resultZipped, _, _, _, err := bedrocknbt.ConvertMcstructure("testdata/elevator.mcstructure")
	if err != nil {
		t.Fatalf("failed to convert .mcstructure: %v", err)
	}

	compareSnapshot(t, "testdata/expected_mcstructure.nbt", resultZipped)
}

func compareSnapshot(t *testing.T, snapshotFile string, resultZipped []byte) {
	t.Helper()

	if *update {
		if err := os.WriteFile(snapshotFile, resultZipped, 0644); err != nil {
			t.Fatalf("failed to write snapshot: %v", err)
		}
		t.Logf("Snapshot updated: %s", snapshotFile)
		return
	}

	expectedZipped, err := os.ReadFile(snapshotFile)
	if err != nil {
		t.Fatalf("failed to read expected snapshot (run with -update to generate): %v", err)
	}

	var resultRaw bytes.Buffer
	zr, err := gzip.NewReader(bytes.NewReader(resultZipped))
	if err != nil {
		t.Fatalf("failed to gunzip result: %v", err)
	}
	defer zr.Close()
	if _, err := resultRaw.ReadFrom(zr); err != nil {
		t.Fatalf("failed to read result body: %v", err)
	}

	var expectedRaw bytes.Buffer
	er, err := gzip.NewReader(bytes.NewReader(expectedZipped))
	if err != nil {
		t.Fatalf("failed to gunzip expected: %v", err)
	}
	defer er.Close()
	if _, err := expectedRaw.ReadFrom(er); err != nil {
		t.Fatalf("failed to read expected body: %v", err)
	}

	var resultData, expectedData map[string]interface{}

	if _, err := nbt.NewDecoder(&resultRaw).Decode(&resultData); err != nil {
		t.Fatalf("failed to decode result nbt: %v", err)
	}
	if _, err := nbt.NewDecoder(&expectedRaw).Decode(&expectedData); err != nil {
		t.Fatalf("failed to decode expected nbt: %v", err)
	}

	if !reflect.DeepEqual(resultData, expectedData) {
		t.Errorf("Result structure does not match expected snapshot %s", snapshotFile)
	}
}
