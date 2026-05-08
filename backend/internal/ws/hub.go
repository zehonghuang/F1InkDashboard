package ws

import (
	"sync"

	"github.com/gorilla/websocket"
)

type Hub struct {
	mu    sync.Mutex
	conns map[*websocket.Conn]struct{}
}

func NewHub() *Hub {
	return &Hub{conns: map[*websocket.Conn]struct{}{}}
}

func (h *Hub) Add(c *websocket.Conn) {
	h.mu.Lock()
	h.conns[c] = struct{}{}
	h.mu.Unlock()
}

func (h *Hub) Remove(c *websocket.Conn) {
	h.mu.Lock()
	delete(h.conns, c)
	h.mu.Unlock()
}

func (h *Hub) Count() int {
	h.mu.Lock()
	n := len(h.conns)
	h.mu.Unlock()
	return n
}

func (h *Hub) BroadcastText(msg string) int {
	h.mu.Lock()
	conns := make([]*websocket.Conn, 0, len(h.conns))
	for c := range h.conns {
		conns = append(conns, c)
	}
	h.mu.Unlock()

	sent := 0
	for _, c := range conns {
		if err := c.WriteMessage(websocket.TextMessage, []byte(msg)); err == nil {
			sent++
		}
	}
	return sent
}

func (h *Hub) BroadcastJSON(v any) int {
	h.mu.Lock()
	conns := make([]*websocket.Conn, 0, len(h.conns))
	for c := range h.conns {
		conns = append(conns, c)
	}
	h.mu.Unlock()

	sent := 0
	for _, c := range conns {
		if err := c.WriteJSON(v); err == nil {
			sent++
		}
	}
	return sent
}
