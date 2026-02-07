# Commands

## 约定
- 所有命令默认在 `piracy-task-orchestrator` 目录执行。

## 基本运行

```bash
export FEISHU_APP_ID=...
export FEISHU_APP_SECRET=...
export TASK_BITABLE_URL="https://.../base/...?...table=tbl_task"
export DRAMA_BITABLE_URL="https://.../base/...?...table=tbl_drama"
export WEBHOOK_BITABLE_URL="https://.../base/...?...table=tbl_webhook"

npx tsx scripts/run_piracy_pipeline.ts --task-id 123456
```

## 调试模式（不写表）

```bash
npx tsx scripts/run_piracy_pipeline.ts --task-id 123456 --dry-run --threshold 0.5
```

## 完整调试日志

```bash
npx tsx scripts/run_piracy_pipeline.ts --task-id 123456 --threshold 0.2 --log-level debug
```

## 指定 sqlite 路径

```bash
npx tsx scripts/run_piracy_pipeline.ts --task-id 123456 --db-path ~/.eval/records.sqlite
```

## 输出

脚本会输出 JSON 汇总：
- `resolved_task_count`
- `unresolved_task_ids`
- `missing_drama_meta_book_ids`
- `invalid_drama_duration_book_ids`
- `groups_above_threshold`
- `child_tasks_created`
- `child_task_record_ids`
- `webhook_plans_created`

说明：
- 子任务 `Date` 默认继承父任务日期（非“当前日期”）。
- 若多维表视图过滤了 Today/场景/App，可能看不到新建记录。
