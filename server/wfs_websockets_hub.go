package main

import (
	"github.com/satori/go.uuid"
)

type Hub struct {
	clients     map[*Connection]bool
	broadcast   chan []byte
	register    chan *Connection
	unregister  chan *Connection
	clientsName map[*Connection]string
}

func newHub() *Hub {
	return &Hub{
		broadcast:   make(chan []byte),
		register:    make(chan *Connection),
		unregister:  make(chan *Connection),
		clients:     make(map[*Connection]bool),
		clientsName: make(map[*Connection]string),
	}
}

func (h *Hub) setHubConnName(conn *Connection) string {
	u1, _ := uuid.NewV4()
	h.clientsName[conn] = u1.String()
	return u1.String()
}

func (h *Hub) getHubNameConn(Name string) *Connection {
	for k, v := range h.clientsName {
		if v == Name {
			return k
		}
	}
	return nil
}

func (h *Hub) stopAllHubConn() {
	for client := range h.clients {
		h.unregister <- client
	}
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = true

		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				delete(h.clientsName, client)
				close(client.send)
			}
		case message := <-h.broadcast:
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clientsName, client)
					delete(h.clients, client)
				}
			}
		}
	}
}
