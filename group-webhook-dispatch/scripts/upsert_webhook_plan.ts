#!/usr/bin/env node
import { Command } from "commander";
import fs from "fs";
import os from "os";

type CLIOptions = {
  input?: string;
  groupId?: string;
  date?: string;
  bizType: string;
  taskIds?: string;
  dramaInfo?: string;
  dryRun: boolean;
  logLevel: string;
};

type UpsertItem = {
  group_id: string;
  date: string; // yyyy-mm-dd
  biz_type?: string;
  task_ids: number[];
  drama_info?: string; // JSON string
};

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

function parseListArg(raw: any): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j)) return j.map((x) => String(x)).map((x) => x.trim()).filter(Boolean);
  } catch {
    // ignore
  }
  return s
    .split(/[\s,，]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseTaskIDs(raw: any): number[] {
  const out: number[] = [];
  for (const v of parseListArg(raw)) {
    const n = Math.trunc(Number(v));
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return Array.from(new Set(out)).sort((a, b) => a - b);
}

function dayStartMs(day: string) {
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 0;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  return d.getTime();
}

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

function condition(field: string, op: string, ...vals: any[]) {
  return { field_name: field, operator: op, value: vals };
}
function andFilter(conditions: any[], children: any[] = []) {
  return { conjunction: "and", conditions, children };
}
function orFilter(conditions: any[]) {
  return { conjunction: "or", conditions };
}

type FeishuCtx = { baseURL: string; token: string };

async function searchRecords(ctx: FeishuCtx, bitableURL: string, filter: any, pageSize = 200, limit = 200) {
  const ref = parseBitableURL(bitableURL);
  if (!ref.appToken && ref.wikiToken) ref.appToken = await resolveWikiToken(ctx.baseURL, ctx.token, ref.wikiToken);
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
    if (!data?.data?.has_more || !data?.data?.page_token) break;
    pageToken = String(data.data.page_token);
  }
  return out;
}

async function batchCreate(ctx: FeishuCtx, bitableURL: string, records: Array<{ fields: Record<string, any> }>) {
  if (!records.length) return { recordIDs: [] as string[] };
  const ref = parseBitableURL(bitableURL);
  if (!ref.appToken && ref.wikiToken) ref.appToken = await resolveWikiToken(ctx.baseURL, ctx.token, ref.wikiToken);
  if (!ref.appToken) throw new Error("bitable app token missing");
  const url = `${ctx.baseURL}/open-apis/bitable/v1/apps/${ref.appToken}/tables/${ref.tableID}/records/batch_create`;
  const recordIDs: string[] = [];
  for (let i = 0; i < records.length; i += 500) {
    const data = await requestJSON("POST", url, ctx.token, { records: records.slice(i, i + 500) });
    const created = Array.isArray(data?.data?.records) ? data.data.records : [];
    for (const row of created) {
      const id = String(row?.record_id || "").trim();
      if (id) recordIDs.push(id);
    }
  }
  return { recordIDs };
}

async function batchUpdate(ctx: FeishuCtx, bitableURL: string, records: Array<{ record_id: string; fields: Record<string, any> }>) {
  if (!records.length) return;
  const ref = parseBitableURL(bitableURL);
  if (!ref.appToken && ref.wikiToken) ref.appToken = await resolveWikiToken(ctx.baseURL, ctx.token, ref.wikiToken);
  if (!ref.appToken) throw new Error("bitable app token missing");
  const url = `${ctx.baseURL}/open-apis/bitable/v1/apps/${ref.appToken}/tables/${ref.tableID}/records/batch_update`;
  for (let i = 0; i < records.length; i += 500) {
    await requestJSON("POST", url, ctx.token, { records: records.slice(i, i + 500) });
  }
}

function webhookFields() {
  return {
    BizType: env("WEBHOOK_FIELD_BIZTYPE", "BizType"),
    GroupID: env("WEBHOOK_FIELD_GROUPID", "GroupID"),
    Status: env("WEBHOOK_FIELD_STATUS", "Status"),
    TaskIDs: env("WEBHOOK_FIELD_TASKIDS", "TaskIDs"),
    DramaInfo: env("WEBHOOK_FIELD_DRAMAINFO", "DramaInfo"),
    Date: env("WEBHOOK_FIELD_DATE", "Date"),
    RetryCount: env("WEBHOOK_FIELD_RETRYCOUNT", "RetryCount"),
  };
}

function readInput(pathArg: string): string {
  const p = String(pathArg || "").trim();
  if (!p || p === "-") {
    return fs.readFileSync(0, "utf-8");
  }
  return fs.readFileSync(expandHome(p), "utf-8");
}

function parseItems(inputText: string): UpsertItem[] {
  const txt = String(inputText || "").trim();
  if (!txt) return [];
  if (txt.startsWith("{") || txt.startsWith("[")) {
    const j = JSON.parse(txt);
    if (Array.isArray(j)) return j as UpsertItem[];
    return [j as UpsertItem];
  }
  const lines = txt
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  return lines.map((l) => JSON.parse(l)) as UpsertItem[];
}

function normalizeItem(raw: any, defaultBizType: string): UpsertItem | null {
  const groupID = String(raw?.group_id ?? raw?.groupID ?? "").trim();
  const date = String(raw?.date ?? raw?.day ?? "").trim();
  const bizType = String(raw?.biz_type ?? raw?.bizType ?? defaultBizType).trim() || defaultBizType;
  const taskIDs = parseTaskIDs(raw?.task_ids ?? raw?.taskIDs ?? "");
  const dramaInfo = typeof raw?.drama_info === "string" ? raw.drama_info : typeof raw?.dramaInfo === "string" ? raw.dramaInfo : "";
  if (!groupID || !date || !taskIDs.length) return null;
  return { group_id: groupID, date, biz_type: bizType, task_ids: taskIDs, drama_info: dramaInfo || undefined };
}

function parseCLI(argv: string[]): CLIOptions {
  const program = new Command();
  program
    .name("upsert_webhook_plan")
    .description("Upsert webhook plans in WEBHOOK_BITABLE_URL by (BizType, GroupID, Date)")
    .option("--input <path>", "Input JSON/JSONL file (use - for stdin)")
    .option("--group-id <id>", "Single GroupID")
    .option("--date <yyyy-mm-dd>", "Capture day (default: today)", new Date().toISOString().slice(0, 10))
    .option("--biz-type <name>", "BizType", "piracy_general_search")
    .option("--task-ids <list>", "TaskIDs (csv or JSON array)")
    .option("--drama-info <json>", "DramaInfo JSON string")
    .option("--dry-run", "Compute only, do not write records")
    .option("--log-level <level>", "Log level: silent|error|info|debug", "info")
    .showHelpAfterError()
    .showSuggestionAfterError();
  program.parse(argv);
  return program.opts<CLIOptions>();
}

async function main() {
  const args = parseCLI(process.argv);
  const dryRun = Boolean(args.dryRun);
  const bizTypeDefault = String(args.bizType || "piracy_general_search").trim();

  let items: UpsertItem[] = [];
  if (args.input) {
    items = parseItems(readInput(args.input));
  } else if (args.groupId) {
    items = [
      {
        group_id: String(args.groupId).trim(),
        date: String(args.date || "").trim(),
        biz_type: bizTypeDefault,
        task_ids: parseTaskIDs(args.taskIds),
        drama_info: String(args.dramaInfo || "").trim() || undefined,
      },
    ];
  }

  const normalized = items.map((it) => normalizeItem(it, bizTypeDefault)).filter(Boolean) as UpsertItem[];
  if (!normalized.length) throw new Error("no upsert items provided (use --input or --group-id + --task-ids)");

  const appID = must("FEISHU_APP_ID");
  const appSecret = must("FEISHU_APP_SECRET");
  const webhookURL = must("WEBHOOK_BITABLE_URL");
  const baseURL = env("FEISHU_BASE_URL", "https://open.feishu.cn").replace(/\/+$/, "");
  const token = await getTenantToken(baseURL, appID, appSecret);
  const ctx: FeishuCtx = { baseURL, token };
  const wf = webhookFields();

  const buckets = new Map<string, { bizType: string; day: string; dayMs: number; groupIDs: string[] }>();
  for (const it of normalized) {
    const day = it.date;
    const dayMs = dayStartMs(day);
    if (!dayMs) throw new Error(`invalid date: ${day}`);
    const key = `${it.biz_type || bizTypeDefault}@@${dayMs}`;
    const b = buckets.get(key) || { bizType: it.biz_type || bizTypeDefault, day, dayMs, groupIDs: [] as string[] };
    b.groupIDs.push(it.group_id);
    buckets.set(key, b);
  }

  const existingByKey = new Map<string, { recordID: string }>();
  for (const b of buckets.values()) {
    const uniq = Array.from(new Set(b.groupIDs)).filter(Boolean);
    for (let i = 0; i < uniq.length; i += 40) {
      const chunk = uniq.slice(i, i + 40);
      const rows = await searchRecords(
        ctx,
        webhookURL,
        andFilter(
          [
            condition(wf.BizType, "is", b.bizType),
            condition(wf.Date, "is", "ExactDate", String(b.dayMs)),
          ],
          [orFilter(chunk.map((gid) => condition(wf.GroupID, "is", gid)))],
        ),
        200,
        200,
      );
      for (const r of rows) {
        const recordID = String(r.record_id || "").trim();
        const groupID = String(r?.fields?.[wf.GroupID] ?? "").trim();
        if (!recordID || !groupID) continue;
        existingByKey.set(`${b.bizType}@@${b.dayMs}@@${groupID}`, { recordID });
      }
    }
  }

  const createRows: Array<{ fields: Record<string, any> }> = [];
  const updateRows: Array<{ record_id: string; fields: Record<string, any> }> = [];
  const errors: Array<{ group_id: string; date: string; biz_type: string; err: string }> = [];

  for (const it of normalized) {
    const dayMs = dayStartMs(it.date);
    const bizType = it.biz_type || bizTypeDefault;
    const k = `${bizType}@@${dayMs}@@${it.group_id}`;
    const taskIDsPayload = JSON.stringify(it.task_ids);
    const dramaInfo = it.drama_info || "";

    const exist = existingByKey.get(k);
    if (exist?.recordID) {
      updateRows.push({
        record_id: exist.recordID,
        fields: {
          [wf.TaskIDs]: taskIDsPayload,
          ...(dramaInfo ? { [wf.DramaInfo]: dramaInfo } : {}),
        },
      });
      continue;
    }
    createRows.push({
      fields: {
        [wf.BizType]: bizType,
        [wf.GroupID]: it.group_id,
        [wf.Status]: "pending",
        [wf.TaskIDs]: taskIDsPayload,
        ...(dramaInfo ? { [wf.DramaInfo]: dramaInfo } : {}),
        [wf.Date]: dayMs,
        [wf.RetryCount]: 0,
      },
    });
  }

  if (!dryRun) {
    if (createRows.length) {
      try {
        await batchCreate(ctx, webhookURL, createRows);
      } catch (err: any) {
        errors.push({ group_id: "-", date: "-", biz_type: bizTypeDefault, err: err?.message || String(err) });
      }
    }
    if (updateRows.length) {
      try {
        await batchUpdate(ctx, webhookURL, updateRows);
      } catch (err: any) {
        errors.push({ group_id: "-", date: "-", biz_type: bizTypeDefault, err: err?.message || String(err) });
      }
    }
  }

  const summary = {
    dry_run: dryRun,
    input_items: normalized.length,
    created: createRows.length,
    updated: updateRows.length,
    errors,
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  // keep consistent with other scripts: write error to stderr
  process.stderr.write(`[group-webhook-dispatch] ${msg}\n`);
  process.exit(1);
});
