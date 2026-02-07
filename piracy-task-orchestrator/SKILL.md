---
name: piracy-task-orchestrator
description: 综合页搜索后的盗版检测与任务编排（SQLite 驱动）。从本地 capture_results 聚类并按阈值筛选，创建个人页搜索/合集页采集/视频锚点采集等子任务及 webhook 推送计划；适用于 wechat-search-collector 后置流程。
---

# Piracy Task Orchestrator

用于“综合页搜索完成后”的后置编排：

1. 从本地 sqlite `capture_results` 读取采集结果。
2. 通过 TaskID 从任务状态表查询 BookID（因为 capture_results 无 BookID）。
3. 用 GroupID=`{MapAppValue(任务App)}_{BookID}_{UserKey}` 聚类（平台前缀跟随任务 App）。
4. 从原始剧单按 BookID 查询 `短剧总时长（分钟）`，换算秒后计算阈值。
5. 对命中阈值的分组创建子任务（个人页必建，合集/锚点按条件）。
6. 创建/更新 `BizType=piracy_general_search` 的 webhook 推送计划。

## 运行

```bash
npx tsx scripts/run_piracy_pipeline.ts --task-id <TASK_ID>
```

常用参数：
- `--task-id <id>`: 父任务 TaskID（综合页搜索任务）
- `--db-path <path>`: sqlite 路径（默认 `~/.eval/records.sqlite`）
- `--threshold <num>`: 阈值（默认 `0.5`）
- `--dry-run`: 仅计算不写入

环境变量：
- `FEISHU_APP_ID`, `FEISHU_APP_SECRET`
- `TASK_BITABLE_URL`（任务状态表）
- `DRAMA_BITABLE_URL`（原始剧单表）
- `WEBHOOK_BITABLE_URL`（推送计划表）

## 依赖

- 任务读写：调用 Feishu OpenAPI（字段映射遵循 `TASK_FIELD_*`）。
- 原始剧单字段：
  - `短剧id` 对应 BookID
  - `短剧总时长（分钟）` 需换算成秒

## 资源

- `scripts/run_piracy_pipeline.ts`: 执行入口
- `references/commands.md`: 命令示例与字段约定
