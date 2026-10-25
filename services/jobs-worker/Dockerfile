FROM golang:1.27.3-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN mkdir -p /out && CGO_ENABLED=0 GOOS=linux \
    go build -trimpath -ldflags="-s -w" \
    -o /out/go-worker .

FROM alpine:3.22

RUN apk add --no-cache ca-certificates \
    && addgroup -S -g 10001 app \
    && adduser -S -D -H -u 10001 -G app app

COPY --from=builder --chown=app:app \
    /out/go-worker /usr/local/bin/go-worker

USER 10001:10001

ENTRYPOINT ["/usr/local/bin/go-worker"]
