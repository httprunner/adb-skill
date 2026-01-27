---
name: feishu-bitable-task-fetcher
description: Fetch tasks from Feishu Bitable (multi-dimensional table) using a fixed schema, filters, and pagination. Use when building or running task pullers that must match a specific task status table and its field mapping, status presets, and date presets.
---

# Feishu Bitable Task Fetcher

Follow the task table conventions when pulling tasks from Feishu Bitable.

## Workflow

1) Load env and field mappings.
- Require `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `TASK_BITABLE_URL`.
- Apply `TASK_FIELD_*` overrides if the table uses custom column names.

2) Resolve Bitable identity.
- Parse the Bitable URL to get `app_token`/`wiki_token`, `table_id`, and optional `view_id`.
- If the URL is wiki-based, call `wiki/v2/spaces/get_node` to resolve the app token.

3) Build table filters.
- Always filter by `App`, `Scene`, `Status`, and `Date` presets.
- Date presets are **literal strings**: `Today`, `Yesterday`, `Any`.
- Default status is `pending` when omitted.

4) Call Feishu Bitable search.
- `POST /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/search`
- Use `page_size` + `page_token` for pagination.
- Respect `view_id` unless `ignore_view` is true.

5) Validate decoded tasks.
- Keep only rows with `TaskID != 0` and at least one of `Params`, `ItemID`, `BookID`, `URL`, `UserID`, `UserName`.

## Minimal Python example (standalone)

```bash
export FEISHU_APP_ID=...
export FEISHU_APP_SECRET=...
export TASK_BITABLE_URL="https://.../base/APP_TOKEN?table=TABLE_ID&view=VIEW_ID"
python scripts/fetch_tasks.py --app com.smile.gifmaker --scene 综合页搜索 --status pending --date Today --limit 10
```

## Resources

- Read `references/task-fetch.md` for filters, pagination, validation, and field mapping.
- Read `references/feishu-integration.md` for Feishu API endpoints and request/response payloads.
- `scripts/fetch_tasks.py`: HTTP-based Python implementation that hits `/records/search` and decodes tasks (including wiki URL support).
