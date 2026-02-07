#!/usr/bin/env node
import { spawnSync } from "child_process";
import chalk from "chalk";
import { Command } from "commander";
import os from "os";

// ---------- args ----------
type CLIOptions = {
  taskId: string;
  dbPath: string;
  threshold: string;
  dryRun: boolean;
  logLevel: string;
  app?: string;
  bookId?: string;
  date?: string;
};

function parseCLI(argv: string[]): CLIOptions {
  const program = new Command();
  program
    .name("run_piracy_pipeline")
    .description("SQLite-driven piracy clustering and task orchestration")
    .requiredOption("--task-id <id>", "Parent task TaskID (general search task)")
    .option("--db-path <path>", "SQLite path", "~/.eval/records.sqlite")
    .option("--threshold <num>", "Threshold ratio", "0.5")
    .option("--dry-run", "Compute only, do not write records")
    .option("--log-level <level>", "Log level: silent|error|info|debug", "info")
    .option("--app <app>", "Override parent task app")
    .option("--book-id <id>", "Override parent task book ID")
    .option("--date <yyyy-mm-dd>", "Override capture day")
    .showHelpAfterError()
    .showSuggestionAfterError();
  program.parse(argv);
  const opts = program.opts<CLIOptions>();
  return opts;
}

function env(name: string, def = "") {
  const v = (process.env[name] || "").trim();
  return v || def;
}

function must(name: string) {
  const v = env(name, "");
  if (!v) throw new Error(`${name} is required`);
  return v;
}

function expandHome(p: string) {
  if (!p.startsWith("~")) return p;
  return p.replace(/^~(?=$|\/)/, os.homedir());
}

function toNumber(v: any, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function parseTaskID(raw: any) {
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n) || n <= 0) throw new Error(`invalid task id: ${raw}`);
  return n;
}

function dayStartMs(day: string) {
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 0;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  return d.getTime();
}

function toDay(v: any) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^\d{13}$/.test(s)) {
    const d = new Date(Number(s));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  if (/^\d{10}$/.test(s)) {
    const d = new Date(Number(s) * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

type LogLevel = "silent" | "error" | "info" | "debug";

function parseLogLevel(raw: any): LogLevel {
  const v = String(raw || "info").trim().toLowerCase();
  if (v === "silent" || v === "error" || v === "info" || v === "debug") return v;
  return "info";
}

function createLogger(level: LogLevel, stream: NodeJS.WriteStream, color: boolean) {
  const rank: Record<LogLevel, number> = { silent: 0, error: 1, info: 2, debug: 3 };
  const useColor = color;
  const levelColor = (value: string, lv: LogLevel) => {
    if (!useColor) return value;
    if (lv === "error") return chalk.red(value);
    if (lv === "debug") return chalk.cyan(value);
    return chalk.green(value);
  };
  const keyColor = (value: string) => (useColor ? chalk.blue(value) : value);
  const msgColor = (value: string) => (useColor ? chalk.green(value) : value);
  const valueColor = (value: string) => (useColor ? chalk.dim(value) : value);
  const can = (want: LogLevel) => rank[level] >= rank[want];
  const formatValue = (value: unknown): string => {
    if (typeof value === "string") {
      if (value === "") return '""';
      if (/\s/.test(value) || value.includes("=") || value.includes("\"")) return JSON.stringify(value);
      return value;
    }
    if (value === null || value === undefined) return "null";
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return JSON.stringify(value);
  };
  const log = (want: LogLevel, msg: string, extra?: Record<string, unknown>) => {
    if (!can(want)) return;
    const parts = [
      `${keyColor("time")}=${valueColor(new Date().toISOString())}`,
      `${keyColor("level")}=${levelColor(want.toUpperCase(), want)}`,
      `${keyColor("mod")}=${valueColor("piracy-task-orchestrator")}`,
      `${keyColor("msg")}=${msgColor(msg)}`,
    ];
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        parts.push(`${keyColor(k)}=${valueColor(formatValue(v))}`);
      }
    }
    stream.write(parts.join(" ") + "\n");
  };
  return {
    level,
    error: (msg: string, extra?: Record<string, unknown>) => log("error", msg, extra),
    info: (msg: string, extra?: Record<string, unknown>) => log("info", msg, extra),
    debug: (msg: string, extra?: Record<string, unknown>) => log("debug", msg, extra),
  };
}

// ---------- sqlite ----------
function sqliteJSON(dbPath: string, sql: string): any[] {
  const run = spawnSync("sqlite3", ["-json", dbPath, sql], { encoding: "utf-8" });
  if (run.status !== 0) {
    throw new Error(`sqlite query failed: ${run.stderr || run.stdout}`);
  }
  const out = (run.stdout || "").trim();
  if (!out) return [];
  const data = JSON.parse(out);
  return Array.isArray(data) ? data : [];
}

function sqliteTableColumns(dbPath: string, table: string): string[] {
  const rows = sqliteJSON(dbPath, `PRAGMA table_info(${table});`);
  return rows
    .map((r) => String(r?.name || "").trim())
    .filter(Boolean);
}

function pickField(row: Record<string, any>, names: string[]) {
  for (const n of names) {
    if (row[n] !== undefined && row[n] !== null && String(row[n]).trim() !== "") {
      return row[n];
    }
  }
  return "";
}

function normalizeDurationSec(v: any): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 100000) return Math.round(n / 1000); // milliseconds fallback
  return Math.round(n);
}

function mapAppValue(app: string) {
  const m: Record<string, string> = {
    "com.smile.gifmaker": "快手",
    "com.tencent.mm": "视频号",
    "com.eg.android.AlipayGphone": "支付宝",
  };
  return m[app] || app;
}

const TASK_ID_CANDIDATE_FIELDS = ["TaskID", "task_id"] as const;
const USER_ALIAS_FIELDS = ["UserAlias", "user_alias"] as const;
const USER_ID_FIELDS = ["UserID", "user_id"] as const;
const USER_NAME_FIELDS = ["UserName", "user_name"] as const;
const PARAMS_FIELDS = ["Params", "params", "query"] as const;
const ITEM_ID_FIELDS = ["ItemID", "item_id"] as const;
const TAGS_FIELDS = ["Tags", "tags"] as const;
const ANCHOR_FIELDS = ["AnchorPoint", "anchor_point", "Extra", "extra"] as const;
const DURATION_FIELDS = [
  "DurationSec",
  "duration_sec",
  "Duration",
  "duration",
  "ItemDuration",
  "item_duration",
  "itemDuration",
] as const;

// ---------- feishu ----------
type BitableRef = { appToken: string; tableID: string; viewID: string; wikiToken: string };

function parseBitableURL(raw: string): BitableRef {
  const u = new URL(raw);
  const seg = u.pathname.split("/").filter(Boolean);
  let appToken = "";
  let wikiToken = "";
  for (let i = 0; i < seg.length - 1; i++) {
    if (seg[i] === "base") appToken = seg[i + 1];
    if (seg[i] === "wiki") wikiToken = seg[i + 1];
  }
  const tableID = u.searchParams.get("table") || u.searchParams.get("table_id") || "";
  const viewID = u.searchParams.get("view") || u.searchParams.get("view_id") || "";
  if (!tableID) throw new Error(`missing table id in url: ${raw}`);
  return { appToken, tableID, viewID, wikiToken };
}

async function requestJSON(method: string, url: string, token: string, body: any) {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`http ${res.status}: ${txt}`);
  const data = txt ? JSON.parse(txt) : {};
  if (data.code !== 0) throw new Error(`api error code=${data.code} msg=${data.msg || ""}`);
  return data;
}

async function getTenantToken(baseURL: string, appID: string, appSecret: string) {
  const url = `${baseURL}/open-apis/auth/v3/tenant_access_token/internal`;
  const data = await requestJSON("POST", url, "", { app_id: appID, app_secret: appSecret });
  const token = String(data.tenant_access_token || "").trim();
  if (!token) throw new Error("tenant_access_token missing");
  return token;
}

async function resolveWikiToken(baseURL: string, token: string, wikiToken: string) {
  const url = `${baseURL}/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(wikiToken)}`;
  const data = await requestJSON("GET", url, token, null);
  const objToken = String(data?.data?.node?.obj_token || "").trim();
  if (!objToken) throw new Error("wiki obj_token missing");
  return objToken;
}

type FeishuCtx = {
  baseURL: string;
  token: string;
};

async function searchRecords(ctx: FeishuCtx, bitableURL: string, filter: any, pageSize = 200, limit = 200) {
  const ref = parseBitableURL(bitableURL);
  if (!ref.appToken && ref.wikiToken) {
    ref.appToken = await resolveWikiToken(ctx.baseURL, ctx.token, ref.wikiToken);
  }
  if (!ref.appToken) throw new Error("bitable app token missing");

  const out: any[] = [];
  let pageToken = "";
  while (true) {
    const q = new URLSearchParams();
    q.set("page_size", String(pageSize));
    if (pageToken) q.set("page_token", pageToken);
    const url = `${ctx.baseURL}/open-apis/bitable/v1/apps/${ref.appToken}/tables/${ref.tableID}/records/search?${q.toString()}`;
    const body: any = {};
    if (filter) body.filter = filter;
    if (ref.viewID) body.view_id = ref.viewID;
    const data = await requestJSON("POST", url, ctx.token, body);
    const items = Array.isArray(data?.data?.items) ? data.data.items : [];
    out.push(...items);
    if (out.length >= limit) return out.slice(0, limit);
    const hasMore = Boolean(data?.data?.has_more);
    pageToken = String(data?.data?.page_token || "");
    if (!hasMore || !pageToken) break;
  }
  return out;
}

async function batchCreateRecords(ctx: FeishuCtx, bitableURL: string, records: Array<{ fields: Record<string, any> }>) {
  if (!records.length) return [] as string[];
  const ref = parseBitableURL(bitableURL);
  if (!ref.appToken && ref.wikiToken) {
    ref.appToken = await resolveWikiToken(ctx.baseURL, ctx.token, ref.wikiToken);
  }
  if (!ref.appToken) throw new Error("bitable app token missing");
  const url = `${ctx.baseURL}/open-apis/bitable/v1/apps/${ref.appToken}/tables/${ref.tableID}/records/batch_create`;
  const ids: string[] = [];
  for (let i = 0; i < records.length; i += 500) {
    const data = await requestJSON("POST", url, ctx.token, { records: records.slice(i, i + 500) });
    const created = Array.isArray(data?.data?.records) ? data.data.records : [];
    for (const row of created) {
      const rid = String(row?.record_id || "").trim();
      if (rid) ids.push(rid);
    }
  }
  return ids;
}

async function batchUpdateRecords(ctx: FeishuCtx, bitableURL: string, records: Array<{ record_id: string; fields: Record<string, any> }>) {
  if (!records.length) return;
  const ref = parseBitableURL(bitableURL);
  if (!ref.appToken && ref.wikiToken) {
    ref.appToken = await resolveWikiToken(ctx.baseURL, ctx.token, ref.wikiToken);
  }
  if (!ref.appToken) throw new Error("bitable app token missing");
  const url = `${ctx.baseURL}/open-apis/bitable/v1/apps/${ref.appToken}/tables/${ref.tableID}/records/batch_update`;
  for (let i = 0; i < records.length; i += 500) {
    await requestJSON("POST", url, ctx.token, { records: records.slice(i, i + 500) });
  }
}

function condition(field: string, op: string, ...vals: any[]) {
  return { field_name: field, operator: op, value: vals };
}

function orFilter(conditions: any[]) {
  return { conjunction: "or", conditions };
}

function andFilter(conditions: any[], children: any[] = []) {
  return { conjunction: "and", conditions, children };
}

function firstText(v: any): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    return v.map((x) => firstText(x)).filter(Boolean).join(" ").trim();
  }
  if (typeof v === "object") {
    if (typeof v.text === "string") return v.text.trim();
    if (v.value != null) return firstText(v.value);
    return "";
  }
  return String(v).trim();
}

// ---------- main ----------
async function main() {
  const args = parseCLI(process.argv);
  const taskID = parseTaskID(args.taskId);
  const dryRun = Boolean(args.dryRun);
  const threshold = toNumber(args.threshold, 0.5);
  const logLevel = parseLogLevel(args.logLevel);
  const logger = createLogger(logLevel, process.stdout, Boolean(process.stdout.isTTY));
  const dbPath = expandHome(String(args.dbPath || "~/.eval/records.sqlite"));

  const feishuAppID = must("FEISHU_APP_ID");
  const feishuAppSecret = must("FEISHU_APP_SECRET");
  const taskURL = must("TASK_BITABLE_URL");
  const dramaURL = must("DRAMA_BITABLE_URL");
  const webhookURL = must("WEBHOOK_BITABLE_URL");
  const baseURL = env("FEISHU_BASE_URL", "https://open.feishu.cn").replace(/\/+$/, "");
  const taskRef = parseBitableURL(taskURL);
  logger.info("pipeline started", { taskID, threshold, dryRun, dbPath, logLevel, baseURL });

  const taskFields = {
    TaskID: env("TASK_FIELD_TASKID", "TaskID"),
    App: env("TASK_FIELD_APP", "App"),
    Scene: env("TASK_FIELD_SCENE", "Scene"),
    Params: env("TASK_FIELD_PARAMS", "Params"),
    BookID: env("TASK_FIELD_BOOKID", "BookID"),
    UserID: env("TASK_FIELD_USERID", "UserID"),
    UserName: env("TASK_FIELD_USERNAME", "UserName"),
    Date: env("TASK_FIELD_DATE", "Date"),
    Status: env("TASK_FIELD_STATUS", "Status"),
    GroupID: env("TASK_FIELD_GROUPID", "GroupID"),
    ParentTaskID: env("TASK_FIELD_PARENT_TASK_ID", "ParentTaskID"),
    ItemID: env("TASK_FIELD_ITEMID", "ItemID"),
    Extra: env("TASK_FIELD_EXTRA", "Extra"),
  };

  const webhookFields = {
    BizType: env("WEBHOOK_FIELD_BIZTYPE", "BizType"),
    GroupID: env("WEBHOOK_FIELD_GROUPID", "GroupID"),
    Status: env("WEBHOOK_FIELD_STATUS", "Status"),
    TaskIDs: env("WEBHOOK_FIELD_TASKIDS", "TaskIDs"),
    DramaInfo: env("WEBHOOK_FIELD_DRAMAINFO", "DramaInfo"),
    Date: env("WEBHOOK_FIELD_DATE", "Date"),
    RetryCount: env("WEBHOOK_FIELD_RETRYCOUNT", "RetryCount"),
  };

  const dramaFields = {
    bookID: env("DRAMA_FIELD_BOOKID", "短剧id"),
    name: env("DRAMA_FIELD_NAME", "短剧名"),
    durationMin: env("DRAMA_FIELD_DURATION_MIN", "短剧总时长（分钟）"),
    episodeCount: env("DRAMA_FIELD_EPISODE_COUNT", "集数"),
    rightsProtectionScenario: env("DRAMA_FIELD_RIGHTS_PROTECTION_SCENARIO", "维权场景"),
    priority: env("DRAMA_FIELD_PRIORITY", "优先级"),
  };

  const token = await getTenantToken(baseURL, feishuAppID, feishuAppSecret);
  const ctx: FeishuCtx = { baseURL, token };
  logger.debug("tenant token resolved");

  // parent task
  const parentRows = await searchRecords(
    ctx,
    taskURL,
    andFilter([condition(taskFields.TaskID, "is", String(taskID))]),
    50,
    5,
  );
  if (!parentRows.length) throw new Error(`parent task not found: ${taskID}`);
  const parent = parentRows[0].fields || {};
  const parentApp = String(args.app || firstText(parent[taskFields.App])).trim();
  const parentBookID = String(args.bookId || firstText(parent[taskFields.BookID])).trim();
  const parentParams = String(firstText(parent[taskFields.Params])).trim();
  const day = String(args.date || toDay(firstText(parent[taskFields.Date])) || new Date().toISOString().slice(0, 10));
  const dayMs = dayStartMs(day);
  logger.debug("parent task loaded", {
    taskID,
    parentTaskRows: parentRows.length,
    parentApp,
    parentBookID,
    day,
    dayMs,
  });

  // sqlite rows for current general-search task
  const captureCols = new Set(sqliteTableColumns(dbPath, "capture_results"));
  const taskIDCols = TASK_ID_CANDIDATE_FIELDS.filter((name) => captureCols.has(name));
  if (!taskIDCols.length) {
    throw new Error("capture_results missing task id column: expected TaskID or task_id");
  }
  const taskIDExpr =
    taskIDCols.length === 1
      ? `CAST(COALESCE(${taskIDCols[0]}, 0) AS INTEGER)`
      : `CAST(COALESCE(${taskIDCols.join(", ")}, 0) AS INTEGER)`;
  const rawRows = sqliteJSON(
    dbPath,
    `SELECT * FROM capture_results WHERE ${taskIDExpr} = ${taskID};`,
  );
  logger.debug("sqlite rows loaded", {
    taskID,
    table: "capture_results",
    taskIDCols,
    taskIDExpr,
    rowCount: rawRows.length,
  });

  const summary: Record<string, any> = {
    parent_task_id: taskID,
    app: parentApp,
    day,
    db_path: dbPath,
    threshold,
    log_level: logLevel,
    sqlite_rows: rawRows.length,
    resolved_task_count: 0,
    unresolved_task_ids: [] as number[],
    missing_drama_meta_book_ids: [] as string[],
    invalid_drama_duration_book_ids: [] as string[],
    groups_above_threshold: 0,
    child_tasks_created: 0,
    webhook_plans_created: 0,
    child_task_record_ids: [] as string[],
    dry_run: dryRun,
  };

  if (!rawRows.length) {
    logger.info("no capture rows found for task");
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  // collect task ids from rows
  const taskIDSet = new Set<number>();
  for (const row of rawRows) {
    const rid = toNumber(pickField(row, [...TASK_ID_CANDIDATE_FIELDS]), 0);
    if (rid > 0) taskIDSet.add(Math.trunc(rid));
  }
  taskIDSet.add(taskID);
  const taskIDs = Array.from(taskIDSet);
  logger.debug("task ids collected from sqlite rows", {
    taskIDsCount: taskIDs.length,
    taskIDs: taskIDs.slice(0, 100),
  });

  // task id -> task row mapping
  const taskMap = new Map<number, any>();
  for (let i = 0; i < taskIDs.length; i += 40) {
    const chunk = taskIDs.slice(i, i + 40);
    const conds = chunk.map((id) => condition(taskFields.TaskID, "is", String(id)));
    const rows = await searchRecords(ctx, taskURL, andFilter([], [orFilter(conds)]), 200, 200);
    for (const r of rows) {
      const fields = r.fields || {};
      const id = Math.trunc(Number(firstText(fields[taskFields.TaskID])));
      if (id > 0) taskMap.set(id, fields);
    }
  }
  summary.resolved_task_count = taskMap.size;
  logger.debug("task rows resolved from bitable", {
    resolvedTaskCount: taskMap.size,
    unresolvedCount: Math.max(taskIDs.length - taskMap.size, 0),
  });

  // group aggregate
  type G = {
    groupID: string;
    app: string;
    bookID: string;
    userID: string;
    userName: string;
    params: string;
    durationSec: number;
    itemIDs: Set<string>;
    collectionItemID: string;
    anchorLinks: Set<string>;
  };

  const groups = new Map<string, G>();
  const unresolvedTaskIDs = new Set<number>();
  let rowsWithDuration = 0;
  let rowsWithoutDuration = 0;
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i] || {};
    const rowTaskID = Math.trunc(toNumber(pickField(row, [...TASK_ID_CANDIDATE_FIELDS]), 0));
    if (rowTaskID <= 0) continue;
    const t = taskMap.get(rowTaskID);
    // GroupID/app should follow the task domain (parent/task table), not capture row source app.
    const app = String(firstText((t ? t[taskFields.App] : "") || parentApp)).trim();
    const bookID = String(firstText((t ? t[taskFields.BookID] : "") || parentBookID)).trim();
    if (!bookID) {
      unresolvedTaskIDs.add(rowTaskID);
      continue;
    }

    const userAlias = String(firstText(pickField(row, [...USER_ALIAS_FIELDS]))).trim();
    const userID = String(firstText(pickField(row, [...USER_ID_FIELDS]) || (t ? t[taskFields.UserID] : ""))).trim();
    const userName = String(firstText(pickField(row, [...USER_NAME_FIELDS]) || (t ? t[taskFields.UserName] : ""))).trim();
    const userKey = (userAlias || userID || userName).trim();
    if (!userKey) continue;

    const groupID = `${mapAppValue(app)}_${bookID}_${userKey}`;
    const params = String(firstText(pickField(row, [...PARAMS_FIELDS]) || (t ? t[taskFields.Params] : "") || parentParams)).trim();

    const itemID = String(firstText(pickField(row, [...ITEM_ID_FIELDS]))).trim() || `__row_${i}`;
    const durationSec = normalizeDurationSec(pickField(row, [...DURATION_FIELDS]));
    if (durationSec > 0) rowsWithDuration++;
    else rowsWithoutDuration++;

    let g = groups.get(groupID);
    if (!g) {
      g = {
        groupID,
        app,
        bookID,
        userID,
        userName,
        params,
        durationSec: 0,
        itemIDs: new Set<string>(),
        collectionItemID: "",
        anchorLinks: new Set<string>(),
      };
      groups.set(groupID, g);
    }

    if (!g.itemIDs.has(itemID)) {
      g.itemIDs.add(itemID);
      g.durationSec += durationSec;
    }

    const tags = String(firstText(pickField(row, [...TAGS_FIELDS]))).trim();
    if (!g.collectionItemID && itemID && /合集|短剧/.test(tags)) {
      g.collectionItemID = itemID;
    }

    const anchor = String(firstText(pickField(row, [...ANCHOR_FIELDS]))).trim();
    if (anchor) {
      const m = anchor.match(/(kwai:\/\/[^\s"']+|weixin:\/\/[^\s"']+|alipays?:\/\/[^\s"']+|https?:\/\/[^\s"']+)/g);
      if (m) for (const link of m) g.anchorLinks.add(link);
    }
  }
  summary.unresolved_task_ids = Array.from(unresolvedTaskIDs).sort((a, b) => a - b);
  logger.debug("group aggregation finished", {
    totalGroups: groups.size,
    unresolvedTaskIDs: summary.unresolved_task_ids,
    rowsWithDuration,
    rowsWithoutDuration,
  });
  if (logLevel === "debug") {
    const samples = Array.from(groups.values()).slice(0, 30).map((g) => ({
      groupID: g.groupID,
      app: g.app,
      bookID: g.bookID,
      userID: g.userID,
      userName: g.userName,
      durationSec: g.durationSec,
      uniqueItemCount: g.itemIDs.size,
      hasCollectionItem: Boolean(g.collectionItemID),
      anchorLinkCount: g.anchorLinks.size,
    }));
    logger.debug("group samples", { samples });
  }

  // fetch drama meta by book id
  const bookIDs = Array.from(new Set(Array.from(groups.values()).map((g) => g.bookID)));
  const dramaMap = new Map<
    string,
    {
      name: string;
      durationMin: number;
      durationSec: number;
      episodeCount: string;
      rightsProtectionScenario: string;
      priority: string;
      raw: any;
    }
  >();
  for (let i = 0; i < bookIDs.length; i += 40) {
    const chunk = bookIDs.slice(i, i + 40);
    const conds = chunk.map((id) => condition(dramaFields.bookID, "is", id));
    const rows = await searchRecords(ctx, dramaURL, andFilter([], [orFilter(conds)]), 200, 200);
    for (const r of rows) {
      const f = r.fields || {};
      const id = String(firstText(f[dramaFields.bookID])).trim();
      if (!id) continue;
      const durationMin = Number(firstText(f[dramaFields.durationMin]));
      const durationSec = Number.isFinite(durationMin) ? Math.round(durationMin * 60) : 0;
      dramaMap.set(id, {
        name: String(firstText(f[dramaFields.name])).trim(),
        durationMin: Number.isFinite(durationMin) ? durationMin : 0,
        durationSec,
        episodeCount: String(firstText(f[dramaFields.episodeCount])).trim(),
        rightsProtectionScenario: String(firstText(f[dramaFields.rightsProtectionScenario])).trim(),
        priority: String(firstText(f[dramaFields.priority])).trim(),
        raw: f,
      });
    }
  }
  const dramaMetas = Array.from(dramaMap.entries()).map(([bookID, meta]) => ({
    bookID,
    name: meta.name,
    durationMin: meta.durationMin,
    durationSec: meta.durationSec,
    episodeCount: meta.episodeCount,
    rightsProtectionScenario: meta.rightsProtectionScenario,
    priority: meta.priority,
  }));
  logger.debug("drama metadata loaded", {
    taskID,
    parentBookID,
    requestedBookCount: bookIDs.length,
    resolvedBookCount: dramaMap.size,
    dramas: dramaMetas,
  });

  // threshold filter
  const selected: Array<{
    group: G;
    ratio: number;
    drama: {
      name: string;
      durationMin: number;
      durationSec: number;
      episodeCount: string;
      rightsProtectionScenario: string;
      priority: string;
      raw: any;
    };
  }> = [];
  const ratioSamples: Array<{ groupID: string; groupDurationSec: number; dramaDurationSec: number; ratio: number }> = [];
  const missingMeta = new Set<string>();
  const invalidDuration = new Set<string>();
  for (const g of groups.values()) {
    const drama = dramaMap.get(g.bookID);
    if (!drama) {
      missingMeta.add(g.bookID);
      continue;
    }
    if (!Number.isFinite(drama.durationSec) || drama.durationSec <= 0) {
      invalidDuration.add(g.bookID);
      continue;
    }
    const ratio = g.durationSec / drama.durationSec;
    ratioSamples.push({
      groupID: g.groupID,
      groupDurationSec: g.durationSec,
      dramaDurationSec: drama.durationSec,
      ratio: Number(ratio.toFixed(6)),
    });
    if (ratio >= threshold) selected.push({ group: g, ratio, drama });
  }
  summary.missing_drama_meta_book_ids = Array.from(missingMeta).sort();
  summary.invalid_drama_duration_book_ids = Array.from(invalidDuration).sort();
  summary.groups_above_threshold = selected.length;
  ratioSamples.sort((a, b) => b.ratio - a.ratio);
  logger.debug("threshold evaluated", {
    threshold,
    totalGroups: groups.size,
    selectedGroups: selected.length,
    missingDramaMetaBookIDs: summary.missing_drama_meta_book_ids,
    invalidDramaDurationBookIDs: summary.invalid_drama_duration_book_ids,
    topRatios: ratioSamples.slice(0, 20),
  });

  if (!selected.length) {
    logger.info("no groups passed threshold", {
      threshold,
      maxRatio: ratioSamples.length ? ratioSamples[0].ratio : 0,
      groupsChecked: ratioSamples.length,
    });
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  // skip groups already existing today
  const existingGroup = new Set<string>();
  const selectedGroupIDs = Array.from(new Set(selected.map((s) => s.group.groupID)));
  for (let i = 0; i < selectedGroupIDs.length; i += 40) {
    const chunk = selectedGroupIDs.slice(i, i + 40);
    const rows = await searchRecords(
      ctx,
      taskURL,
      andFilter(
        [
          condition(taskFields.App, "is", parentApp),
          condition(taskFields.Date, "is", "ExactDate", String(dayMs)),
        ],
        [orFilter(chunk.map((gid) => condition(taskFields.GroupID, "is", gid)))],
      ),
      500,
      500,
    );
    for (const row of rows) {
      const gid = String(firstText((row.fields || {})[taskFields.GroupID])).trim();
      if (gid) existingGroup.add(gid);
    }
  }
  logger.debug("existing group check finished", {
    selectedGroups: selected.length,
    existingGroupCount: existingGroup.size,
    existingGroups: Array.from(existingGroup).slice(0, 100),
  });

  const childRecords: Array<{ fields: Record<string, any> }> = [];
  for (const item of selected) {
    const g = item.group;
    if (existingGroup.has(g.groupID)) continue;

    const base: Record<string, any> = {
      [taskFields.App]: g.app,
      [taskFields.GroupID]: g.groupID,
      [taskFields.BookID]: g.bookID,
      [taskFields.UserID]: g.userID,
      [taskFields.UserName]: g.userName,
      [taskFields.ParentTaskID]: taskID,
      [taskFields.Date]: dayMs,
      [taskFields.Params]: g.params || parentParams,
      [taskFields.Status]: "pending",
    };

    childRecords.push({
      fields: {
        ...base,
        [taskFields.Scene]: "个人页搜索",
      },
    });

    if (g.collectionItemID && !String(g.collectionItemID).startsWith("__row_")) {
      childRecords.push({
        fields: {
          ...base,
          [taskFields.Scene]: "合集视频采集",
          [taskFields.ItemID]: g.collectionItemID,
        },
      });
    }

    for (const link of g.anchorLinks) {
      childRecords.push({
        fields: {
          ...base,
          [taskFields.Scene]: "视频锚点采集",
          [taskFields.Extra]: link,
        },
      });
    }
  }

  if (!dryRun && childRecords.length) {
    logger.info("creating child tasks", { count: childRecords.length });
    const createdIDs = await batchCreateRecords(ctx, taskURL, childRecords);
    summary.child_task_record_ids = createdIDs;
    logger.info("child tasks created", {
      count: childRecords.length,
      returned_record_ids: createdIDs.length,
      task_table: taskRef.tableID,
      task_view: taskRef.viewID || "-",
    });
  }
  summary.child_tasks_created = childRecords.length;
  logger.debug("child task build finished", {
    childTasksCreated: childRecords.length,
    preview: childRecords.slice(0, 20).map((r) => r.fields),
  });

  // webhook plans
  const createRows: Array<{ fields: Record<string, any> }> = [];
  const updateRows: Array<{ record_id: string; fields: Record<string, any> }> = [];
  const webhookTouchedGroupIDs = new Set<string>();

  for (const item of selected) {
    const g = item.group;

    const groupTasks = await searchRecords(
      ctx,
      taskURL,
      andFilter(
        [
          condition(taskFields.GroupID, "is", g.groupID),
          condition(taskFields.App, "is", g.app),
          condition(taskFields.Date, "is", "ExactDate", String(dayMs)),
        ],
      ),
      200,
      200,
    );
    const taskIDsInGroup = Array.from(
      new Set(
        groupTasks
          .map((r) => Math.trunc(Number(firstText((r.fields || {})[taskFields.TaskID]))))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    );
    if (!taskIDsInGroup.includes(taskID)) taskIDsInGroup.push(taskID);
    const taskIDsPayload = JSON.stringify(taskIDsInGroup);

    const dramaInfoObj = {
      CaptureDate: String(dayMs),
      DramaID: g.bookID,
      DramaName: item.drama.name || g.params || parentParams,
      EpisodeCount: item.drama.episodeCount,
      Priority: item.drama.priority,
      RightsProtectionScenario: item.drama.rightsProtectionScenario,
      TotalDuration: String(item.drama.durationSec),
      CaptureDuration: String(g.durationSec),
      GeneralSearchRatio: Number(item.ratio.toFixed(6)),
    };
    const dramaInfo = JSON.stringify(dramaInfoObj);

    const exist = await searchRecords(
      ctx,
      webhookURL,
      andFilter(
        [
          condition(webhookFields.BizType, "is", "piracy_general_search"),
          condition(webhookFields.GroupID, "is", g.groupID),
          condition(webhookFields.Date, "is", "ExactDate", String(dayMs)),
        ],
      ),
      20,
      20,
    );

    if (exist.length) {
      webhookTouchedGroupIDs.add(g.groupID);
      updateRows.push({
        record_id: String(exist[0].record_id),
        fields: {
          [webhookFields.TaskIDs]: taskIDsPayload,
          [webhookFields.DramaInfo]: dramaInfo,
        },
      });
    } else {
      webhookTouchedGroupIDs.add(g.groupID);
      createRows.push({
        fields: {
          [webhookFields.BizType]: "piracy_general_search",
          [webhookFields.GroupID]: g.groupID,
          [webhookFields.Status]: "pending",
          [webhookFields.TaskIDs]: taskIDsPayload,
          [webhookFields.DramaInfo]: dramaInfo,
          [webhookFields.Date]: dayMs,
          [webhookFields.RetryCount]: 0,
        },
      });
    }
  }

  if (!dryRun) {
    if (createRows.length) {
      logger.info("creating webhook plans", { count: createRows.length });
      await batchCreateRecords(ctx, webhookURL, createRows);
    }
    if (updateRows.length) {
      logger.info("updating webhook plans", { count: updateRows.length });
      await batchUpdateRecords(ctx, webhookURL, updateRows);
    }
  }
  summary.webhook_plans_created = createRows.length + updateRows.length;
  logger.debug("webhook plan build finished", {
    created: createRows.length,
    updated: updateRows.length,
    createPreview: createRows.slice(0, 20).map((r) => r.fields),
    updatePreview: updateRows.slice(0, 20).map((r) => ({ record_id: r.record_id, fields: r.fields })),
  });

  if (!dryRun && childRecords.length) {
    const verifyRows = await searchRecords(
      ctx,
      taskURL,
      andFilter([
        condition(taskFields.ParentTaskID, "is", String(taskID)),
        condition(taskFields.Date, "is", "ExactDate", String(dayMs)),
      ]),
      500,
      2000,
    );
    logger.info("child task visibility check", {
      parent_task_id: taskID,
      date_ms: dayMs,
      date_day: day,
      found_rows: verifyRows.length,
      task_table: taskRef.tableID,
      task_view: taskRef.viewID || "-",
    });
    const nowDay = toDay(Date.now());
    if (day !== nowDay) {
      logger.info("view filter hint", {
        reason: "parent task date differs from today",
        parent_day: day,
        today: nowDay,
        hint: "if your view filters Today/current scene/app, new rows may be hidden",
      });
    }
  }

  logger.info("pipeline completed", {
    groupsAboveThreshold: summary.groups_above_threshold,
    childTasksCreated: summary.child_tasks_created,
    webhookPlansCreated: summary.webhook_plans_created,
    groupIDs: selected.map((x) => x.group.groupID),
    createdGroupIDs: Array.from(webhookTouchedGroupIDs),
  });
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  const argv = process.argv;
  let raw = "";
  const idx = argv.findIndex((v) => v === "--log-level");
  if (idx >= 0) raw = argv[idx + 1] || "";
  if (!raw) {
    const eqArg = argv.find((v) => v.startsWith("--log-level="));
    if (eqArg) raw = eqArg.slice("--log-level=".length);
  }
  const logLevel = parseLogLevel(raw);
  const logger = createLogger(logLevel, process.stderr, Boolean(process.stderr.isTTY));
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
