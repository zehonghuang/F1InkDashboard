FROM golang:1.23-alpine AS builder

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/server ./cmd/server

FROM alpine:3.20

RUN apk --no-cache add ca-certificates tzdata
ENV TZ=UTC

WORKDIR /app
COPY --from=builder /out/server /app/server

EXPOSE 8009
CMD ["/app/server"]
