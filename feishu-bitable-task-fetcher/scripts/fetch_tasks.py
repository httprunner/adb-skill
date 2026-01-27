#!/usr/bin/env python3
"""Fetch tasks from Feishu Bitable via HTTP (table filters)."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import parse_qs, urlencode, urlparse
from urllib.request import Request, urlopen

DEFAULT_BASE_URL = "https://open.feishu.cn"
DEFAULT_PAGE_SIZE = 200
MAX_PAGE_SIZE = 500

TASK_FIELD_ENV_MAP = {
    "TASK_FIELD_TASKID": "TaskID",
    "TASK_FIELD_BIZ_TASK_ID": "BizTaskID",
    "TASK_FIELD_PARENT_TASK_ID": "ParentTaskID",
    "TASK_FIELD_APP": "App",
    "TASK_FIELD_SCENE": "Scene",
    "TASK_FIELD_PARAMS": "Params",
    "TASK_FIELD_ITEMID": "ItemID",
    "TASK_FIELD_BOOKID": "BookID",
    "TASK_FIELD_URL": "URL",
    "TASK_FIELD_USERID": "UserID",
    "TASK_FIELD_USERNAME": "UserName",
    "TASK_FIELD_DATE": "Date",
    "TASK_FIELD_STATUS": "Status",
    "TASK_FIELD_LOGS": "Logs",
    "TASK_FIELD_LAST_SCREEN_SHOT": "LastScreenShot",
    "TASK_FIELD_GROUPID": "GroupID",
    "TASK_FIELD_DEVICE_SERIAL": "DeviceSerial",
    "TASK_FIELD_DISPATCHED_DEVICE": "DispatchedDevice",
    "TASK_FIELD_DISPATCHED_AT": "DispatchedAt",
    "TASK_FIELD_START_AT": "StartAt",
    "TASK_FIELD_END_AT": "EndAt",
    "TASK_FIELD_ELAPSED_SECONDS": "ElapsedSeconds",
    "TASK_FIELD_ITEMS_COLLECTED": "ItemsCollected",
    "TASK_FIELD_EXTRA": "Extra",
    "TASK_FIELD_RETRYCOUNT": "RetryCount",
}


@dataclass
class BitableRef:
    raw_url: str
    app_token: str
    table_id: str
    view_id: str
    wiki_token: str


@dataclass
class PageInfo:
    has_more: bool
    next_page_token: str
    pages: int


def env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def clamp_page_size(size: int) -> int:
    if size <= 0:
        return DEFAULT_PAGE_SIZE
    if size > MAX_PAGE_SIZE:
        return MAX_PAGE_SIZE
    return size


def parse_bitable_url(raw: str) -> BitableRef:
    raw = (raw or "").strip()
    if not raw:
        raise ValueError("bitable url is empty")
    u = urlparse(raw)
    if not u.scheme:
        raise ValueError("bitable url missing scheme")

    segments = [s for s in u.path.strip("/").split("/") if s]
    app_token = ""
    wiki_token = ""
    for i in range(len(segments) - 1):
        if segments[i] == "base":
            app_token = segments[i + 1]
        elif segments[i] == "wiki":
            wiki_token = segments[i + 1]
        if app_token:
            break
    if not app_token and not wiki_token:
        if segments:
            app_token = segments[-1]
    qs = parse_qs(u.query)
    table_id = first_query_value(qs, "table", "tableId", "table_id")
    view_id = first_query_value(qs, "view", "viewId", "view_id")
    if not table_id:
        raise ValueError("missing table_id in bitable url query")
    return BitableRef(raw, app_token, table_id, view_id, wiki_token)


def first_query_value(qs: Dict[str, List[str]], *keys: str) -> str:
    for key in keys:
        vals = qs.get(key) or []
        for val in vals:
            if val and val.strip():
                return val.strip()
    return ""


def load_task_fields_from_env() -> Dict[str, str]:
    fields = {v: v for v in TASK_FIELD_ENV_MAP.values()}
    for env_name, default_name in TASK_FIELD_ENV_MAP.items():
        override = env(env_name, "")
        if override:
            fields[default_name] = override
    return fields


def request_json(method: str, url: str, token: Optional[str], payload: Optional[dict]) -> dict:
    data = None
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, method=method, headers=headers)
    with urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw)


def get_tenant_access_token(base_url: str, app_id: str, app_secret: str) -> str:
    url = f"{base_url}/open-apis/auth/v3/tenant_access_token/internal"
    payload = {"app_id": app_id, "app_secret": app_secret}
    resp = request_json("POST", url, None, payload)
    if resp.get("code") != 0:
        raise RuntimeError(f"tenant token error: code={resp.get('code')} msg={resp.get('msg')}")
    token = (resp.get("tenant_access_token") or "").strip()
    if not token:
        raise RuntimeError("tenant token missing in response")
    return token


def resolve_wiki_app_token(base_url: str, token: str, wiki_token: str) -> str:
    wiki_token = (wiki_token or "").strip()
    if not wiki_token:
        raise RuntimeError("wiki token is empty")
    url = f"{base_url}/open-apis/wiki/v2/spaces/get_node?token={wiki_token}"
    resp = request_json("GET", url, token, None)
    if resp.get("code") != 0:
        raise RuntimeError(f"wiki node error: code={resp.get('code')} msg={resp.get('msg')}")
    data = resp.get("data") or {}
    node = data.get("node") or {}
    obj_type = (node.get("obj_type") or "").strip()
    obj_token = (node.get("obj_token") or "").strip()
    if obj_type != "bitable":
        raise RuntimeError(f"wiki node obj_type is {obj_type}, not bitable")
    if not obj_token:
        raise RuntimeError("wiki node obj_token missing")
    return obj_token


def build_filter(fields: Dict[str, str], app: str, scene: str, status: str, date_preset: str) -> Optional[dict]:
    conds = []

    def add(field_key: str, value: str) -> None:
        name = fields.get(field_key, "").strip()
        val = (value or "").strip()
        if name and val:
            conds.append({"field_name": name, "operator": "is", "value": [val]})

    add("App", app)
    add("Scene", scene)
    add("Status", status)
    if date_preset and date_preset != "Any":
        add("Date", date_preset)

    if not conds:
        return None
    return {"conjunction": "and", "conditions": conds}


def fetch_records(
    base_url: str,
    token: str,
    ref: BitableRef,
    page_size: int,
    limit: int,
    ignore_view: bool,
    view_id: str,
    filter_obj: Optional[dict],
    max_pages: int,
) -> Tuple[List[dict], PageInfo]:
    page_size = clamp_page_size(page_size)
    if limit > 0 and limit < page_size:
        page_size = limit

    items: List[dict] = []
    page_token = ""
    pages = 0

    while True:
        query = {"page_size": str(page_size)}
        if page_token:
            query["page_token"] = page_token
        qs = urlencode(query)

        url = (
            f"{base_url}/open-apis/bitable/v1/apps/{ref.app_token}"
            f"/tables/{ref.table_id}/records/search?{qs}"
        )

        body = None
        if (not ignore_view and view_id) or filter_obj:
            body = {}
            if not ignore_view and view_id:
                body["view_id"] = view_id
            if filter_obj:
                body["filter"] = filter_obj

        resp = request_json("POST", url, token, body)
        if resp.get("code") != 0:
            raise RuntimeError(
                f"search records failed: code={resp.get('code')} msg={resp.get('msg')}"
            )

        data = resp.get("data") or {}
        batch = data.get("items") or []
        items.extend(batch)
        pages += 1

        has_more = bool(data.get("has_more"))
        page_token = (data.get("page_token") or "").strip()

        if limit > 0 and len(items) >= limit:
            items = items[:limit]
            break
        if max_pages > 0 and pages >= max_pages:
            break
        if not has_more or not page_token:
            break

    return items, PageInfo(has_more=bool(page_token), next_page_token=page_token, pages=pages)


def bitable_value_to_string(value: Any) -> str:
    return normalize_bitable_value(value).strip()


def normalize_bitable_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, bytes):
        return value.decode("utf-8").strip()
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if value.is_integer():
            return str(int(value))
        return str(value)
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, list):
        return normalize_bitable_array(value)
    if isinstance(value, dict):
        return normalize_bitable_object(value)
    return str(value).strip()


def normalize_bitable_array(items: List[Any]) -> str:
    if not items:
        return ""
    if is_rich_text_array(items):
        return join_rich_text(items)
    parts = [normalize_bitable_value(item) for item in items]
    parts = [p for p in parts if p]
    return ",".join(parts) if parts else ""


def normalize_bitable_object(obj: Dict[str, Any]) -> str:
    if not obj:
        return ""
    for key in ("value", "values", "elements", "content"):
        if key in obj:
            text = normalize_bitable_value(obj[key])
            if text:
                return text
    if isinstance(obj.get("text"), str) and obj["text"].strip():
        return obj["text"].strip()
    for key in ("link", "name", "en_name", "email", "id", "user_id", "url", "tmp_url", "file_token"):
        val = normalize_bitable_value(obj.get(key))
        if val:
            return val
    if any(k in obj for k in ("address", "location", "pname", "cityname", "adname")):
        parts = [
            normalize_bitable_value(obj.get("location")),
            normalize_bitable_value(obj.get("pname")),
            normalize_bitable_value(obj.get("cityname")),
            normalize_bitable_value(obj.get("adname")),
        ]
        parts = [p for p in parts if p]
        if parts:
            return ",".join(parts)
    try:
        return json.dumps(obj, ensure_ascii=False)
    except Exception:
        return ""


def is_rich_text_array(items: List[Any]) -> bool:
    for item in items:
        if isinstance(item, dict) and "text" in item:
            return True
    return False


def join_rich_text(items: List[Any]) -> str:
    parts: List[str] = []
    for item in items:
        if isinstance(item, dict):
            text = item.get("text")
            if isinstance(text, str) and text.strip():
                parts.append(text.strip())
                continue
            nested = item.get("value")
            nested_text = normalize_bitable_value(nested)
            if nested_text:
                parts.append(nested_text)
        else:
            text = normalize_bitable_value(item)
            if text:
                parts.append(text)
    return " ".join(parts) if parts else ""


def field_string(fields: Dict[str, Any], name: str) -> str:
    if not fields or not name:
        return ""
    return bitable_value_to_string(fields.get(name))


def field_int(fields: Dict[str, Any], name: str) -> int:
    raw = field_string(fields, name)
    if not raw:
        return 0
    try:
        return int(float(raw))
    except ValueError:
        return 0


def decode_task(fields: Dict[str, Any], mapping: Dict[str, str]) -> Optional[Dict[str, Any]]:
    if not fields:
        return None

    task_id = field_int(fields, mapping["TaskID"])
    if task_id == 0:
        return None

    def get(name: str) -> str:
        return field_string(fields, mapping[name])

    task = {
        "task_id": task_id,
        "biz_task_id": get("BizTaskID"),
        "parent_task_id": get("ParentTaskID"),
        "app": get("App"),
        "scene": get("Scene"),
        "params": get("Params"),
        "item_id": get("ItemID"),
        "book_id": get("BookID"),
        "url": get("URL"),
        "user_id": get("UserID"),
        "user_name": get("UserName"),
        "date": get("Date"),
        "status": get("Status"),
        "extra": get("Extra"),
        "logs": get("Logs"),
        "last_screenshot": get("LastScreenShot"),
        "group_id": get("GroupID"),
        "device_serial": get("DeviceSerial"),
        "dispatched_device": get("DispatchedDevice"),
        "dispatched_at": get("DispatchedAt"),
        "start_at": get("StartAt"),
        "end_at": get("EndAt"),
        "elapsed_seconds": get("ElapsedSeconds"),
        "items_collected": get("ItemsCollected"),
        "retry_count": get("RetryCount"),
    }

    if not any(
        task.get(key)
        for key in (
            "params",
            "item_id",
            "book_id",
            "url",
            "user_id",
            "user_name",
        )
    ):
        return None
    return task


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch tasks from Feishu Bitable (HTTP + table filters).")
    parser.add_argument("--task-url", default=env("TASK_BITABLE_URL"), help="Bitable task table URL")
    parser.add_argument("--app", required=True, help="App value for filter (e.g. com.smile.gifmaker)")
    parser.add_argument("--scene", required=True, help="Scene value for filter")
    parser.add_argument("--status", default="pending", help="Task status filter (default: pending)")
    parser.add_argument("--date", default="Today", help="Date preset: Today/Yesterday/Any")
    parser.add_argument("--limit", type=int, default=0, help="Max tasks to return (0 = no cap)")
    parser.add_argument("--page-size", type=int, default=DEFAULT_PAGE_SIZE, help="Page size (max 500)")
    parser.add_argument("--max-pages", type=int, default=0, help="Max pages to fetch (0 = no cap)")
    parser.add_argument("--ignore-view", action="store_true", default=True, help="Ignore view_id when searching")
    parser.add_argument("--use-view", dest="ignore_view", action="store_false", help="Use view_id from URL")
    parser.add_argument("--view-id", default="", help="Override view_id when searching")
    parser.add_argument("--jsonl", action="store_true", help="Output JSONL (one task per line)")
    parser.add_argument("--raw", action="store_true", help="Include raw fields in output")
    return parser.parse_args(argv)


def main(argv: List[str]) -> int:
    args = parse_args(argv)
    task_url = (args.task_url or "").strip()
    if not task_url:
        print("TASK_BITABLE_URL is required", file=sys.stderr)
        return 2

    app_id = env("FEISHU_APP_ID")
    app_secret = env("FEISHU_APP_SECRET")
    if not app_id or not app_secret:
        print("FEISHU_APP_ID/FEISHU_APP_SECRET are required", file=sys.stderr)
        return 2

    base_url = env("FEISHU_BASE_URL", DEFAULT_BASE_URL)

    ref = parse_bitable_url(task_url)
    fields = load_task_fields_from_env()
    filter_obj = build_filter(fields, args.app, args.scene, args.status, args.date)

    try:
        token = get_tenant_access_token(base_url, app_id, app_secret)
        if not ref.app_token:
            if ref.wiki_token:
                ref.app_token = resolve_wiki_app_token(base_url, token, ref.wiki_token)
            else:
                print("bitable URL missing app_token and wiki_token", file=sys.stderr)
                return 2
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    view_id = args.view_id.strip() if args.view_id.strip() else ref.view_id

    start = time.time()
    try:
        items, page_info = fetch_records(
            base_url=base_url,
            token=token,
            ref=ref,
            page_size=args.page_size,
            limit=args.limit,
            ignore_view=args.ignore_view,
            view_id=view_id,
            filter_obj=filter_obj,
            max_pages=args.max_pages,
        )
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    duration = time.time() - start

    tasks: List[Dict[str, Any]] = []
    for item in items:
        record_id = (item.get("record_id") or "").strip()
        fields_raw = item.get("fields") or {}
        task = decode_task(fields_raw, fields)
        if task is None:
            continue
        task["record_id"] = record_id
        if args.raw:
            task["raw_fields"] = fields_raw
        tasks.append(task)

    if args.jsonl:
        for task in tasks:
            print(json.dumps(task, ensure_ascii=False))
    else:
        payload = {
            "tasks": tasks,
            "count": len(tasks),
            "elapsed_seconds": round(duration, 3),
            "page_info": {
                "has_more": page_info.has_more,
                "next_page_token": page_info.next_page_token,
                "pages": page_info.pages,
            },
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
