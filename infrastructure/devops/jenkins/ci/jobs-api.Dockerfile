FROM golang:1.27.1-alpine
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go test ./...
CMD ["sh", "-c", "echo 'Go API CI checks passed'"]
