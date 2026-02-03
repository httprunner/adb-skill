package main

import (
	"os"

	"feishu-bitable-task-manager-go/internal/cli"
)

func main() {
	os.Exit(cli.Run(os.Args[1:]))
}
