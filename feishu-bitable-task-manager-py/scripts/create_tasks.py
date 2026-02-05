#!/usr/bin/env python3
"""Create tasks in Feishu Bitable via HTTP."""

from __future__ import annotations

import argparse
import json
import sys
import time
from typing import Any, Dict, List, Optional

import bitable_common as common

MAX_BATCH_SIZE = 500

APP_GROUP_LABELS = {
    "com.smile.gifmaker": "快手",
}

MAX_FILTER_VALUES = 50


def build_create_fields(fields_map: Dict[str, str], item: Dict[str, Any]) -> Dict[str, Any]:
    fields: Dict[str, Any] = {}

    biz_task_id = (item.get("biz_task_id") or "").strip()
    if biz_task_id and fields_map.get("BizTaskID"):
        fields[fields_map["BizTaskID"]] = biz_task_id

    parent_task_id = (item.get("parent_task_id") or "").strip()
    if parent_task_id and fields_map.get("ParentTaskID"):
        fields[fields_map["ParentTaskID"]] = parent_task_id

    app_value = (item.get("app") or "").strip()
    scene_value = (item.get("scene") or "").strip()
    params_value = (item.get("params") or "").strip()
    item_id_value = (item.get("item_id") or "").strip()
    book_id_value = (item.get("book_id") or "").strip()
    url_value = (item.get("url") or "").strip()
    user_id_value = (item.get("user_id") or "").strip()
    user_name_value = (item.get("user_name") or "").strip()
    status_value = (item.get("status") or "").strip()
    logs_value = (item.get("logs") or "").strip()
    last_screenshot_value = (item.get("last_screenshot") or "").strip()
    group_id_value = (item.get("group_id") or "").strip()

    for key, field, value in (
        ("app", "App", app_value),
        ("scene", "Scene", scene_value),
        ("params", "Params", params_value),
        ("item_id", "ItemID", item_id_value),
        ("book_id", "BookID", book_id_value),
        ("url", "URL", url_value),
        ("user_id", "UserID", user_id_value),
        ("user_name", "UserName", user_name_value),
        ("status", "Status", status_value),
        ("logs", "Logs", logs_value),
        ("last_screenshot", "LastScreenShot", last_screenshot_value),
        ("group_id", "GroupID", group_id_value),
    ):
        if value and fields_map.get(field):
            fields[fields_map[field]] = value

    if not group_id_value and app_value and book_id_value and user_id_value and fields_map.get("GroupID"):
        app_label = APP_GROUP_LABELS.get(app_value, app_value)
        fields[fields_map["GroupID"]] = f"{app_label}_{book_id_value}_{user_id_value}"

    date_value = item.get("date")
    if date_value is not None and fields_map.get("Date"):
        payload = common.coerce_date_payload(date_value)
        if payload is not None:
            fields[fields_map["Date"]] = payload

    device_serial = (item.get("device_serial") or "").strip()
    if device_serial and fields_map.get("DeviceSerial"):
        fields[fields_map["DeviceSerial"]] = device_serial

    dispatched_device = (item.get("dispatched_device") or "").strip()
    if not dispatched_device:
        dispatched_device = device_serial
    if dispatched_device and fields_map.get("DispatchedDevice"):
        fields[fields_map["DispatchedDevice"]] = dispatched_device

    dispatched_ms = common.coerce_millis(item.get("dispatched_at"))
    start_ms = common.coerce_millis(item.get("start_at"))
    if dispatched_ms is not None and fields_map.get("DispatchedAt"):
        fields[fields_map["DispatchedAt"]] = dispatched_ms
    if start_ms is None and dispatched_ms is not None:
        start_ms = dispatched_ms
    if start_ms is not None and fields_map.get("StartAt"):
        fields[fields_map["StartAt"]] = start_ms

    completed_ms = common.coerce_millis(item.get("completed_at"))
    end_ms = common.coerce_millis(item.get("end_at"))
    if completed_ms is not None:
        end_ms = completed_ms
    if end_ms is not None and fields_map.get("EndAt"):
        fields[fields_map["EndAt"]] = end_ms

    elapsed = common.coerce_int(item.get("elapsed_seconds"))
    if elapsed is None and start_ms is not None and end_ms is not None:
        elapsed = max(0, int((end_ms - start_ms) / 1000))
    if elapsed is not None and fields_map.get("ElapsedSeconds"):
        fields[fields_map["ElapsedSeconds"]] = elapsed

    items_collected = common.coerce_int(item.get("items_collected"))
    if items_collected is not None and fields_map.get("ItemsCollected"):
        fields[fields_map["ItemsCollected"]] = items_collected

    retry_count = common.coerce_int(item.get("retry_count"))
    if retry_count is not None and fields_map.get("RetryCount"):
        fields[fields_map["RetryCount"]] = retry_count

    extra = item.get("extra")
    force_extra = bool(item.get("force_extra"))
    if fields_map.get("Extra") and extra is not None:
        extra_payload = common.normalize_extra(extra)
        if extra_payload or force_extra:
            fields[fields_map["Extra"]] = extra_payload

    extra_fields = item.get("fields")
    if isinstance(extra_fields, dict):
        for key, value in extra_fields.items():
            if key and value is not None:
                fields[key] = value

    return fields


def batch_create_records(base_url: str, token: str, ref: common.BitableRef, records: List[dict]) -> None:
    url = (
        f"{base_url}/open-apis/bitable/v1/apps/{ref.app_token}"
        f"/tables/{ref.table_id}/records/batch_create"
    )
    payload = {"records": records}
    resp = common.request_json("POST", url, token, payload)
    if resp.get("code") != 0:
        raise RuntimeError(
            f"batch create failed: code={resp.get('code')} msg={resp.get('msg')}"
        )


def create_record(base_url: str, token: str, ref: common.BitableRef, fields: Dict[str, Any]) -> None:
    url = (
        f"{base_url}/open-apis/bitable/v1/apps/{ref.app_token}"
        f"/tables/{ref.table_id}/records"
    )
    payload = {"fields": fields}
    resp = common.request_json("POST", url, token, payload)
    if resp.get("code") != 0:
        raise RuntimeError(
            f"create record failed: code={resp.get('code')} msg={resp.get('msg')}"
        )


def chunked(values: List[str], size: int) -> List[List[str]]:
    if size <= 0:
        return [values]
    return [values[i : i + size] for i in range(0, len(values), size)]


def build_id_filter(field_name: str, values: List[str]) -> Optional[dict]:
    field_name = (field_name or "").strip()
    if not field_name:
        return None
    seen = set()
    conditions = []
    for value in values:
        value = (value or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        conditions.append({"field_name": field_name, "operator": "is", "value": [value]})
    if not conditions:
        return None
    return {"conjunction": "or", "conditions": conditions}


def fetch_records(
    base_url: str,
    token: str,
    ref: common.BitableRef,
    filter_obj: Optional[dict],
    page_size: int,
) -> List[dict]:
    page_size = common.clamp_page_size(page_size)
    url = (
        f"{base_url}/open-apis/bitable/v1/apps/{ref.app_token}"
        f"/tables/{ref.table_id}/records/search?page_size={page_size}"
    )
    body = {"filter": filter_obj} if filter_obj else None
    resp = common.request_json("POST", url, token, body)
    if resp.get("code") != 0:
        raise RuntimeError(f"search records failed: code={resp.get('code')} msg={resp.get('msg')}")
    data = resp.get("data") or {}
    return data.get("items") or []


def resolve_existing_by_field(
    base_url: str,
    token: str,
    ref: common.BitableRef,
    field_name: str,
    values: List[str],
) -> Dict[str, str]:
    existing: Dict[str, str] = {}
    if not values:
        return existing
    for batch in chunked(values, MAX_FILTER_VALUES):
        filter_obj = build_id_filter(field_name, batch)
        if not filter_obj:
            continue
        items = fetch_records(
            base_url=base_url,
            token=token,
            ref=ref,
            filter_obj=filter_obj,
            page_size=min(common.MAX_PAGE_SIZE, max(len(batch), 1)),
        )
        for item in items:
            record_id = (item.get("record_id") or "").strip()
            raw_fields = item.get("fields") or {}
            value = common.bitable_value_to_string(raw_fields.get(field_name, ""))
            if record_id and value and value not in existing:
                existing[value] = record_id
    return existing


def record_exists(base_url: str, token: str, ref: common.BitableRef, record_id: str) -> bool:
    record_id = (record_id or "").strip()
    if not record_id:
        return False
    url = (
        f"{base_url}/open-apis/bitable/v1/apps/{ref.app_token}"
        f"/tables/{ref.table_id}/records/{record_id}"
    )
    try:
        resp = common.request_json("GET", url, token, None)
    except Exception:
        return False
    return resp.get("code") == 0


def normalize_skip_fields(raw: str) -> List[str]:
    if not raw:
        return []
    parts = [part.strip() for part in raw.split(",") if part.strip()]
    resolved: List[str] = []
    aliases = {
        "task_id": "TaskID",
        "taskid": "TaskID",
        "biz_task_id": "BizTaskID",
        "biztaskid": "BizTaskID",
        "record_id": "RecordID",
        "recordid": "RecordID",
        "book_id": "BookID",
        "bookid": "BookID",
        "user_id": "UserID",
        "userid": "UserID",
        "app": "App",
        "scene": "Scene",
    }
    for part in parts:
        key = part
        if part.lower() in aliases:
            key = aliases[part.lower()]
        if key:
            resolved.append(key)
    seen = set()
    uniq = []
    for name in resolved:
        if name not in seen:
            seen.add(name)
            uniq.append(name)
    return uniq


def extract_item_value(item: Dict[str, Any], field_name: str) -> str:
    if field_name == "TaskID":
        task_id = common.coerce_int(item.get("task_id"))
        return str(task_id) if task_id else ""
    if field_name == "BizTaskID":
        return (item.get("biz_task_id") or "").strip()
    if field_name == "RecordID":
        return (item.get("record_id") or "").strip()
    if field_name == "BookID":
        return (item.get("book_id") or "").strip()
    if field_name == "UserID":
        return (item.get("user_id") or "").strip()
    if field_name == "App":
        return (item.get("app") or "").strip()
    if field_name == "Scene":
        return (item.get("scene") or "").strip()
    raw = item.get(field_name)
    return common.bitable_value_to_string(raw)


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Create tasks in Feishu Bitable (HTTP).")
    parser.add_argument("--task-url", default=common.env("TASK_BITABLE_URL"), help="Bitable task table URL")
    parser.add_argument("--input", default="", help="Input JSON or JSONL file (use - for stdin)")
    parser.add_argument("--biz-task-id", default="", help="Biz task id to create")
    parser.add_argument("--parent-task-id", default="", help="Parent task id")
    parser.add_argument("--app", default="", help="App value")
    parser.add_argument("--scene", default="", help="Scene value")
    parser.add_argument("--params", default="", help="Task params")
    parser.add_argument("--item-id", default="", help="Item id")
    parser.add_argument("--book-id", default="", help="Book id")
    parser.add_argument("--url", default="", help="URL")
    parser.add_argument("--user-id", default="", help="User id")
    parser.add_argument("--user-name", default="", help="User name")
    parser.add_argument("--date", default="", help="Date value (string or epoch/ISO)")
    parser.add_argument("--status", default="", help="Status")
    parser.add_argument("--device-serial", default="", help="Dispatched device serial")
    parser.add_argument("--dispatched-device", default="", help="Dispatched device (override device-serial)")
    parser.add_argument("--dispatched-at", default="", help="Dispatch time (ms/seconds/ISO/now)")
    parser.add_argument("--start-at", default="", help="Start time (ms/seconds/ISO)")
    parser.add_argument("--completed-at", default="", help="Completion time (ms/seconds/ISO)")
    parser.add_argument("--end-at", default="", help="End time (ms/seconds/ISO)")
    parser.add_argument("--elapsed-seconds", default="", help="Elapsed seconds (int)")
    parser.add_argument("--items-collected", default="", help="Items collected (int)")
    parser.add_argument("--logs", default="", help="Logs path or identifier")
    parser.add_argument("--retry-count", default="", help="Retry count (int)")
    parser.add_argument("--last-screenshot", default="", help="Last screenshot reference")
    parser.add_argument("--group-id", default="", help="Group id")
    parser.add_argument("--extra", default="", help="Extra JSON string")
    parser.add_argument(
        "--skip-existing",
        default="",
        help="Skip create when existing records match these fields (comma-separated, all must match)",
    )
    return parser.parse_args(argv)


def load_creates(args: argparse.Namespace, fields_map: Dict[str, str]) -> List[dict]:
    items: List[dict]
    if args.input:
        if args.input == "-":
            raw = sys.stdin.read()
        else:
            with open(args.input, "r", encoding="utf-8") as handle:
                raw = handle.read()
        mode = common.detect_input_format(args.input, raw)
        items = common.parse_jsonl_input(raw) if mode == "jsonl" else common.parse_json_input(raw)
    else:
        items = [
            {
                "biz_task_id": args.biz_task_id,
                "parent_task_id": args.parent_task_id,
                "app": args.app,
                "scene": args.scene,
                "params": args.params,
                "item_id": args.item_id,
                "book_id": args.book_id,
                "url": args.url,
                "user_id": args.user_id,
                "user_name": args.user_name,
                "date": args.date,
                "status": args.status,
                "device_serial": args.device_serial,
                "dispatched_device": args.dispatched_device,
                "dispatched_at": args.dispatched_at,
                "start_at": args.start_at,
                "completed_at": args.completed_at,
                "end_at": args.end_at,
                "elapsed_seconds": args.elapsed_seconds,
                "items_collected": args.items_collected,
                "logs": args.logs,
                "retry_count": args.retry_count,
                "last_screenshot": args.last_screenshot,
                "group_id": args.group_id,
                "extra": args.extra,
            }
        ]

    known_keys = {
        "task_id",
        "taskID",
        "TaskID",
        "biz_task_id",
        "bizTaskId",
        "BizTaskID",
        "record_id",
        "recordId",
        "RecordID",
        "parent_task_id",
        "parentTaskId",
        "ParentTaskID",
        "app",
        "App",
        "scene",
        "Scene",
        "params",
        "Params",
        "item_id",
        "itemId",
        "ItemID",
        "book_id",
        "bookId",
        "BookID",
        "url",
        "URL",
        "user_id",
        "userId",
        "UserID",
        "user_name",
        "userName",
        "UserName",
        "date",
        "Date",
        "status",
        "Status",
        "device_serial",
        "DeviceSerial",
        "dispatched_device",
        "DispatchedDevice",
        "dispatched_at",
        "DispatchedAt",
        "start_at",
        "StartAt",
        "completed_at",
        "end_at",
        "EndAt",
        "elapsed_seconds",
        "ElapsedSeconds",
        "items_collected",
        "ItemsCollected",
        "logs",
        "Logs",
        "retry_count",
        "RetryCount",
        "last_screenshot",
        "LastScreenShot",
        "group_id",
        "GroupID",
        "extra",
        "Extra",
        "fields",
        "CDNURL",
        "cdn_url",
        "cdnUrl",
        "cdnurl",
    }

    allowed_field_names = {value for value in fields_map.values() if value}

    def pick(item: dict, key: str, fallback: Any) -> Any:
        if key in item and item[key] is not None:
            return item[key]
        return fallback

    normalized: List[dict] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        cdn_url = ""
        for key in ("CDNURL", "cdn_url", "cdnUrl", "cdnurl"):
            raw = item.get(key)
            if isinstance(raw, str) and raw.strip():
                cdn_url = raw.strip()
                break

        extra = pick(item, "extra", args.extra)
        force_extra = False
        if cdn_url:
            extra = {"cdn_url": cdn_url}
            force_extra = True

        extra_fields: Dict[str, Any] = {}
        for key, value in item.items():
            if key in known_keys:
                continue
            if key in allowed_field_names and value is not None:
                extra_fields[key] = value
        raw_fields = item.get("fields")
        if isinstance(raw_fields, dict):
            for key, value in raw_fields.items():
                if key and value is not None:
                    extra_fields[key] = value

        merged = {
            "task_id": item.get("task_id") or item.get("taskID") or item.get("TaskID"),
            "biz_task_id": item.get("biz_task_id") or item.get("bizTaskId") or item.get("BizTaskID"),
            "record_id": item.get("record_id") or item.get("recordId") or item.get("RecordID"),
            "parent_task_id": item.get("parent_task_id") or item.get("parentTaskId") or item.get("ParentTaskID"),
            "app": pick(item, "app", args.app) or item.get("App"),
            "scene": pick(item, "scene", args.scene) or item.get("Scene"),
            "params": pick(item, "params", args.params) or item.get("Params"),
            "item_id": pick(item, "item_id", args.item_id) or item.get("ItemID"),
            "book_id": pick(item, "book_id", args.book_id) or item.get("BookID"),
            "url": pick(item, "url", args.url) or item.get("URL"),
            "user_id": pick(item, "user_id", args.user_id) or item.get("UserID"),
            "user_name": pick(item, "user_name", args.user_name) or item.get("UserName"),
            "date": pick(item, "date", args.date) or item.get("Date"),
            "status": pick(item, "status", args.status) or item.get("Status"),
            "device_serial": pick(item, "device_serial", args.device_serial) or item.get("DeviceSerial"),
            "dispatched_device": pick(item, "dispatched_device", args.dispatched_device) or item.get("DispatchedDevice"),
            "dispatched_at": pick(item, "dispatched_at", args.dispatched_at) or item.get("DispatchedAt"),
            "start_at": pick(item, "start_at", args.start_at) or item.get("StartAt"),
            "completed_at": pick(item, "completed_at", args.completed_at),
            "end_at": pick(item, "end_at", args.end_at) or item.get("EndAt"),
            "elapsed_seconds": pick(item, "elapsed_seconds", args.elapsed_seconds) or item.get("ElapsedSeconds"),
            "items_collected": pick(item, "items_collected", args.items_collected) or item.get("ItemsCollected"),
            "logs": pick(item, "logs", args.logs) or item.get("Logs"),
            "retry_count": pick(item, "retry_count", args.retry_count) or item.get("RetryCount"),
            "last_screenshot": pick(item, "last_screenshot", args.last_screenshot) or item.get("LastScreenShot"),
            "group_id": pick(item, "group_id", args.group_id) or item.get("GroupID"),
            "extra": extra,
            "force_extra": force_extra,
            "fields": extra_fields,
        }
        normalized.append(merged)
    return normalized


def main(argv: List[str]) -> int:
    args = parse_args(argv)
    task_url = (args.task_url or "").strip()
    if not task_url:
        print("TASK_BITABLE_URL is required", file=sys.stderr)
        return 2

    app_id = common.env("FEISHU_APP_ID")
    app_secret = common.env("FEISHU_APP_SECRET")
    if not app_id or not app_secret:
        print("FEISHU_APP_ID/FEISHU_APP_SECRET are required", file=sys.stderr)
        return 2

    base_url = common.env("FEISHU_BASE_URL", common.DEFAULT_BASE_URL)
    fields_map = common.load_task_fields_from_env()

    creates = load_creates(args, fields_map)
    if not creates:
        print("no tasks provided", file=sys.stderr)
        return 2

    try:
        ref = common.parse_bitable_url(task_url)
        token = common.get_tenant_access_token(base_url, app_id, app_secret)
        if not ref.app_token:
            if ref.wiki_token:
                ref.app_token = common.resolve_wiki_app_token(base_url, token, ref.wiki_token)
            else:
                print("bitable URL missing app_token and wiki_token", file=sys.stderr)
                return 2
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    records: List[dict] = []
    errors: List[str] = []
    skipped = 0

    skip_fields = normalize_skip_fields(args.skip_existing)
    existing_by_field: Dict[str, Dict[str, str]] = {}
    existing_record_ids: set[str] = set()
    if skip_fields:
        field_map = {key: fields_map.get(key, key) for key in skip_fields if key != "RecordID"}
        for item in creates:
            for field_name in skip_fields:
                if field_name == "RecordID":
                    record_id = (item.get("record_id") or "").strip()
                    if record_id and record_id not in existing_record_ids:
                        if record_exists(base_url, token, ref, record_id):
                            existing_record_ids.add(record_id)
                    continue
                value = extract_item_value(item, field_name)
                if not value:
                    continue
                existing_by_field.setdefault(field_name, {})[value] = ""
        for field_name, values_map in list(existing_by_field.items()):
            mapped_field = field_map.get(field_name, field_name)
            values = list(values_map.keys())
            existing_by_field[field_name] = resolve_existing_by_field(
                base_url=base_url,
                token=token,
                ref=ref,
                field_name=mapped_field,
                values=values,
            )
    for item in creates:
        if skip_fields:
            all_match = True
            for field_name in skip_fields:
                if field_name == "RecordID":
                    record_id = (item.get("record_id") or "").strip()
                    if not record_id or record_id not in existing_record_ids:
                        all_match = False
                        break
                    continue
                value = extract_item_value(item, field_name)
                if not value or value not in existing_by_field.get(field_name, {}):
                    all_match = False
                    break
            if all_match:
                skipped += 1
                continue

        fields = build_create_fields(fields_map, item)
        if not fields:
            errors.append("task: no fields to create")
            continue
        records.append({"fields": fields})

    start = time.time()
    created = 0
    try:
        if len(records) == 1:
            create_record(base_url, token, ref, records[0]["fields"])
            created = 1
        else:
            for idx in range(0, len(records), MAX_BATCH_SIZE):
                batch = records[idx : idx + MAX_BATCH_SIZE]
                batch_create_records(base_url, token, ref, batch)
                created += len(batch)
    except RuntimeError as exc:
        errors.append(str(exc))

    duration = time.time() - start
    payload = {
        "created": created,
        "requested": len(records),
        "skipped": skipped,
        "failed": len(errors),
        "errors": errors,
        "elapsed_seconds": round(duration, 3),
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
