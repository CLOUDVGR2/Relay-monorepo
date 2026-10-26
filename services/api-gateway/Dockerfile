FROM golang:1.27.3-alpine AS build

WORKDIR /src

COPY go.mod ./
COPY *.go ./

RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /out/api-gateway .

FROM alpine:3.22 AS runtime

RUN apk add --no-cache ca-certificates \
 && addgroup -S -g 10001 app \
 && adduser -S -D -H -u 10001 -G app app

WORKDIR /app

COPY --from=build --chown=10001:10001 \
    /out/api-gateway /app/api-gateway

USER 10001:10001

EXPOSE 8090

ENTRYPOINT ["/app/api-gateway"]
