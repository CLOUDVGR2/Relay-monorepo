FROM golang:1.27-alpine AS builder

WORKDIR /src

COPY go.mod ./
COPY *.go ./

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/gateway .

FROM alpine:3.24

RUN addgroup -S -g 10001 gateway \
    && adduser -S -D -H -u 10001 -G gateway gateway \
    && apk add --no-cache ca-certificates

WORKDIR /app

COPY --from=builder --chown=10001:10001 /out/gateway /app/gateway

USER 10001:10001

EXPOSE 8090

ENTRYPOINT ["/app/gateway"]
