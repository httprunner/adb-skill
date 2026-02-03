---
name: wechat-video-search-android
description: Automate WeChat Video Accounts (视频号) general search on Android via ADB. Use when you need to open WeChat, navigate Discover to Video Accounts, enter a keyword in the search UI, trigger search, and continuously scroll results to the bottom using adb shell commands.
---

# WeChat Video Search (Android)

## Overview
Drive WeChat (com.tencent.mm) UI with ADB to execute the Video Accounts general search flow and scroll results to the bottom. This skill builds on android-adb-go for device control, safe text input, and swipe loops. Always use the ai-vision skill to locate UI elements from screenshots. Do not use `dump-ui` for element discovery in any step.

## Workflow

### 1. Preflight
- Run commands from the `android-adb-go` skill directory so `scripts/adb_helpers.go` resolves correctly.
- Confirm device: `go run scripts/adb_helpers.go devices`
- If multiple devices, use `-s SERIAL` for all commands.
- Optional: confirm resolution (helps for coordinate taps):
  `go run scripts/adb_helpers.go -s SERIAL wm-size`
- If the current foreground app is not WeChat, launch WeChat before continuing.
  - Check current app:
    `go run scripts/adb_helpers.go -s SERIAL get-current-app`
  - Launch WeChat:
    `go run scripts/adb_helpers.go -s SERIAL launch com.tencent.mm`

### 2. Launch WeChat
- Launch app:
  `go run scripts/adb_helpers.go -s SERIAL launch com.tencent.mm`
- If the app is already open in a different tab or page, continue to the next step.

### 3. Navigate to Discover -> Video Accounts
- Use ai-vision to locate text-based targets and get tap coordinates from screenshots. Never use `dump-ui`.
- Tap the bottom tab labeled `发现` (Discover).
- Tap the entry labeled `视频号` (Video Accounts).
- Example:
  `go run ../ai-vision/scripts/ai_vision.go query --screenshot screen.png --prompt "请识别底部“发现”按钮并返回坐标"`

### 4. Enter Search UI
- Tap the magnifier icon or search box in Video Accounts (use ai-vision to locate it by screenshot; never use `dump-ui`).
- Always clear input using ADBKeyboard, then input the query text.
- If the magnifier/search box is obscured by the video UI, swipe to the next video and retry detection.

### 5. Input Search Term and Trigger Search
- Clear + input text (ADBKeyboard):
  `go run scripts/adb_helpers.go -s SERIAL text --adb-keyboard --clear`
  `go run scripts/adb_helpers.go -s SERIAL text --adb-keyboard "QUERY"`
- Trigger search by tapping the on-screen Search button or sending enter keyevent:
  `go run scripts/adb_helpers.go -s SERIAL keyevent KEYCODE_ENTER`
- If the search result list does not appear (still showing suggestions), retry `KEYCODE_ENTER`.

### 6. Scroll Results to Bottom
- Perform repeated swipes until the page bottom is reached.
- Stop when the bottom indicator appears: a horizontal line separator, or after N (e.g., 3) swipes with no new items.

Example swipe loop (manual execution):
```
go run scripts/adb_helpers.go -s SERIAL swipe 540 1800 540 400 800
```
- Adjust coordinates based on screen size (from `wm-size`).
- Use screenshots + ai-vision to confirm progress if needed.

## Notes and Troubleshooting
- If taps miss: re-capture screenshot and ask ai-vision for tighter coordinates (do not fall back to `dump-ui`).
- If text input fails: use `--auto-ime` or install ADB Keyboard, then retry.
- If WeChat opens to a modal or ad: dismiss with back keyevent and re-enter the flow.
