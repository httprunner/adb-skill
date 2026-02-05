---
name: android-adb
description: Android device control and UI automation via ADB with a TypeScript helper CLI. Use when tasks involve connecting to devices/emulators, running adb shell commands, tapping/swiping, key events, text input, app launch, screenshots, or general device management through adb.
---

# ADB (TypeScript)

Use this skill to drive Android devices with `adb` and the TypeScript helper CLI for common device management and UI actions.

## Quick workflow

- Identify device: `adb devices -l`. If multiple devices, always use `-s <device_id>`.
- Verify readiness: device status should be `device`.
- Prefer deterministic actions: tap/swipe/keyevent via `adb shell input`.
- For text: prefer ADB Keyboard broadcast if installed; otherwise escape text for `adb shell input text`.
- For screenshots: use `adb exec-out screencap -p > file.png` when possible. Prefer a shared directory `~/.eval/screenshots/` and add timestamps to avoid overwriting.

## UI Inspection (Text-Based)

- Dump UI: `npx tsx scripts/adb_helpers.ts dump-ui --parse`
  - Creates `window_dump.xml` locally.
  - `--parse` outputs clickable elements (buttons) and input fields (EditText).
- Use this to find coordinates for `tap` or text/resource-ids for validation.

## UI Inspection (Vision-Based via ai-vision)

If `dump-ui` returns empty/partial trees, call the `ai-vision` skill to infer coordinates from a screenshot, then feed those coordinates into `adb` taps. This keeps UI understanding separate from device control. `ai-vision` returns absolute pixel coordinates ready for `adb_helpers`.

Quick flow:
1. Capture screenshot.
2. Use `ai-vision` to query coordinates or assert UI text.
3. Apply returned `(x, y)` with `npx tsx scripts/adb_helpers.ts tap X Y`.

Example:
```bash
# 1) Screenshot
mkdir -p ~/.eval/screenshots
SCREENSHOT=~/.eval/screenshots/ui_$(date +"%Y%m%d_%H%M%S").png
npx tsx scripts/adb_helpers.ts -s SERIAL screenshot -out "$SCREENSHOT"

# 2) Query coordinates with ai-vision
npx tsx ../ai-vision/scripts/ai_vision.ts query \
  --screenshot "$SCREENSHOT" \
  --prompt "请识别屏幕上与“搜索”相关的文字或放大镜图标，并返回其坐标"

# 3) Tap returned coordinates (absolute pixels)
npx tsx scripts/adb_helpers.ts -s SERIAL tap X Y
```

Notes:
- Keep prompts explicit (exact text/icon description + request center coordinates).
- Validate by taking another screenshot and retrying with a tighter prompt if needed.

## When running commands

- Always include `-s <device_id>` if more than one device is connected.
- If the request is ambiguous, ask for device id, package name, or coordinates.
- Use `adb shell wm size` to confirm screen resolution before coordinate-based actions.
- Treat errors from `adb` as actionable: surface stderr and suggest fixes (authorization, cable, tcpip).

## Resources

- Reference guide: `references/adb-reference.md`.
- Helper script: `scripts/adb_helpers.ts` (subcommand-based CLI wrapper). Use it for repeatable tasks or when multiple steps are needed.

## Script usage

Run:

```bash
npx tsx scripts/adb_helpers.ts --help
```

Prefer script subcommands for:

- device listing / connect / disconnect
- tap / swipe / keyevent
- text input (with safe escaping)
- screenshots
- dump-ui (UI hierarchy inspection)

If the script is insufficient, fall back to raw `adb` commands from the reference.
