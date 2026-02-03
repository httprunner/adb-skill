package cli

import (
	"bufio"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
)

func readAllInput(path string) ([]byte, error) {
	if path == "" {
		return nil, nil
	}
	if path == "-" {
		return io.ReadAll(os.Stdin)
	}
	return os.ReadFile(path)
}

func detectInputFormat(path string, raw []byte) string {
	if path != "" && path != "-" {
		s := strings.ToLower(filepath.Ext(path))
		if s == ".jsonl" {
			return "jsonl"
		}
	}
	stripped := strings.TrimSpace(string(raw))
	if strings.HasPrefix(stripped, "[") || strings.HasPrefix(stripped, "{") {
		return "json"
	}
	return "jsonl"
}

func parseJSONItems(raw []byte) ([]map[string]any, error) {
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return nil, err
	}
	switch t := v.(type) {
	case []any:
		out := make([]map[string]any, 0, len(t))
		for _, it := range t {
			m, ok := it.(map[string]any)
			if ok {
				out = append(out, m)
			}
		}
		return out, nil
	case map[string]any:
		if tasks, ok := t["tasks"].([]any); ok {
			out := make([]map[string]any, 0, len(tasks))
			for _, it := range tasks {
				m, ok := it.(map[string]any)
				if ok {
					out = append(out, m)
				}
			}
			return out, nil
		}
		return []map[string]any{t}, nil
	default:
		return nil, nil
	}
}

func parseJSONLItems(raw []byte) ([]map[string]any, error) {
	out := []map[string]any{}
	scanner := bufio.NewScanner(strings.NewReader(string(raw)))
	// JSONL lines can be long; match Python behavior (no small scanner token limit).
	scanner.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal([]byte(line), &m); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return out, nil
}
