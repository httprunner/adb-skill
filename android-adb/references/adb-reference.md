# ADB reference (android-adb-go)

## ADB server

- Start server:
  - `npx tsx scripts/adb_helpers.ts start-server`
- Kill server:
  - `npx tsx scripts/adb_helpers.ts kill-server`

## Device discovery and selection

- List devices and get serial:
  - `npx tsx scripts/adb_helpers.ts devices`
- Target a device:
  - `npx tsx scripts/adb_helpers.ts -s SERIAL <command>`

## Connection (Wi-Fi)

- Enable tcpip (USB required):
  - `npx tsx scripts/adb_helpers.ts -s SERIAL enable-tcpip [port]`
- Get device IP:
  - `npx tsx scripts/adb_helpers.ts -s SERIAL get-ip`
- Connect:
  - `npx tsx scripts/adb_helpers.ts connect <ip>:5555`
- Disconnect:
  - `npx tsx scripts/adb_helpers.ts disconnect [ip]:5555`

## Device info

- Screen size:
  - `npx tsx scripts/adb_helpers.ts -s SERIAL wm-size`
- Current foreground app:
  - `npx tsx scripts/adb_helpers.ts -s SERIAL get-current-app`

## App control

- Check app installed (replace with your package):
  - `npx tsx scripts/adb_helpers.ts -s SERIAL shell pm list packages | rg -n "<package>"`
- Launch app:
  - By package: `npx tsx scripts/adb_helpers.ts -s SERIAL launch <package>`
  - By activity: `npx tsx scripts/adb_helpers.ts -s SERIAL launch <package>/<activity>`
  - By schema/URI: `npx tsx scripts/adb_helpers.ts -s SERIAL launch <schema://path>`
- Stop app (force-stop):
  - `npx tsx scripts/adb_helpers.ts -s SERIAL force-stop <package>`

## Input actions

- Tap:
  - `npx tsx scripts/adb_helpers.ts -s SERIAL tap X Y`
- Double tap:
  - `npx tsx scripts/adb_helpers.ts -s SERIAL double-tap X Y`
- Long press:
  - `npx tsx scripts/adb_helpers.ts -s SERIAL long-press X Y [--duration-ms N]`
- Swipe:
  - `npx tsx scripts/adb_helpers.ts -s SERIAL swipe X1 Y1 X2 Y2 [--duration-ms N]`
- Keyevent (examples):
  - Back: `npx tsx scripts/adb_helpers.ts -s SERIAL keyevent KEYCODE_BACK`
  - Home: `npx tsx scripts/adb_helpers.ts -s SERIAL keyevent KEYCODE_HOME`
  - Enter: `npx tsx scripts/adb_helpers.ts -s SERIAL keyevent KEYCODE_ENTER`
- Go back multiple times to reach home (adds small random delays):
  - `for i in {1..5}; do npx tsx scripts/adb_helpers.ts -s SERIAL keyevent KEYCODE_BACK; sleep 0.$((RANDOM%6+5)); done`

## Text input (ADBKeyboard)

- Clear text:
  - `npx tsx scripts/adb_helpers.ts -s SERIAL clear-text`
- Input text:
  - `npx tsx scripts/adb_helpers.ts -s SERIAL text --adb-keyboard "YOUR_TEXT"`

## Screenshots

- Capture to file:
  - `npx tsx scripts/adb_helpers.ts -s SERIAL screenshot -out "<path>/shot.png"`

## UI tree

- Dump UI:
  - `npx tsx scripts/adb_helpers.ts -s SERIAL dump-ui [--out path] [--parse]`
