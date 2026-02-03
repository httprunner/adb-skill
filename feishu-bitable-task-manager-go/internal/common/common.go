package common

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	DefaultBaseURL  = "https://open.feishu.cn"
	DefaultPageSize = 200
	MaxPageSize     = 500
)

var TaskFieldEnvMap = map[string]string{
	"TASK_FIELD_TASKID":            "TaskID",
	"TASK_FIELD_BIZ_TASK_ID":       "BizTaskID",
	"TASK_FIELD_PARENT_TASK_ID":    "ParentTaskID",
	"TASK_FIELD_APP":               "App",
	"TASK_FIELD_SCENE":             "Scene",
	"TASK_FIELD_PARAMS":            "Params",
	"TASK_FIELD_ITEMID":            "ItemID",
	"TASK_FIELD_BOOKID":            "BookID",
	"TASK_FIELD_URL":               "URL",
	"TASK_FIELD_USERID":            "UserID",
	"TASK_FIELD_USERNAME":          "UserName",
	"TASK_FIELD_DATE":              "Date",
	"TASK_FIELD_STATUS":            "Status",
	"TASK_FIELD_LOGS":              "Logs",
	"TASK_FIELD_LAST_SCREEN_SHOT":  "LastScreenShot",
	"TASK_FIELD_GROUPID":           "GroupID",
	"TASK_FIELD_DEVICE_SERIAL":     "DeviceSerial",
	"TASK_FIELD_DISPATCHED_DEVICE": "DispatchedDevice",
	"TASK_FIELD_DISPATCHED_AT":     "DispatchedAt",
	"TASK_FIELD_START_AT":          "StartAt",
	"TASK_FIELD_END_AT":            "EndAt",
	"TASK_FIELD_ELAPSED_SECONDS":   "ElapsedSeconds",
	"TASK_FIELD_ITEMS_COLLECTED":   "ItemsCollected",
	"TASK_FIELD_EXTRA":             "Extra",
	"TASK_FIELD_RETRYCOUNT":        "RetryCount",
}

type BitableRef struct {
	RawURL    string
	AppToken  string
	TableID   string
	ViewID    string
	WikiToken string
}

func Env(name, def string) string {
	v := strings.TrimSpace(os.Getenv(name))
	if v == "" {
		return def
	}
	return v
}

func ClampPageSize(size int) int {
	if size <= 0 {
		return DefaultPageSize
	}
	if size > MaxPageSize {
		return MaxPageSize
	}
	return size
}

func firstQueryValue(q url.Values, keys ...string) string {
	for _, k := range keys {
		vals := q[k]
		for _, v := range vals {
			v = strings.TrimSpace(v)
			if v != "" {
				return v
			}
		}
	}
	return ""
}

func ParseBitableURL(raw string) (BitableRef, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return BitableRef{}, errors.New("bitable url is empty")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return BitableRef{}, err
	}
	if u.Scheme == "" {
		return BitableRef{}, errors.New("bitable url missing scheme")
	}

	segments := []string{}
	for _, s := range strings.Split(strings.Trim(u.Path, "/"), "/") {
		if s != "" {
			segments = append(segments, s)
		}
	}

	appToken := ""
	wikiToken := ""
	for i := 0; i < len(segments)-1; i++ {
		if segments[i] == "base" {
			appToken = segments[i+1]
			break
		}
		if segments[i] == "wiki" {
			wikiToken = segments[i+1]
		}
	}
	if appToken == "" && wikiToken == "" {
		if len(segments) > 0 {
			appToken = segments[len(segments)-1]
		}
	}

	q := u.Query()
	tableID := firstQueryValue(q, "table", "tableId", "table_id")
	viewID := firstQueryValue(q, "view", "viewId", "view_id")
	if tableID == "" {
		return BitableRef{}, errors.New("missing table_id in bitable url query")
	}
	return BitableRef{
		RawURL:    raw,
		AppToken:  appToken,
		TableID:   tableID,
		ViewID:    viewID,
		WikiToken: wikiToken,
	}, nil
}

func LoadTaskFieldsFromEnv() map[string]string {
	fields := map[string]string{}
	for _, v := range TaskFieldEnvMap {
		fields[v] = v
	}
	for envName, defName := range TaskFieldEnvMap {
		if o := Env(envName, ""); o != "" {
			fields[defName] = o
		}
	}
	return fields
}

type httpClient struct {
	c *http.Client
}

func newHTTPClient() *httpClient {
	return &httpClient{c: &http.Client{Timeout: 30 * time.Second}}
}

func RequestJSON(method, urlStr, token string, payload any, out any) error {
	return newHTTPClient().RequestJSON(method, urlStr, token, payload, out)
}

func (h *httpClient) RequestJSON(method, urlStr, token string, payload any, out any) error {
	var body io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, urlStr, body)
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := h.c.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode/100 != 2 {
		return fmt.Errorf("http %d: %s", resp.StatusCode, string(raw))
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(raw, out)
}

type FeishuResp struct {
	Code int    `json:"code"`
	Msg  string `json:"msg"`
}

type tenantTokenResp struct {
	FeishuResp
	TenantAccessToken string `json:"tenant_access_token"`
}

func GetTenantAccessToken(baseURL, appID, appSecret string) (string, error) {
	urlStr := strings.TrimRight(baseURL, "/") + "/open-apis/auth/v3/tenant_access_token/internal"
	payload := map[string]string{"app_id": appID, "app_secret": appSecret}
	var resp tenantTokenResp
	if err := RequestJSON(http.MethodPost, urlStr, "", payload, &resp); err != nil {
		return "", err
	}
	if resp.Code != 0 {
		return "", fmt.Errorf("tenant token error: code=%d msg=%s", resp.Code, resp.Msg)
	}
	tok := strings.TrimSpace(resp.TenantAccessToken)
	if tok == "" {
		return "", errors.New("tenant token missing in response")
	}
	return tok, nil
}

type wikiNodeResp struct {
	FeishuResp
	Data struct {
		Node struct {
			ObjType  string `json:"obj_type"`
			ObjToken string `json:"obj_token"`
		} `json:"node"`
	} `json:"data"`
}

func ResolveWikiAppToken(baseURL, token, wikiToken string) (string, error) {
	wikiToken = strings.TrimSpace(wikiToken)
	if wikiToken == "" {
		return "", errors.New("wiki token is empty")
	}
	urlStr := strings.TrimRight(baseURL, "/") + "/open-apis/wiki/v2/spaces/get_node?token=" + url.QueryEscape(wikiToken)
	var resp wikiNodeResp
	if err := RequestJSON(http.MethodGet, urlStr, token, nil, &resp); err != nil {
		return "", err
	}
	if resp.Code != 0 {
		return "", fmt.Errorf("wiki node error: code=%d msg=%s", resp.Code, resp.Msg)
	}
	if strings.TrimSpace(resp.Data.Node.ObjType) != "bitable" {
		return "", fmt.Errorf("wiki node obj_type is %s, not bitable", resp.Data.Node.ObjType)
	}
	objToken := strings.TrimSpace(resp.Data.Node.ObjToken)
	if objToken == "" {
		return "", errors.New("wiki node obj_token missing")
	}
	return objToken, nil
}

func BitableValueToString(v any) string {
	return strings.TrimSpace(NormalizeBitableValue(v))
}

func NormalizeBitableValue(v any) string {
	if v == nil {
		return ""
	}
	switch x := v.(type) {
	case string:
		return strings.TrimSpace(x)
	case []byte:
		return strings.TrimSpace(string(x))
	case bool:
		if x {
			return "true"
		}
		return "false"
	case int:
		return strconv.Itoa(x)
	case int64:
		return strconv.FormatInt(x, 10)
	case float64:
		if x == float64(int64(x)) {
			return strconv.FormatInt(int64(x), 10)
		}
		return strconv.FormatFloat(x, 'f', -1, 64)
	case []any:
		// python behavior:
		// - rich text arrays join with " "
		// - otherwise normalize each and join with ","
		if isRichTextArray(x) {
			return joinRichText(x)
		}
		parts := make([]string, 0, len(x))
		for _, it := range x {
			if s := strings.TrimSpace(NormalizeBitableValue(it)); s != "" {
				parts = append(parts, s)
			}
		}
		return strings.Join(parts, ",")
	case map[string]any:
		for _, k := range []string{"value", "values", "elements", "content"} {
			if nv, ok := x[k]; ok {
				if s := strings.TrimSpace(NormalizeBitableValue(nv)); s != "" {
					return s
				}
			}
		}
		if t, ok := x["text"].(string); ok {
			if s := strings.TrimSpace(t); s != "" {
				return s
			}
		}
		for _, k := range []string{"link", "name", "en_name", "email", "id", "user_id", "url", "tmp_url", "file_token"} {
			if nv, ok := x[k]; ok {
				if s := strings.TrimSpace(NormalizeBitableValue(nv)); s != "" {
					return s
				}
			}
		}
		if _, ok := x["address"]; ok || x["location"] != nil || x["pname"] != nil || x["cityname"] != nil || x["adname"] != nil {
			parts := []string{
				strings.TrimSpace(NormalizeBitableValue(x["location"])),
				strings.TrimSpace(NormalizeBitableValue(x["pname"])),
				strings.TrimSpace(NormalizeBitableValue(x["cityname"])),
				strings.TrimSpace(NormalizeBitableValue(x["adname"])),
			}
			filtered := parts[:0]
			for _, p := range parts {
				if p != "" {
					filtered = append(filtered, p)
				}
			}
			if len(filtered) > 0 {
				return strings.Join(filtered, ",")
			}
		}
		return marshalJSONNoEscape(x)
	default:
		return strings.TrimSpace(fmt.Sprintf("%v", v))
	}
}

func isRichTextArray(items []any) bool {
	for _, it := range items {
		if m, ok := it.(map[string]any); ok {
			if _, ok := m["text"]; ok {
				return true
			}
		}
	}
	return false
}

func joinRichText(items []any) string {
	parts := []string{}
	for _, it := range items {
		if m, ok := it.(map[string]any); ok {
			if t, ok := m["text"].(string); ok && strings.TrimSpace(t) != "" {
				parts = append(parts, strings.TrimSpace(t))
				continue
			}
			if nv, ok := m["value"]; ok {
				if s := strings.TrimSpace(NormalizeBitableValue(nv)); s != "" {
					parts = append(parts, s)
					continue
				}
			}
			if s := strings.TrimSpace(NormalizeBitableValue(it)); s != "" {
				parts = append(parts, s)
			}
			continue
		}
		if s := strings.TrimSpace(NormalizeBitableValue(it)); s != "" {
			parts = append(parts, s)
		}
	}
	return strings.Join(parts, " ")
}

func FieldInt(fields map[string]any, name string) int {
	raw := strings.TrimSpace(BitableValueToString(fields[name]))
	if raw == "" {
		return 0
	}
	f, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return 0
	}
	return int(f)
}

func CoerceInt(v any) (int, bool) {
	if v == nil {
		return 0, false
	}
	switch x := v.(type) {
	case bool:
		return 0, false
	case int:
		return x, true
	case int64:
		return int(x), true
	case float64:
		return int(x), true
	case string:
		s := strings.TrimSpace(x)
		if s == "" {
			return 0, false
		}
		f, err := strconv.ParseFloat(s, 64)
		if err != nil {
			return 0, false
		}
		return int(f), true
	default:
		return 0, false
	}
}

func ParseDatetime(raw string) (time.Time, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return time.Time{}, false
	}
	if strings.HasSuffix(raw, "Z") {
		raw = strings.TrimSuffix(raw, "Z") + "+00:00"
	}
	if t, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return t, true
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t, true
	}
	for _, layout := range []string{
		"2006-01-02 15:04:05",
		"2006-01-02",
		"2006-01-02T15:04:05",
		"2006-01-02T15:04:05.000000",
		"2006-01-02T15:04:05.000",
	} {
		if t, err := time.ParseInLocation(layout, raw, time.Local); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}

func CoerceMillis(v any) (int64, bool) {
	if v == nil {
		return 0, false
	}
	switch x := v.(type) {
	case bool:
		return 0, false
	case int:
		return normalizeEpochMillis(int64(x)), true
	case int64:
		return normalizeEpochMillis(x), true
	case float64:
		return normalizeEpochMillis(int64(x)), true
	case string:
		s := strings.TrimSpace(x)
		if s == "" {
			return 0, false
		}
		if strings.EqualFold(s, "now") {
			return time.Now().UnixMilli(), true
		}
		if onlyDigits(s) {
			n, _ := strconv.ParseInt(s, 10, 64)
			return normalizeEpochMillis(n), true
		}
		if t, ok := ParseDatetime(s); ok {
			return t.UnixMilli(), true
		}
		return 0, false
	default:
		return 0, false
	}
}

func normalizeEpochMillis(n int64) int64 {
	// python behavior: treat < 1e11 as seconds
	if n < 100000000000 {
		return n * 1000
	}
	return n
}

func CoerceDatePayload(v any) (any, bool) {
	if v == nil {
		return nil, false
	}
	switch x := v.(type) {
	case bool:
		return nil, false
	case int:
		return normalizeEpochMillis(int64(x)), true
	case int64:
		return normalizeEpochMillis(x), true
	case float64:
		return normalizeEpochMillis(int64(x)), true
	case string:
		s := strings.TrimSpace(x)
		if s == "" {
			return nil, false
		}
		if strings.EqualFold(s, "now") {
			return time.Now().UnixMilli(), true
		}
		if onlyDigits(s) {
			n, _ := strconv.ParseInt(s, 10, 64)
			return normalizeEpochMillis(n), true
		}
		if t, ok := ParseDatetime(s); ok {
			return t.UnixMilli(), true
		}
		// allow raw date string/preset
		return s, true
	default:
		return nil, false
	}
}

func NormalizeExtra(extra any) string {
	if extra == nil {
		return ""
	}
	if s, ok := extra.(string); ok {
		return strings.TrimSpace(s)
	}
	return marshalJSONNoEscape(extra)
}

func onlyDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return s != ""
}

func marshalJSONNoEscape(v any) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return ""
	}
	out := strings.TrimSpace(buf.String())
	return out
}
