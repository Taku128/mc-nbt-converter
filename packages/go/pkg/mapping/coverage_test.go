package mapping

import "testing"

// TestMappingCoverage verifies every Bedrock block name found in the mapping
// sources can be processed by MapBlock without panicking and produces a
// non-empty Java name.
func TestMappingCoverage(t *testing.T) {
	known := KnownBedrockBlocks()
	if len(known) == 0 {
		t.Fatal("no known Bedrock blocks loaded — mapping data not embedded correctly")
	}

	ResetUnmapped()
	failures := 0

	for _, name := range known {
		result := MapBlock(name, map[string]interface{}{})
		if result.Name == "" {
			t.Errorf("empty Java name for %q", name)
			failures++
		}
	}

	fellThrough := ReportUnmapped()
	t.Logf("Known Bedrock blocks: %d", len(known))
	t.Logf("Failed: %d", failures)
	t.Logf("Fell through to fallback layer: %d", len(fellThrough))

	if failures > 0 {
		t.Fatalf("%d mapping failures", failures)
	}
}
