package cli

import (
	"flag"
	"fmt"
	"os"
	"strings"
)

func Run(args []string) int {
	fs, logJSON := rootFlagSet(os.Stderr)
	if err := fs.Parse(args); err != nil {
		if err == flag.ErrHelp {
			fs.SetOutput(os.Stdout)
			fs.Usage()
			return 0
		}
		return 2
	}
	setLoggerJSON(*logJSON)
	rest := fs.Args()
	if len(rest) == 0 || rest[0] == "-h" || rest[0] == "--help" || rest[0] == "help" {
		fs.SetOutput(os.Stdout)
		fs.Usage()
		return 0
	}

	switch rest[0] {
	case "fetch":
		return runFetch(rest[1:])
	case "update":
		return runUpdate(rest[1:])
	case "create":
		return runCreate(rest[1:])
	default:
		errLogger.Error("unknown command", "command", rest[0])
		fs.SetOutput(os.Stdout)
		fs.Usage()
		return 2
	}
}

func setFlagUsage(fs *flag.FlagSet, usageLine string) {
	fs.Usage = func() {
		fmt.Fprintln(fs.Output(), "Usage:")
		fmt.Fprintln(fs.Output(), "  "+usageLine)
		fmt.Fprintln(fs.Output(), "")
		fs.PrintDefaults()
	}
}

func rootFlagSet(out *os.File) (*flag.FlagSet, *bool) {
	fs := flag.NewFlagSet("bitable-task", flag.ContinueOnError)
	fs.SetOutput(out)
	logJSON := fs.Bool("log-json", false, "Output logs in JSON")
	fs.Usage = func() {
		fmt.Fprintln(fs.Output(), "Usage:")
		fmt.Fprintln(fs.Output(), "  bitable-task [--log-json] <command> [flags]")
		fmt.Fprintln(fs.Output(), "")
		fmt.Fprintln(fs.Output(), "Commands:")
		fmt.Fprintln(fs.Output(), "  fetch   Fetch tasks from Bitable")
		fmt.Fprintln(fs.Output(), "  update  Update tasks in Bitable")
		fmt.Fprintln(fs.Output(), "  create  Create tasks in Bitable")
		fmt.Fprintln(fs.Output(), "")
		fmt.Fprintln(fs.Output(), "Global Flags:")
		fs.PrintDefaults()
		fmt.Fprintln(fs.Output(), "")
		fmt.Fprintln(fs.Output(), "Environment:")
		fmt.Fprintln(fs.Output(), "  FEISHU_APP_ID, FEISHU_APP_SECRET, TASK_BITABLE_URL (required)")
		fmt.Fprintln(fs.Output(), "  FEISHU_BASE_URL (optional, default: https://open.feishu.cn)")
		fmt.Fprintln(fs.Output(), "  TASK_FIELD_* overrides (optional)")
	}
	return fs, logJSON
}

func runFetch(args []string) int {
	opts := FetchOptions{
		TaskURL:    os.Getenv("TASK_BITABLE_URL"),
		Status:     "pending",
		Date:       "Today",
		PageSize:   200,
		IgnoreView: true,
	}
	var useView bool
	fs := flag.NewFlagSet("fetch", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	setFlagUsage(fs, "bitable-task fetch [flags]")
	fs.StringVar(&opts.TaskURL, "task-url", opts.TaskURL, "Bitable task table URL")
	fs.StringVar(&opts.App, "app", "", "App value for filter (required)")
	fs.StringVar(&opts.Scene, "scene", "", "Scene value for filter (required)")
	fs.StringVar(&opts.Status, "status", opts.Status, "Task status filter (default: pending)")
	fs.StringVar(&opts.Date, "date", opts.Date, "Date preset: Today/Yesterday/Any")
	fs.IntVar(&opts.Limit, "limit", 0, "Max tasks to return (0 = no cap)")
	fs.IntVar(&opts.PageSize, "page-size", opts.PageSize, "Page size (max 500)")
	fs.IntVar(&opts.MaxPages, "max-pages", 0, "Max pages to fetch (0 = no cap)")
	fs.BoolVar(&opts.IgnoreView, "ignore-view", true, "Ignore view_id when searching (default: true)")
	fs.BoolVar(&useView, "use-view", false, "Use view_id from URL")
	fs.StringVar(&opts.ViewID, "view-id", "", "Override view_id when searching")
	fs.BoolVar(&opts.JSONL, "jsonl", false, "Output JSONL (one task per line)")
	fs.BoolVar(&opts.Raw, "raw", false, "Include raw fields in output")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if useView {
		opts.IgnoreView = false
	}
	opts.App = strings.TrimSpace(opts.App)
	opts.Scene = strings.TrimSpace(opts.Scene)
	if opts.App == "" || opts.Scene == "" {
		errLogger.Error("--app and --scene are required")
		return 2
	}
	return FetchTasks(opts)
}

func runUpdate(args []string) int {
	opts := UpdateOptions{
		TaskURL:    os.Getenv("TASK_BITABLE_URL"),
		IgnoreView: true,
	}
	var useView bool
	fs := flag.NewFlagSet("update", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	setFlagUsage(fs, "bitable-task update [flags]")
	fs.StringVar(&opts.TaskURL, "task-url", opts.TaskURL, "Bitable task table URL")
	fs.StringVar(&opts.InputPath, "input", "", "Input JSON or JSONL file (use - for stdin)")
	fs.IntVar(&opts.TaskID, "task-id", 0, "Single task id to update")
	fs.StringVar(&opts.BizTaskID, "biz-task-id", "", "Single biz task id to update")
	fs.StringVar(&opts.RecordID, "record-id", "", "Single record id to update")
	fs.StringVar(&opts.Status, "status", "", "Status to set")
	fs.StringVar(&opts.Date, "date", "", "Date to set (string or epoch/ISO)")
	fs.StringVar(&opts.DeviceSerial, "device-serial", "", "Dispatched device serial")
	fs.StringVar(&opts.DispatchedAt, "dispatched-at", "", "Dispatch time (ms/seconds/ISO/now)")
	fs.StringVar(&opts.StartAt, "start-at", "", "Start time (ms/seconds/ISO)")
	fs.StringVar(&opts.CompletedAt, "completed-at", "", "Completion time (ms/seconds/ISO)")
	fs.StringVar(&opts.EndAt, "end-at", "", "End time (ms/seconds/ISO)")
	fs.StringVar(&opts.ElapsedSeconds, "elapsed-seconds", "", "Elapsed seconds (int)")
	fs.StringVar(&opts.ItemsCollected, "items-collected", "", "Items collected (int)")
	fs.StringVar(&opts.Logs, "logs", "", "Logs path or identifier")
	fs.StringVar(&opts.RetryCount, "retry-count", "", "Retry count (int)")
	fs.StringVar(&opts.Extra, "extra", "", "Extra JSON string")
	fs.StringVar(&opts.SkipStatus, "skip-status", "", "Skip updates when current status matches (comma-separated)")
	fs.BoolVar(&opts.IgnoreView, "ignore-view", true, "Ignore view_id when searching (default: true)")
	fs.BoolVar(&useView, "use-view", false, "Use view_id from URL")
	fs.StringVar(&opts.ViewID, "view-id", "", "Override view_id when searching")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	if useView {
		opts.IgnoreView = false
	}
	return UpdateTasks(opts)
}

func runCreate(args []string) int {
	opts := CreateOptions{
		TaskURL: os.Getenv("TASK_BITABLE_URL"),
	}
	fs := flag.NewFlagSet("create", flag.ContinueOnError)
	fs.SetOutput(os.Stderr)
	setFlagUsage(fs, "bitable-task create [flags]")
	fs.StringVar(&opts.TaskURL, "task-url", opts.TaskURL, "Bitable task table URL")
	fs.StringVar(&opts.InputPath, "input", "", "Input JSON or JSONL file (use - for stdin)")
	fs.StringVar(&opts.BizTaskID, "biz-task-id", "", "Biz task id to create")
	fs.StringVar(&opts.ParentTaskID, "parent-task-id", "", "Parent task id")
	fs.StringVar(&opts.App, "app", "", "App value")
	fs.StringVar(&opts.Scene, "scene", "", "Scene value")
	fs.StringVar(&opts.Params, "params", "", "Task params")
	fs.StringVar(&opts.ItemID, "item-id", "", "Item id")
	fs.StringVar(&opts.BookID, "book-id", "", "Book id")
	fs.StringVar(&opts.URL, "url", "", "URL")
	fs.StringVar(&opts.UserID, "user-id", "", "User id")
	fs.StringVar(&opts.UserName, "user-name", "", "User name")
	fs.StringVar(&opts.Date, "date", "", "Date value (string or epoch/ISO)")
	fs.StringVar(&opts.Status, "status", "", "Status")
	fs.StringVar(&opts.DeviceSerial, "device-serial", "", "Dispatched device serial")
	fs.StringVar(&opts.DispatchedDevice, "dispatched-device", "", "Dispatched device (override device-serial)")
	fs.StringVar(&opts.DispatchedAt, "dispatched-at", "", "Dispatch time (ms/seconds/ISO/now)")
	fs.StringVar(&opts.StartAt, "start-at", "", "Start time (ms/seconds/ISO)")
	fs.StringVar(&opts.CompletedAt, "completed-at", "", "Completion time (ms/seconds/ISO)")
	fs.StringVar(&opts.EndAt, "end-at", "", "End time (ms/seconds/ISO)")
	fs.StringVar(&opts.ElapsedSeconds, "elapsed-seconds", "", "Elapsed seconds (int)")
	fs.StringVar(&opts.ItemsCollected, "items-collected", "", "Items collected (int)")
	fs.StringVar(&opts.Logs, "logs", "", "Logs path or identifier")
	fs.StringVar(&opts.RetryCount, "retry-count", "", "Retry count (int)")
	fs.StringVar(&opts.LastScreenshot, "last-screenshot", "", "Last screenshot reference")
	fs.StringVar(&opts.GroupID, "group-id", "", "Group id")
	fs.StringVar(&opts.Extra, "extra", "", "Extra JSON string")
	fs.StringVar(&opts.SkipExisting, "skip-existing", "", "Skip create when existing records match these fields (comma-separated, all must match)")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	return CreateTasks(opts)
}
