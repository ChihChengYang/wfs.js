/**
 * wfs server, Jeff Yang 2016.10
 */
package main

import "C"

import (
	"bufio"
	"encoding/json"
	"fmt"
	"github.com/gorilla/websocket"
	"github.com/kardianos/osext"
	"log"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"time"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1500000,
	WriteBufferSize: 1500000,
}

type Connection struct {
	ws              *websocket.Conn
	send            chan []byte
	hub             *Hub
	run             bool
	key             string
	fileMP4DataName string
	file264DataName string
	file264SizeName string
}

var fo *os.File
var gConn *Connection
var gHub *Hub
var basePath string

func indexHandler(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, basePath+"/index.html")
}

func dist(w http.ResponseWriter, r *http.Request) {
	http.ServeFile(w, r, basePath+"/../"+r.URL.Path[1:])
}

func retrieveFileData(filename string, offset int, start int64) ([]byte, int, int64) {
	file, err := os.Open(filename)
	if err != nil {
		return nil, 0, 0
	}
	defer file.Close()
	stats, statsErr := file.Stat()
	if statsErr != nil {
		return nil, 0, 0
	}
	var totalSize int64 = stats.Size()
	bytes := make([]byte, offset)
	retSize, _ := file.ReadAt(bytes, start)
	return bytes, retSize, totalSize
}

func retrieveFileSize(filename string) int64 {
	file, err := os.Open(filename)
	if err != nil {
		return 0
	}
	defer file.Close()
	stats, statsErr := file.Stat()
	if statsErr != nil {
		return 0
	}
	return stats.Size()
}

func (conn *Connection) appReadCommand2() {
	//conn.ws.SetReadLimit(maxMessageSize)
	for {
		_, message, err := conn.ws.ReadMessage()
		if err != nil {
			break
		}
		u := map[string]interface{}{}
		json.Unmarshal(message, &u)
		if u["t"].(string) == "open" {
			fmt.Println("appReadCommand--> ", u["t"].(string), u["v"].(string), u["c"].(string))

			if u["c"].(string) == "ch1" {
				conn.file264DataName = basePath + "/yyyyyyy.264"
				conn.file264SizeName = basePath + "/yyyyyyy.txt"
			}

			if u["c"].(string) == "ch2" {
				conn.file264DataName = basePath + "/yyyyyyy.264"
				conn.file264SizeName = basePath + "/yyyyyyy.txt"
			}
			go conn.app264Streaming()
		}

	}
	conn.ws.Close()
}

func (conn *Connection) appMP4Streaming() {
	offs := 1000000 // 4144399
	totalSize := retrieveFileSize(conn.fileMP4DataName)
	var i, j int64
	i = 0
	j = totalSize
	tick := time.NewTicker(time.Millisecond * 30)
	flag := true
	for {
		select {
		case <-tick.C:

			if i < totalSize {
				b, _, _ := retrieveFileData(conn.fileMP4DataName, offs, i)
				//------------------------------------------
				smallArray := make([]byte, offs)
				copy(smallArray[:], b[0:offs])
				err := conn.ws.WriteMessage(websocket.BinaryMessage, smallArray)
				if err != nil {
					fmt.Printf("conn.WriteMessage ERROR!!!\n")
					flag = false
					break
				}
				smallArray = nil
				//-----------------------------------------
				i += int64(offs)
				j = totalSize - i
				if j < int64(offs) {
					offs = int(j)
				}
			}
		}
		if !flag {
			break
		}
		runtime.Gosched()
	}
}

func parseAVCNALu(array []byte) int {
	arrayLen := len(array)
	i := 0
	state := 0
	count := 0
	for i < arrayLen {
		value := array[i]
		i += 1
		// finding 3 or 4-byte start codes (00 00 01 OR 00 00 00 01)
		switch state {
		case 0:
			if value == 0 {
				state = 1
			}
		case 1:
			if value == 0 {
				state = 2
			} else {
				state = 0
			}
		case 2, 3:
			if value == 0 {
				state = 3
			} else if value == 1 && i < arrayLen {
				unitType := array[i] & 0x1f
				if unitType == 7 || unitType == 8 {
					count += 1
				}
				state = 0
			} else {
				state = 0
			}
		}
	}
	return count
}

func (conn *Connection) app264Streaming() {

	var fileStart int64
	fileStart = 0
	file, err := os.Open(conn.file264SizeName)
	if err != nil {
		log.Fatal(err)
	}
	defer file.Close()
	scanner := bufio.NewScanner(file)

	tick := time.NewTicker(time.Millisecond * 30)
	flag := true

	for {
		select {
		case <-tick.C:
			if scanner.Scan() {
				offs, _ := strconv.ParseInt(scanner.Text(), 10, 0)
				off := int(offs)
				b, _, _ := retrieveFileData(conn.file264DataName, off, fileStart)
				sendFlag := true
				//------------------------------------------
				smallArray := make([]byte, off)
				copy(smallArray[:], b[0:off])
				if off < 100 {
					count := parseAVCNALu(smallArray)
					if count > 2 { // 7 7 8 , 7 8 7
						sendFlag = false
					}
				}
				if sendFlag {
					err := conn.ws.WriteMessage(websocket.BinaryMessage, smallArray)
					if err != nil {
						fmt.Printf("conn.WriteMessage ERROR!!!\n")
						flag = false
						break
					}
				}
				smallArray = nil
				//-----------------------------------------
				fileStart += offs
			}
		}
		if !flag {
			break
		}

		runtime.Gosched()
	}
}

func play2(w http.ResponseWriter, r *http.Request) {

	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Print("upgrade:", err)
		return
	}
	defer ws.Close()

	c := &Connection{hub: gHub, send: make(chan []byte, 256), ws: ws, run: true}

	c.hub.register <- c

	c.key = c.hub.setHubConnName(c)

	go c.appReadCommand2()

	for c.run {
		runtime.Gosched()
	}

	fmt.Fprintf(w, "ok")
}

func main() {
	folderPath, err := osext.ExecutableFolder()
	if err != nil {
		log.Fatal(err)
	}
	basePath = folderPath

	runtime.GOMAXPROCS(runtime.NumCPU())

	gHub = newHub()
	go gHub.run()

	http.HandleFunc("/dist/", dist)
	http.HandleFunc("/", indexHandler)
	http.HandleFunc("/play2", play2)

	fmt.Printf("wfs server lite is running....\n")

	http.ListenAndServe("0.0.0.0:8888", nil)

}
