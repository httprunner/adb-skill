---
name: group-webhook-dispatch
description: Group 任务完成后的 webhook 推送编排：事件触发即时检查/推送 + reconcile 单次补偿。
---

# Group Webhook Dispatch

用于替代常驻 webhook worker，采用“事件驱动 + 按需补偿”的运行方式。

## 做什么

1. `dispatch_webhook.ts`：任务完成后按 `task-id` 或 `group-id` 触发单组检查与推送。
2. `reconcile_webhook.ts`：按日期扫描 `pending/failed`，做一次补偿处理。
3. 统一状态机：仅当同组同日任务全部终态才推送，并回写 `pending/failed/success/error`。

## 快速入口

```bash
npx tsx scripts/dispatch_webhook.ts --task-id <TASK_ID>
```

环境变量：
- `FEISHU_APP_ID`, `FEISHU_APP_SECRET`
- `TASK_BITABLE_URL`, `WEBHOOK_BITABLE_URL`
- `CRAWLER_SERVICE_BASE_URL`
- 可选 `TRACKING_STORAGE_DB_PATH`（默认 `~/.eval/records.sqlite`）

## 资源

- `scripts/webhook_lib.ts`: Feishu/SQLite/状态机公共逻辑
- `scripts/dispatch_webhook.ts`: 单组触发入口
- `scripts/reconcile_webhook.ts`: 补偿入口
- `references/commands.md`: 完整命令（含环境变量、调试、补偿）
