---
name: resolve-kwai-cdn-url
description: Resolve Kuaishou (快手 / Kwai) share links or share text into video CDN URLs. Use for single links, share text, or CSV inputs when output must be JSONL with CDNURL/error_msg. Prefer videodl (videofetch); fall back to GraphQL/mobile-page extraction with cookies when needed.
---

# Resolve Kwai CDN URL

Extract CDN URLs from Kuaishou share links with two paths:
- videodl (videofetch): fast, no-cookie.
- GraphQL/mobile-page: cookie-friendly fallback when videodl fails.

## Fast path (videodl)

```bash
uv venv .venv
uv sync
uv run python scripts/kwai_videodl_resolve.py "https://v.kuaishou.com/8qIlZu" > single.jsonl
uv run python scripts/kwai_videodl_resolve.py --input-csv data.csv --csv-url-field URL --output output.jsonl --workers 10
uv run python scripts/kwai_videodl_resolve.py --input-csv data.csv --csv-url-field URL --output output.jsonl --workers 10 --resume
```

## Fallback path (GraphQL/mobile-page)

```bash
uv run python scripts/kwai_extract_cdn.py "https://www.kuaishou.com/short-video/3xu6tezif2v55m2" --cookie "<YOUR_COOKIE>"
uv run python scripts/kwai_extract_cdn.py "https://www.kuaishou.com/short-video/3xu6tezif2v55m2" --cookie-file cookie.json
uv run python scripts/kwai_csv_to_jsonl.py data.csv --url-col URL --cdn-col CDNURL --cookie "<YOUR_COOKIE>" --workers 10 --output output.jsonl
uv run python scripts/kwai_csv_to_jsonl.py data.csv --url-col URL --cdn-col CDNURL --cookie-file cookie.json --workers 10 --output output.jsonl
uv run python scripts/kwai_csv_to_jsonl.py data.csv --url-col URL --cdn-col CDNURL --cookie "<YOUR_COOKIE>" --workers 10 --output output.jsonl --resume
```

## Output

- videodl: `{"url": "...", "cdn_url": "...", "error_msg": ""}`
- CSV mode (both paths): original columns + `CDNURL` + optional `error_msg`

## Notes

- videodl auto-extracts the first URL from share text and follows `v.kuaishou.com` redirects.
- GraphQL path tries GraphQL, then mobile `INIT_STATE`, then HTML state parsing.
- If blocked, pass a real browser cookie via `--cookie` or `--cookie-file`.
- `--cookie` expects a raw Cookie header string, e.g. `kpf=PC_WEB; clientid=3; did=...`.
- `--cookie-file` accepts either a raw Cookie header string or a JSON cookie array export (list of `{name,value}` objects).
- `--resume` rewrites output JSONL to keep only successful rows, then retries missing/failed rows and appends new results.

## Resources

- `scripts/kwai_videodl_resolve.py`: videodl-based resolver.
- `scripts/kwai_extract_cdn.py`: GraphQL/mobile-page resolver.
- `scripts/kwai_csv_to_jsonl.py`: CSV -> JSONL (GraphQL/mobile-page).
- `scripts/kwai_common.py`: shared helpers for resume and JSONL processing.
- `references/videodl_api.md`: minimal videodl API.
- `references/kuaishou_graphql.md`: GraphQL endpoints/payload notes.
