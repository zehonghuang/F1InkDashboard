FROM golang:1.23-alpine AS build

WORKDIR /src

COPY go.mod ./
RUN if [ -f go.sum ]; then cp go.sum ./go.sum; fi
RUN go mod download || true

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/ws-server ./cmd/server

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app

COPY --from=build /out/ws-server /app/ws-server

EXPOSE 8009

CMD ["./ws-server"]
