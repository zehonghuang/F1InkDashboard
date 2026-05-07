package cache

import (
	"sync"
	"time"
)

type entry struct {
	expiresAt time.Time
	v         any
}

type TTLCache struct {
	mu sync.Mutex
	m  map[string]entry
}

func New() *TTLCache {
	return &TTLCache{m: map[string]entry{}}
}

func (c *TTLCache) Get(key string) (any, bool) {
	now := time.Now()
	c.mu.Lock()
	e, ok := c.m[key]
	if !ok {
		c.mu.Unlock()
		return nil, false
	}
	if !e.expiresAt.IsZero() && now.After(e.expiresAt) {
		delete(c.m, key)
		c.mu.Unlock()
		return nil, false
	}
	c.mu.Unlock()
	return e.v, true
}

func (c *TTLCache) Set(key string, v any, ttl time.Duration) {
	var exp time.Time
	if ttl > 0 {
		exp = time.Now().Add(ttl)
	}
	c.mu.Lock()
	c.m[key] = entry{expiresAt: exp, v: v}
	c.mu.Unlock()
}

func (c *TTLCache) GetOrSet(key string, ttl time.Duration, fn func() (any, error)) (any, error) {
	if v, ok := c.Get(key); ok {
		return v, nil
	}
	v, err := fn()
	if err != nil {
		return nil, err
	}
	c.Set(key, v, ttl)
	return v, nil
}
