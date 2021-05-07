package server

import (
  "fmt"
  "log"
  "strconv"
  "strings"

  socketio "github.com/googollee/go-socket.io"
)

type RoomUser struct {
  sId    string
  peerId string
}

type RoomzSignalingServer struct {
  // Socket.io server.
  Server    *socketio.Server
  // Map of Room ID -> Slice of RoomUsers.
  roomUsers map[int64][]RoomUser
  // TODO: add mutex lock on shared resource.
}

func New() *RoomzSignalingServer {
  server := socketio.NewServer(nil)
  rms := &RoomzSignalingServer{
    Server: server,
    roomUsers: make(map[int64][]RoomUser),
  }
  rms.routes()
  return rms
}

func (r *RoomzSignalingServer) routes() {
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
    log.Printf("invalid room id")
    return
  }
  roomId, err := strconv.ParseInt(roomIdStr, 10, 64)
  if err != nil {
    log.Printf("room id is not an int")
    return
  }
  userIdStr, ok := data["user_id"].(string);
  if !ok || len(userIdStr) == 0 {
    log.Printf("invalid user id")
    return
  }
  userId, err := strconv.ParseInt(userIdStr, 10, 64)
  if err != nil {
    log.Printf("user id is not an int")
    return
  }
  // TODO: add check if person already exists in room.
  peerId := fmt.Sprintf("%v-%v", roomId, userId)
  for _, roomUser := range r.roomUsers[roomId] {
    // Existing roomies get an addPeer notification where they do not have to
    // make an offer.
    r.Server.BroadcastToRoom("/", roomUser.sId, "addPeer", map[string]interface{}{
      "peer_id":    peerId,
      "is_offerer": false,
    })
    // The new roomie gets an addPeer notification but they must create an
    // offer with the existing roomie.
    s.Emit("addPeer", map[string]interface{}{
      "peer_id":    roomUser.peerId,
      "is_offerer": true,
    }, s.ID())
  }
  r.roomUsers[roomId] = append(r.roomUsers[roomId], RoomUser{
    sId:    s.ID(),
    peerId: peerId,
  })
  // Join user to socketio room
  r.Server.JoinRoom("/", roomIdStr, s)
}

func (r *RoomzSignalingServer) relayICECandidateHandler(s socketio.Conn, data map[string]interface{}) {
  log.Printf("[relayICE] received request")
  toPeerId, ok := data["to_peer_id"].(string)
  if !ok || len(toPeerId) == 0 {
    log.Printf("invalid to peer id")
    return
  }
  fromPeerId, ok := data["from_peer_id"].(string)
  if !ok || len(fromPeerId) == 0 {
    log.Printf("invalid from peer id")
    return
  }
  log.Printf("[relayICE] %v relaying ICE candidate to %v", fromPeerId, toPeerId)
  roomIdStr := strings.Split(toPeerId, "-")[0]
  roomId, _ := strconv.ParseInt(roomIdStr, 10, 64)
  for _, roomUser := range r.roomUsers[roomId] {
    if roomUser.peerId == toPeerId {
      r.Server.BroadcastToRoom("/", roomUser.sId, "incomingICECandidate", map[string]interface{}{
        "peer_id":       fromPeerId,
        "ice_candidate": data["ice_candidate"],
      })
    }
  }
}

func (r *RoomzSignalingServer) relaySDPHandler(s socketio.Conn, data map[string]interface{}) {
  log.Printf("[relaySDP] received request")
  toPeerId, ok := data["to_peer_id"].(string)
  if !ok || len(toPeerId) == 0 {
    log.Printf("invalid to peer id")
    return
  }
  fromPeerId, ok := data["from_peer_id"].(string)
  if !ok || len(fromPeerId) == 0 {
    log.Printf("invalid from peer id")
    return
  }
  log.Printf("[relaySDP] %v relaying SDP to %v", fromPeerId, toPeerId)
  roomIdStr := strings.Split(toPeerId, "-")[0]
  roomId, _ := strconv.ParseInt(roomIdStr, 10, 64)
  for _, roomUser := range r.roomUsers[roomId] {
    if roomUser.peerId == toPeerId {
      r.Server.BroadcastToRoom("/", roomUser.sId, "incomingSDP", map[string]interface{}{
        "peer_id": fromPeerId,
        "sdp":     data["sdp"],
      })
    }
  }
}