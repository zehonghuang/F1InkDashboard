package motorsportlive

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseStandingsFromPayloadSample(t *testing.T) {
	samplePath := filepath.Clean(filepath.Join("..", "..", "..", "dd.txt"))
	payload, err := os.ReadFile(samplePath)
	if err != nil {
		t.Fatalf("read sample payload: %v", err)
	}

	got, err := parseStandingsFromPayload(1, payload)
	if err != nil {
		t.Fatalf("parse sample payload: %v", err)
	}
	if got == nil {
		t.Fatal("expected parsed standings, got nil")
	}
	if got.Status == "" {
		t.Fatal("expected non-empty status")
	}
	if got.SessionTitle == "" {
		t.Fatal("expected non-empty session title")
	}
	if len(got.Rows) == 0 {
		t.Fatal("expected standings rows")
	}
}
