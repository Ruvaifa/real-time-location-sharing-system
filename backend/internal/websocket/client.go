package websocket

import (
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"golang.org/x/time/rate"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = (pongWait * 9) / 10
	maxMsgSize = 4096
)

// Client is a middleman between a single WebSocket connection and the Hub.
type Client struct {
	Hub     *Hub
	Conn    *websocket.Conn
	Send    chan []byte
	GroupID string
	UserID  string

	closeOnce sync.Once // prevents double-close panic on Send channel
}

// CloseSend idempotently closes the Send channel.
func (c *Client) CloseSend() {
	c.closeOnce.Do(func() {
		close(c.Send)
	})
}

// ReadPump reads messages from the WebSocket and forwards them to the Hub.
// It runs in its own goroutine per client.
func (c *Client) ReadPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()

	limiter := rate.NewLimiter(rate.Limit(c.Hub.MaxMsgRate), c.Hub.MaxMsgRate*2)

	c.Conn.SetReadLimit(maxMsgSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, payload, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway) {
				log.Printf("ws read error (user=%s group=%s): %v", c.UserID, c.GroupID, err)
			}
			break
		}

		if !limiter.Allow() {
			log.Printf("rate limited (user=%s group=%s)", c.UserID, c.GroupID)
			continue
		}

		c.Hub.Broadcast <- HubMessage{Sender: c, Payload: payload}
	}
}

// WritePump drains the Send channel and writes messages to the WebSocket.
// It runs in its own goroutine per client.
func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub closed the channel.
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
