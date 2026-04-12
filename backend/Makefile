.PHONY: build dev test lint fmt clean

build:
	CGO_ENABLED=0 go build -o server ./cmd/server

dev:
	go run ./cmd/server

test:
	go test ./...

lint:
	golangci-lint run ./...

fmt:
	gofmt -w .

clean:
	rm -f server
