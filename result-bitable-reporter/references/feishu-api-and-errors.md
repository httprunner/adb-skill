# Feishu API and Error Handling

## APIs Used

1. Tenant token
- `POST /open-apis/auth/v3/tenant_access_token/internal/`
- Request body:
  - `app_id`
  - `app_secret`

2. Wiki token resolve (only for wiki URLs)
- `GET /open-apis/wiki/v2/spaces/get_node?token=<wiki_token>`
- Read `data.node.obj_token` as bitable app token.

3. Result row batch create
- `POST /open-apis/bitable/v1/apps/{app_token}/tables/{table_id}/records/batch_create`
- Request body:
  - `records`: list of `{ "fields": { ... } }`

## Input URL Requirements

`RESULT_BITABLE_URL` (or `--bitable-url`) must include:

- app token URL: `/base/<app_token>?table=<table_id>`
- or wiki URL: `/wiki/<wiki_token>?table=<table_id>`

## Batch Size

Feishu bitable batch_create supports up to 500 records per request.

Skill default:
- `--batch-size 30`
- script auto-splits large selections into chunks.

## Failure Handling

- API call failure marks each row in the failed chunk as `reported=-1`.
- `report_error` stores a truncated string for later inspection.
- Common causes:
  - Auth failure (`FEISHU_APP_ID`/`FEISHU_APP_SECRET` mismatch)
  - Schema mismatch (`FieldNameNotFound`)
  - Rate limit or gateway errors

## Practical Triage

1. Use `--dry-run` to validate selection first.
2. Confirm result table URL and field names.
3. Inspect sqlite `report_error` values and repair mapping/env.
4. Run `retry-reset`, then retry `report`.

## Command Examples

Report pending/failed rows to Feishu:

```bash
export FEISHU_APP_ID=...
export FEISHU_APP_SECRET=...
export RESULT_BITABLE_URL="https://.../wiki/...?...table=tbl_xxx&view=vew_xxx"
npx tsx scripts/result_reporter.ts report \
  --db-path ~/.eval/records.sqlite \
  --table capture_results \
  --status 0,-1 \
  --batch-size 30 \
  --limit 100
```

Dry-run without Feishu write:

```bash
npx tsx scripts/result_reporter.ts report \
  --dry-run \
  --status 0,-1 \
  --limit 10
```

Reset failed rows and retry:

```bash
npx tsx scripts/result_reporter.ts retry-reset \
  --db-path ~/.eval/records.sqlite \
  --table capture_results

npx tsx scripts/result_reporter.ts report \
  --status 0,-1 \
  --batch-size 30 \
  --limit 100
```
