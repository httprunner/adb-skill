# Commands

## 约定
- 所有命令默认在 `group-webhook-dispatch` 目录执行。

## 事件触发（推荐）

```bash
export FEISHU_APP_ID=...
export FEISHU_APP_SECRET=...
export TASK_BITABLE_URL="https://.../base/...?...table=tbl_task"
export WEBHOOK_BITABLE_URL="https://.../base/...?...table=tbl_webhook"
export CRAWLER_SERVICE_BASE_URL="http://content-web-crawler:8000"

npx tsx scripts/dispatch_webhook.ts --task-id 180413
```

## Webhook 计划 upsert（创建/更新）

从 JSONL 批量 upsert（按 `BizType + GroupID + Date`）：

```bash
export FEISHU_APP_ID=...
export FEISHU_APP_SECRET=...
export WEBHOOK_BITABLE_URL="https://.../base/...?...table=tbl_webhook"

cat <<'JSONL' | npx tsx scripts/upsert_webhook_plan.ts --input -
{"group_id":"快手_123_uid_xxx","date":"2026-02-07","biz_type":"piracy_general_search","task_ids":[180413,180414],"drama_info":"{\"DramaID\":\"123\"}"}
JSONL
```

## 指定 GroupID

```bash
npx tsx scripts/dispatch_webhook.ts --group-id 快手_123456789_uid_xxx --date 2026-02-07
```

## 单次补偿

```bash
npx tsx scripts/reconcile_webhook.ts --date 2026-02-07 --limit 50
```

## 调试

```bash
npx tsx scripts/dispatch_webhook.ts --task-id 180413 --dry-run
npx tsx scripts/reconcile_webhook.ts --date 2026-02-07 --biz-type piracy_general_search --dry-run
```
