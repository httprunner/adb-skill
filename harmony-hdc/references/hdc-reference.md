# HDC Command Reference

This document lists common `hdc` commands for HarmonyOS device management and automation.

## Device Connection

| Action | Command | Description |
| :--- | :--- | :--- |
| **List Devices** | `hdc list targets` | List all connected devices (USB/WiFi). |
| **Connect** | `hdc tconn <ip>:<port>` | Connect to a remote device. Default port is 5555. |
| **Disconnect** | `hdc tdisconn <ip>:<port>` | Disconnect a remote device. |
| **TCP/IP Mode** | `hdc tmode port <port>` | Restart HDC daemon on device to listen on TCP port. |
| **Kill Server** | `hdc kill` | Kill the local HDC server. |
| **Start Server** | `hdc start -r` | Start/Restart the local HDC server. |

## App Management

| Action | Command | Description |
| :--- | :--- | :--- |
| **Install** | `hdc install <path.hap>` | Install a HAP package. |
| **Uninstall** | `hdc uninstall <bundle_name>` | Uninstall an app by bundle name. |
| **Start App** | `hdc shell aa start -b <bundle> -a <ability>` | Launch an ability. `-a` is optional if it's the main ability. |
| **Stop App** | `hdc shell aa force-stop <bundle>` | Force stop an app. |
| **App Info** | `hdc shell aa dump -l` | Dump running ability information (find foreground app). |

## UI Automation (uitest)

HarmonyOS uses `uitest` for simulated input.

| Action | Command | Description |
| :--- | :--- | :--- |
| **Tap** | `hdc shell uitest uiInput click <x> <y>` | Tap at coordinates. |
| **Double Tap** | `hdc shell uitest uiInput doubleClick <x> <y>` | Double tap at coordinates. |
| **Long Press** | `hdc shell uitest uiInput longClick <x> <y>` | Long press at coordinates. |
| **Swipe** | `hdc shell uitest uiInput swipe <x1> <y1> <x2> <y2> [duration]` | Swipe/Drag. |
| **Input Text** | `hdc shell uitest uiInput text "<content>"` | Input text into focused field. |
| **Key Event** | `hdc shell uitest uiInput keyEvent <key>` | Send key event (e.g., `Back`, `Home`). |

## File Management

| Action | Command | Description |
| :--- | :--- | :--- |
| **Push** | `hdc file send <local> <remote>` | Copy file to device. |
| **Pull** | `hdc file recv <remote> <local>` | Copy file from device. |

## Miscellaneous

| Action | Command | Description |
| :--- | :--- | :--- |
| **Screenshot** | `hdc shell screenshot <path>` | Capture screen to device path (e.g., `/data/local/tmp/s.jpg`). |
| **Log** | `hdc hilog` | View device logs (similar to logcat). |
| **Shell** | `hdc shell <cmd>` | Execute shell command. |
