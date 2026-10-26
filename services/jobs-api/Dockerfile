FROM golang:1.27.3-alpine AS build

WORKDIR /src
RUN apk add --no-cache ca-certificates

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /out/jobs-api .

FROM alpine:3.22 AS runtime

RUN apk add --no-cache ca-certificates \
 && addgroup -S -g 10001 app \
 && adduser -S -D -H -u 10001 -G app app

COPY --from=build --chown=10001:10001 /out/jobs-api /usr/local/bin/jobs-api

USER 10001:10001

EXPOSE 8081

ENTRYPOINT ["/usr/local/bin/jobs-api"]
