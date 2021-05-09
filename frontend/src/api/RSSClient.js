import io from 'socket.io-client';
// Connect to RSS.
const rssClientSocket = io("http://localhost:5000", {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: 2,
  timeout: 10000 // timeout for each reconnection attempt
});

async function askToConnect() {
  try {
    await rssClientSocket.connect()
    return true
  } catch (e) {
    console.error("Failed to create socket connection: %s", e)
    return false
  }
}

const events = {
  JOIN_MEDIA_ROOM: 'JoinMediaRoom',
  RELAY_ICE_CANDIDATE: 'RelayICECandidate',
  RELAY_SDP: 'RelaySDP',
  ADD_PEER: 'AddPeer',
  INCOMING_ICE_CANDIDATE: 'IncomingICECandidate',
  INCOMING_SDP: "IncomingSDP",
}

rssClientSocket.on('disconnect', () => {
  console.log(':rss: DISCONNECTED from rss');
})

rssClientSocket.on('reconnect_failed', () => {
  console.log(':rss: Failed to reconnect. Closing socket.');
})

function joinMediaRoom(data, cb) {
  console.log(':rss.joinMediaRoom: Sending request to join media room, data=%o', data)
  rssClientSocket.emit(events.JOIN_MEDIA_ROOM, data);
  cb()
}

function relayICECandidate(data, cb) {
  console.log('rss.relayICECandidate: Sending request to relay ICE candidate, data=%o', data)
  rssClientSocket.emit(events.RELAY_ICE_CANDIDATE, data);
  cb()
}

function relaySDP(data, cb) {
  console.log(':rss.relaySDP: Sending request to relay SDP, data=%o', data)
  rssClientSocket.emit(events.RELAY_SDP, data);
}

function awaitAddPeer(cb) {
  console.log(':rss.awaitAddPeer:')
  rssClientSocket.on(events.ADD_PEER, function(data) {
    cb(data)
  })
}

function awaitIncomingICECandidate(cb) {
  console.log('rss.awaitIncomingICECandidate:')
  rssClientSocket.on(events.INCOMING_ICE_CANDIDATE, function(data) {
    cb(data)
  })
}

function awaitIncomingSDP(cb) {
  console.log('rss.awaitIncomingSDP:')
  rssClientSocket.on(events.INCOMING_SDP, function(data) {
    cb(data)
  })
}

export {
  rssClientSocket,
  askToConnect,
  joinMediaRoom,
  relayICECandidate,
  relaySDP,
  awaitAddPeer,
  awaitIncomingICECandidate,
  awaitIncomingSDP,
};