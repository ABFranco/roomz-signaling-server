
import io from 'socket.io-client';
// Connect to RMS
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
  RELAY_ICE_CANDIDATE: 'RelayIceCandidate',
  RELAY_SDP: 'RelaySDP',
}

rssClientSocket.on('disconnect', () => {
  console.log(':rms: DISCONNECTED from RMS');
})

rssClientSocket.on('reconnect_failed', () => {
  console.log(':rms: Failed to reconnect. Closing socket.');
})

function joinMediaRoom(data, cb) {
  console.log(':rms.joinMediaRoom: Sending request to join media room, data=%o', data)
  rmsClientSocket.emit(events.JOIN_MEDIA_ROOM, data);
  cb()
}

export {
  rmsClientSocket,
  askToConnect,
  joinMediaRoom,
};