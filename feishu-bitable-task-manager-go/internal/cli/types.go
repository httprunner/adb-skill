package cli

type Task struct {
	TaskID           int    `json:"task_id"`
	BizTaskID        string `json:"biz_task_id"`
	ParentTaskID     string `json:"parent_task_id"`
	App              string `json:"app"`
	Scene            string `json:"scene"`
	Params           string `json:"params"`
	ItemID           string `json:"item_id"`
	BookID           string `json:"book_id"`
	URL              string `json:"url"`
	UserID           string `json:"user_id"`
	UserName         string `json:"user_name"`
	Date             string `json:"date"`
	Status           string `json:"status"`
	Extra            string `json:"extra"`
	Logs             string `json:"logs"`
	LastScreenshot   string `json:"last_screenshot"`
	GroupID          string `json:"group_id"`
	DeviceSerial     string `json:"device_serial"`
	DispatchedDevice string `json:"dispatched_device"`
	DispatchedAt     string `json:"dispatched_at"`
	StartAt          string `json:"start_at"`
	EndAt            string `json:"end_at"`
	ElapsedSeconds   string `json:"elapsed_seconds"`
	ItemsCollected   string `json:"items_collected"`
	RetryCount       string `json:"retry_count"`
	RecordID         string `json:"record_id"`
	RawFields        any    `json:"raw_fields,omitempty"`
}
