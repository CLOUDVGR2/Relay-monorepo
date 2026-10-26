FROM golang:1.27.3-alpine

WORKDIR /src

COPY go.mod ./
COPY *.go ./

RUN go test ./...
RUN mkdir -p /out \
    && CGO_ENABLED=0 go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /out/api-gateway .
