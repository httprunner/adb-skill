---
name: videodl-kwai
description: Resolve Kuaishou (快手 / Kwai) share links or share text into the underlying video CDN URL using the CharlesPikachu/videodl (videofetch) parser. Use when given a single link or a batch list and you must output JSONL with url/cdn_url/error_msg.
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

- Resolve a batch list (one item per line):

```bash
uv run python scripts/resolve_kuaishou_cdn.py --input-file ks-urls.txt --output ks-urls.cdn.jsonl --workers 10 --batch-size 10 --progress-every 1
```

## Output Format (JSONL)

Each line is:

```json
{"url": "original share link", "cdn_url": "resolved CDN url", "error_msg": ""}
```

- `url`: The extracted share link (original input link).
- `cdn_url`: The resolved CDN URL if available.
- `error_msg`: Non-empty when resolution fails.

## Behavior Notes

- Extract the first URL from share text automatically.
- Follow redirects for `v.kuaishou.com` short links before parsing.
- Use `videodl.VideoClient(...).parsefromurl(...)` and choose the first usable URL in the response.
- Preserve input order in batch mode.
- Print progress to stderr and append JSONL output in batches for long runs.
- When CDN resolution fails, attempt to detect common "removed/unavailable" messages and put them in `error_msg`.

## References

- For the minimal Python API needed to parse URLs, open `references/videodl_api.md`.
