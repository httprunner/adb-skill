---
name: videodl-kwai
description: Resolve Kuaishou (快手 / Kwai) share links or share text into the underlying video CDN URL using the CharlesPikachu/videodl (videofetch) parser. Use when given a single link or a CSV file with URL fields and you must output JSONL (either url/cdn_url/error_msg or original CSV fields plus CDNURL/error_msg).
---

# Videodl Kwai

Extract CDN URLs for Kuaishou share links using the videodl (videofetch) library without downloading videos.

## Quick Start

- Create venv and install dependencies:

```bash
uv venv .venv
uv sync
```

- Resolve a single share link or share text:

```bash
uv run python scripts/resolve_kuaishou_cdn.py "https://v.kuaishou.com/8qIlZu" > single.jsonl
uv run python scripts/resolve_kuaishou_cdn.py "复制这条信息打开快手App观看 https://v.kuaishou.com/8qIlZu" > single.jsonl
```

- Resolve from CSV rows and merge CDNURL into each row:

```bash
uv run python scripts/resolve_kuaishou_cdn.py --input-csv data.csv --csv-url-field URL --output data.cdn.jsonl --workers 10 --progress-every 1
```

## Output Format (JSONL)

For single link or line-based batch inputs, each line is:

```json
{"url": "original share link", "cdn_url": "resolved CDN url", "error_msg": ""}
```

- `url`: The extracted share link (original input link).
- `cdn_url`: The resolved CDN URL if available.
- `error_msg`: Non-empty when resolution fails.

For CSV inputs, each JSONL line preserves all original CSV columns and appends `CDNURL` plus `error_msg`:

```json
{"URL": "https://www.kuaishou.com/short-video/...", "Caption": "...", "UserName": "...", "BookID": "...", "UserID": "...", "CDNURL": "https://...", "error_msg": "" }
```

## Behavior Notes

- Extract the first URL from share text automatically.
- Follow redirects for `v.kuaishou.com` short links before parsing.
- Use `videodl.VideoClient(...).parsefromurl(...)` and choose the first usable URL in the response.
- Preserve input order in batch mode.
- Print progress to stderr and append JSONL output in batches for long runs.
- When CDN resolution fails, attempt to detect common "removed/unavailable" messages and put them in `error_msg`.
- For CSV input, leave `CDNURL` empty and populate `error_msg` when resolution fails.
- For CSV input, write JSONL in small batches so progress is visible in the output file.

## References

- For the minimal Python API needed to parse URLs, open `references/videodl_api.md`.
