FROM golang:1.27.3-alpine AS build

WORKDIR /src

COPY go.mod ./
COPY *.go ./

RUN go test ./...
RUN mkdir -p /out \
    && CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /out/api-gateway .

FROM alpine:3.22 AS runtime

RUN apk add --no-cache ca-certificates \
    && addgroup -S -g 10001 app \
    && adduser -S -D -H -u 10001 -G app app

COPY --from=build --chown=10001:10001 \
    /out/api-gateway /usr/local/bin/api-gateway

USER 10001:10001

ENTRYPOINT ["/usr/local/bin/api-gateway"]
