package server

import (
  "fmt"
  "log"
  "strconv"
  "strings"
  "sync"

  socketio "github.com/googollee/go-socket.io"
)

type RoomUser struct {
  sId    string
  peerId string
}

type RoomzSignalingServer struct {
  // Socket.io server responsible for handling events.
  Server    *socketio.Server
  // Map of Room ID -> Slice of RoomUsers.
  roomUsers map[int64][]RoomUser
  // NOTE: Locks are needed as the event handlers have shared resources.
  roomUsersMtx *sync.Mutex
}

func New() *RoomzSignalingServer {
  server := socketio.NewServer(nil)
  rms := &RoomzSignalingServer{
    Server: server,
    roomUsers: make(map[int64][]RoomUser),
    roomUsersMtx: &sync.Mutex{},
  }
  rms.registerRoutes()
  return rms
}

func (r *RoomzSignalingServer) registerRoutes() {
  r.Server.OnConnect("/", r.connectHandler)
  r.Server.OnDisconnect("/", r.disconnectHandler)
  r.Server.OnEvent("/", "JoinMediaRoom", r.joinMediaRoomHandler)
  r.Server.OnEvent("/", "RelayICECandidate", r.relayICECandidateHandler)
  r.Server.OnEvent("/", "RelaySDP", r.relaySDPHandler)
}

func (r *RoomzSignalingServer) connectHandler(s socketio.Conn) error {
  s.SetContext("")
  log.Printf("New user (ID=%v) connected...", s.ID())
  return nil
}

func (r *RoomzSignalingServer) disconnectHandler(s socketio.Conn, msg string) {
  log.Println("User:", s.ID(), "disconnected...");
}

func (r *RoomzSignalingServer) joinMediaRoomHandler(s socketio.Conn, data map[string]interface{}) {
  log.Printf("[joinMediaRoom] data: %v\n", data)
  roomIdStr, ok := data["room_id"].(string);
  if !ok || len(roomIdStr) == 0 {
    log.Printf("invalid room id.")
    return
  }
  roomId, err := strconv.ParseInt(roomIdStr, 10, 64)
  if err != nil {
    log.Printf("room_id is not an int64.")
    return
  }
  userIdStr, ok := data["user_id"].(string);
  if !ok || len(userIdStr) == 0 {
    log.Printf("invalid user_id.")
    return
  }
  userId, err := strconv.ParseInt(userIdStr, 10, 64)
  if err != nil {
    log.Printf("user_id is not an int.")
    return
  }
  // TODO: add check if person already exists in room.
  peerId := fmt.Sprintf("%v-%v", roomId, userId)
  r.roomUsersMtx.Lock()
  for _, roomUser := range r.roomUsers[roomId] {
    // Existing roomies get an addPeer notification where they do not have to
    // make an offer.
    r.Server.BroadcastToRoom("/", roomUser.sId, "AddPeer", map[string]interface{}{
      "peer_id":    peerId,
      "is_offerer": false,
    })
    // The new roomie gets an addPeer notification but they must create an
    // offer with the existing roomie.
    s.Emit("AddPeer", map[string]interface{}{
      "peer_id":    roomUser.peerId,
      "is_offerer": true,
    }, s.ID())
  }
  r.roomUsers[roomId] = append(r.roomUsers[roomId], RoomUser{
    sId:    s.ID(),
    peerId: peerId,
  })
  r.roomUsersMtx.Unlock()
  // TODO: What mechanism in socket.io can help me emit data to everyone in a
  // socket.io room except the emitter? That would avoid the loops.
  r.Server.JoinRoom("/", roomIdStr, s)
}

func (r *RoomzSignalingServer) relayICECandidateHandler(s socketio.Conn, data map[string]interface{}) {
  log.Printf("[relayICE] received request, data=%v", data)
  toPeerId, ok := data["to_peer_id"].(string)
  if !ok || len(toPeerId) == 0 {
    log.Printf("invalid to peer id")
    return
  }
  fromPeerId, ok := data["from_peer_id"].(string)
  if !ok || len(fromPeerId) == 0 {
    log.Printf("invalid from_peer_id.")
    return
  }
  log.Printf("[relayICE] %v relaying ICE candidate to %v", fromPeerId, toPeerId)
  roomIdStr := strings.Split(toPeerId, "-")[0]
  roomId, _ := strconv.ParseInt(roomIdStr, 10, 64)
  r.roomUsersMtx.Lock()
  for _, roomUser := range r.roomUsers[roomId] {
    if roomUser.peerId == toPeerId {
      r.Server.BroadcastToRoom("/", roomUser.sId, "IncomingICECandidate", map[string]interface{}{
        "peer_id":       fromPeerId,
        "ice_candidate": data["ice_candidate"],
      })
    }
  }
  r.roomUsersMtx.Unlock()
}

func (r *RoomzSignalingServer) relaySDPHandler(s socketio.Conn, data map[string]interface{}) {
  // NOTE: I am not printing out the SDP data because it is too large and hogs
  // the console.
  log.Printf("[relaySDP] received request")
  toPeerId, ok := data["to_peer_id"].(string)
  if !ok || len(toPeerId) == 0 {
    log.Printf("invalid to_peer_id.")
    return
  }
  fromPeerId, ok := data["from_peer_id"].(string)
  if !ok || len(fromPeerId) == 0 {
    log.Printf("invalid from_peer_id.")
    return
  }
  log.Printf("[relaySDP] %v relaying SDP to %v", fromPeerId, toPeerId)
  roomIdStr := strings.Split(toPeerId, "-")[0]
  roomId, _ := strconv.ParseInt(roomIdStr, 10, 64)
  r.roomUsersMtx.Lock()
  for _, roomUser := range r.roomUsers[roomId] {
    if roomUser.peerId == toPeerId {
      r.Server.BroadcastToRoom("/", roomUser.sId, "IncomingSDP", map[string]interface{}{
        "peer_id": fromPeerId,
        "sdp":     data["sdp"],
      })
    }
  }
  r.roomUsersMtx.Unlock()
}