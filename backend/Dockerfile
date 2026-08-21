FROM golang:1.23-alpine AS build

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/backend ./cmd/server

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata python3 py3-pip && \
    ln -sf /usr/bin/python3 /usr/local/bin/python

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --break-system-packages --no-cache-dir -r /app/requirements.txt

COPY --from=build /out/backend /app/backend
COPY --from=build /src/static /app/static
COPY --from=build /src/scripts /app/scripts

EXPOSE 8008

CMD ["./backend"]
