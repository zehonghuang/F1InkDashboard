package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"path/filepath"
	"strings"
	"time"
)

func nowUTCISO8601() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}

func randHex(nBytes int) string {
	if nBytes < 1 {
		nBytes = 1
	}
	b := make([]byte, nBytes)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func safeExtFromFilename(name string) string {
	ext := strings.ToLower(filepath.Ext(name))
	if len(ext) > 16 {
		return ""
	}
	switch ext {
	case ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bin", ".wav", ".mp3":
		return ext
	default:
		return ext
	}
}
