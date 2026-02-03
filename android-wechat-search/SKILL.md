---
name: android-wechat-search
description: 通过 ADB 自动化实现 Android 微信视频号的视频号搜索流程：打开微信，进入“发现-视频号”，在搜索框输入关键词并触发搜索，滚动结果到底。适用于在真机/模拟器上自动完成视频号搜索与结果遍历的场景。
---

# 微信视频号搜索

## 概述
使用 ADB 驱动微信（com.tencent.mm）完成视频号通用搜索流程并将结果滚动到底。本技能依赖 android-adb-go 进行设备控制、安全文本输入与滑动循环。始终使用 ai-vision 从截图中定位 UI 元素，任何步骤都不要使用 `dump-ui` 做元素发现。

## 流程

### 1. 预检
- 在 `android-adb-go` 技能目录下执行命令，保证 `scripts/adb_helpers.go` 路径可用。
- 确认设备：`go run scripts/adb_helpers.go devices`
- 仅连接一台设备时默认使用该设备；仅在连接多台设备时才需要为所有命令加 `-s SERIAL`。
- 必须确认分辨率（用于坐标点击校准；单设备可省略 `-s SERIAL`）：
  `go run scripts/adb_helpers.go -s SERIAL wm-size`

### 2. 启动微信
- 启动应用：
  `go run scripts/adb_helpers.go -s SERIAL launch com.tencent.mm`
- 若微信已在其他页面或标签打开，直接进入下一步。
- 若前台应用不是微信，先确认并启动微信再继续。
  - 查看当前应用：
    `go run scripts/adb_helpers.go -s SERIAL get-current-app`
  - 启动微信：
    `go run scripts/adb_helpers.go -s SERIAL launch com.tencent.mm`

### 3. 进入 发现 -> 视频号
- 使用 ai-vision 从截图中定位文字目标并获取点击坐标，禁止使用 `dump-ui`。
- 点击底部标签 `发现`。
- 点击入口 `视频号`。
- 示例：
  `go run ../ai-vision/scripts/ai_vision.go query --screenshot screen.png --prompt "请识别底部“发现”按钮并返回坐标"`

### 4. 进入搜索界面
- 点击视频号中的放大镜图标或搜索框（用 ai-vision 通过截图定位；禁止 `dump-ui`）。
- 若放大镜/搜索框被视频 UI 遮挡，先滑到下一个视频再重新识别。

### 5. 输入关键词并触发搜索
- 使用 ADBKeyboard 清空并输入文本：
  `go run scripts/adb_helpers.go -s SERIAL text --adb-keyboard --clear`
  `go run scripts/adb_helpers.go -s SERIAL text --adb-keyboard "QUERY"`
- 点击屏幕上的搜索按钮或发送回车键事件触发搜索：
  `go run scripts/adb_helpers.go -s SERIAL keyevent KEYCODE_ENTER`
- 若未出现结果列表（仍为联想/建议），重试 `KEYCODE_ENTER`。

### 6. 结果滚动到底
- 反复滑动直到页面底部。
- 为减少截图识别开销，每滑动 5 次检测一次是否出现底部分割线作为触底判定。

示例滑动循环（手动执行）：
```
go run scripts/adb_helpers.go -s SERIAL swipe 540 1800 540 400 800
```
- 根据屏幕尺寸（`wm-size`）调整坐标。
- 必要时用截图 + ai-vision 确认进度。

## 备注与排障
- 点击不准：重新截图，让 ai-vision 提供更精确坐标（不要改用 `dump-ui`）。
- 微信弹出弹窗/广告：发送返回键关闭后重新进入流程。
