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
  // Map of Session ID -> PeerID.
  peerIds map[string]string
  // NOTE: Locks are needed as the event handlers have shared resources.
  roomUsersMtx *sync.Mutex
  peerIdsMtx *sync.Mutex
}

const (
  // Incoming socket.io events to handle.
  joinMediaRoom = "JoinMediaRoom"
  relayICECandidate = "RelayICECandidate"
  relaySDP = "RelaySDP"
  leaveMediaRoom = "LeaveMediaRoom"
  updateSessionId = "UpdateSessionId"

  // Outgoing socket.io events for the RFE to handle.
  addPeer = "AddPeer"
  incomingICECandidate = "IncomingICECandidate"
  incomingSDP = "IncomingSDP"
  removePeer = "RemovePeer"
)

func New() *RoomzSignalingServer {
  server := socketio.NewServer(nil)
  rms := &RoomzSignalingServer{
    Server: server,
    roomUsers: make(map[int64][]RoomUser),
    peerIds: make(map[string]string),
    roomUsersMtx: &sync.Mutex{},
    peerIdsMtx: &sync.Mutex{},
  }
  rms.registerRoutes()
  return rms
}

func (r *RoomzSignalingServer) registerRoutes() {
  r.Server.OnConnect("/", r.connectHandler)
  r.Server.OnDisconnect("/", r.disconnectHandler)
  r.Server.OnEvent("/", joinMediaRoom, r.joinMediaRoomHandler)
  r.Server.OnEvent("/", relayICECandidate, r.relayICECandidateHandler)
  r.Server.OnEvent("/", relaySDP, r.relaySDPHandler)
  r.Server.OnEvent("/", leaveMediaRoom, r.leaveMediaRoomHandler)
  r.Server.OnEvent("/", updateSessionId, r.updateSessionIdHandler)
}

func (r *RoomzSignalingServer) connectHandler(s socketio.Conn) error {
  s.SetContext("")
  log.Printf("New user (ID=%v) connected...", s.ID())
  return nil
}

func (r *RoomzSignalingServer) disconnectHandler(s socketio.Conn, msg string) {
  log.Printf("Session ID: %s has disconnected...", s.ID())
  // If this session ID matches a user in a media room, remove them from room.
  if peerId, ok := r.peerIds[s.ID()]; ok {
    roomIdStr := strings.Split(peerId, "-")[0]
    roomId, _ := strconv.ParseInt(roomIdStr, 10, 64)
    r.leaveMediaRoom(s, "Disconnect", peerId, roomId)
  }
}

func (r *RoomzSignalingServer) joinMediaRoomHandler(s socketio.Conn, data map[string]interface{}) {
  prefix := fmt.Sprintf("[%s]:", joinMediaRoom)
  log.Printf("%s data: %v\n", prefix, data)
  roomIdF64, ok := data["room_id"].(float64)
  if !ok {
    log.Printf("%s room_id is not a valid float64.", prefix)
    return
  }
  roomId := int64(roomIdF64)
  userIdF64, ok := data["user_id"].(float64);
  if !ok {
    log.Printf("%s user_id is not a valid float64.", prefix)
    return
  }
  userId := int64(userIdF64)
  peerId := fmt.Sprintf("%v-%v", roomId, userId)
  r.roomUsersMtx.Lock()
  for _, roomUser := range r.roomUsers[roomId] {
    if roomUser.peerId == peerId {
      // User is rejoining the media room, update its session id.
      roomUser.sId = s.ID()
      log.Printf("%s %s has re-joined the media room, updated session ID to %s", prefix, peerId, s.ID())
    } else {
      // Existing roomies get an addPeer notification where they do not have to
      // make an offer.
      log.Printf("%s Emitting \"%s\" for peerId=%s to peerId=%s", prefix, addPeer, peerId, roomUser.peerId)
      r.Server.BroadcastToRoom("/", roomUser.sId, addPeer, map[string]interface{}{
        "peer_id":    peerId,
        "is_offerer": false,
      })
      // The new roomie gets an addPeer notification but they must create an
      // offer with the existing roomie.
      log.Printf("%s Emitting \"%s\" for peerId=%s to peerId=%s", prefix, addPeer, roomUser.peerId, peerId)
      s.Emit(addPeer, map[string]interface{}{
        "peer_id":    roomUser.peerId,
        "is_offerer": true,
      }, s.ID())
    }
  }
  r.roomUsers[roomId] = append(r.roomUsers[roomId], RoomUser{
    sId:    s.ID(),
    peerId: peerId,
  })
  r.roomUsersMtx.Unlock()
  r.peerIdsMtx.Lock()
  r.peerIds[s.ID()] = peerId
  r.peerIdsMtx.Unlock()
  log.Printf("%s userId=%d has joined roomId=%d", prefix, userId, roomId)
}

func (r *RoomzSignalingServer) relayICECandidateHandler(s socketio.Conn, data map[string]interface{}) {
  prefix := fmt.Sprintf("[%s]:", relayICECandidate)
  log.Printf("%s received request", prefix)
  toPeerId, ok := data["to_peer_id"].(string)
  if !ok || len(toPeerId) == 0 {
    log.Printf("%s invalid to_peer_id.", prefix)
    return
  }
  fromPeerId, ok := data["from_peer_id"].(string)
  if !ok || len(fromPeerId) == 0 {
    log.Printf("%s invalid from_peer_id.", prefix)
    return
  }
  log.Printf("%s relaying ICE candidate from peerId=%s to peerId=%s", prefix, fromPeerId, toPeerId)
  roomIdStr := strings.Split(toPeerId, "-")[0]
  roomId, _ := strconv.ParseInt(roomIdStr, 10, 64)
  r.roomUsersMtx.Lock()
  for _, roomUser := range r.roomUsers[roomId] {
    if roomUser.peerId == toPeerId {
      r.Server.BroadcastToRoom("/", roomUser.sId, incomingICECandidate, map[string]interface{}{
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
  prefix := fmt.Sprintf("[%s]:", relaySDP)
  log.Printf("%s received request", prefix)
  toPeerId, ok := data["to_peer_id"].(string)
  if !ok || len(toPeerId) == 0 {
    log.Printf("%s invalid to_peer_id.", prefix)
    return
  }
  fromPeerId, ok := data["from_peer_id"].(string)
  if !ok || len(fromPeerId) == 0 {
    log.Printf("%s invalid from_peer_id.", prefix)
    return
  }
  roomIdStr := strings.Split(toPeerId, "-")[0]
  roomId, _ := strconv.ParseInt(roomIdStr, 10, 64)
  r.roomUsersMtx.Lock()
  for _, roomUser := range r.roomUsers[roomId] {
    if roomUser.peerId == toPeerId {
      log.Printf("%s Emitting \"%s\" from peerId=%s to peerId=%s", prefix, incomingSDP, fromPeerId, toPeerId)
      r.Server.BroadcastToRoom("/", roomUser.sId, incomingSDP, map[string]interface{}{
        "peer_id": fromPeerId,
        "sdp":     data["sdp"],
      })
    }
  }
  r.roomUsersMtx.Unlock()
}

func (r *RoomzSignalingServer) leaveMediaRoomHandler(s socketio.Conn, data map[string]interface{}) {
  prefix := fmt.Sprintf("[%s]:", leaveMediaRoom)
  log.Printf("%s data: %v\n", prefix, data)
  peerId, ok := data["peer_id"].(string)
  if !ok || len(peerId) == 0 {
    log.Printf("%s invalid peer_id.", prefix)
    return
  }
  roomIdStr := strings.Split(peerId, "-")[0]
  roomId, _ := strconv.ParseInt(roomIdStr, 10, 64)
  r.leaveMediaRoom(s, prefix, peerId, roomId)
}

func (r *RoomzSignalingServer) leaveMediaRoom(s socketio.Conn, prefix, peerId string, roomId int64) {
  delIdx := -1
  r.roomUsersMtx.Lock()
  for i, roomUser := range r.roomUsers[roomId] {
    if peerId == roomUser.peerId {
      delIdx = i
    } else {
      log.Printf("%s Emitting \"%s\" for peerId=%s to peerId=%s", prefix, removePeer, peerId, roomUser.peerId)
      r.Server.BroadcastToRoom("/", roomUser.sId, removePeer, map[string]interface{}{
        "peer_id": peerId,
      })
      log.Printf("%s Emitting \"%s\" for peerId=%s to peerId=%s", prefix, removePeer, roomUser.peerId, peerId)
      s.Emit(removePeer, map[string]interface{}{
        "peer_id": roomUser.peerId,
      }, s.ID())
    }
  }
  if delIdx >= 0 {
    log.Printf("%s Removed peerId=%s from roomId=%d", prefix, peerId, roomId)
    r.roomUsers[roomId] = append(r.roomUsers[roomId][:delIdx], r.roomUsers[roomId][delIdx+1:]...)
  }
  r.roomUsersMtx.Unlock()
}

// TODO: does the user need to rejoin the room?
func (r *RoomzSignalingServer) updateSessionIdHandler(s socketio.Conn, data map[string]interface{}) {
  prefix := fmt.Sprintf("[%s]:", updateSessionId)
  log.Printf("%s data: %v\n", prefix, data)
  peerId, ok := data["peer_id"].(string)
  if !ok || len(peerId) == 0 {
    log.Printf("%s invalid peer_id.", prefix)
    return
  }
  roomIdStr := strings.Split(peerId, "-")[0]
  roomId, _ := strconv.ParseInt(roomIdStr, 10, 64)
  log.Printf("hello: %s %s", peerId, r.roomUsers[roomId])
  // Retrieve old sessionId, update mapping of sessionId to peerId.
  r.roomUsersMtx.Lock()
  for _, roomUser := range r.roomUsers[roomId] {
    log.Printf("searching through roomUser %s", roomUser.peerId)
    if peerId == roomUser.peerId {
      oldSessionId := roomUser.sId
      roomUser.sId = s.ID()
      r.peerIdsMtx.Lock()
      delete(r.peerIds, oldSessionId)
      r.peerIds[s.ID()] = peerId
      r.peerIdsMtx.Unlock()
      log.Printf("%s Update peerId=%s's session ID to=%s", prefix, peerId, roomUser.sId)
      break
    }
  }
  r.roomUsersMtx.Unlock()
}