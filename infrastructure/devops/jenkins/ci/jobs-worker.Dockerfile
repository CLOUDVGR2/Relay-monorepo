FROM golang:1.27.4-alpine
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go test ./...
RUN addgroup -S app && adduser -S -G app app && chown -R app:app /app
USER app

CMD ["sh", "-c", "echo 'Go worker CI checks passed'"]
