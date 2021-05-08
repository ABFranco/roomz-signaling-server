import React, { useEffect, useRef } from 'react';

import * as rssClient from '../api/RSSClient.js'
import './App.css';



function App(props) {
  const roomIdRef = useRef();
  const userIdRef = useRef();
  const egressMediaRef = useRef();
  const ingressMediaRef = useRef();

  let ICE_SERVERS = [
    {urls:"stun:stun.l.google.com:19302"}
  ];
  let roomyPcs = {};
  let myPeerId = "";
  let egressMediaStream = null;
  let ingressMediaStream = null;

  useEffect(() => {
    rssClient.askToConnect()
  })
  
  // setupLocalMedia requests access to the user's microphone and webcam and
  // properly sets up the egress media stream.
  // NOTE: This will likely be called on load within the vestibule component.
  function setupLocalMediaUtil(cb, eb) {
    if (egressMediaStream != null) {
      if (cb) cb();
      return
    }
    console.log('asking for local audio/video inputs')
    navigator.getUserMedia = (navigator.getUserMedia ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia ||
      navigator.msGetUserMedia);
    
    // TODO: Pass config to mute audio/video.
    navigator.getUserMedia({"audio": true, "video": true},
      function(stream) {
        console.log('granted access to audio/video')
        egressMediaStream = stream
        egressMediaRef.current.srcObject = egressMediaStream
        if (cb) cb();
      },
      function() {
        console.log('access denied for audio/video')
        alert('have fun being lame on zoom')
        if (eb) eb();
      });
  }

  function setupLocalMedia() {
    setupLocalMediaUtil(() => {
      console.log('successfully setup local media')
    })
  }

  function newPeerConnection() {
    return new RTCPeerConnection(
      {"iceServers": ICE_SERVERS},
      // This is needed for chrome/firefox/edge support.
      {"optional": [{"DtlsSrtpKeyAgreement": true}]}
    )
  }

  // joinMediaRoom emits the 'JoinMediaRoom' event to the RMS and registers
  // event handlers for possible response events from the RMS.
  function joinMediaRoom() {
    // TODO: validation.
    let roomId = roomIdRef.current.value;
    let userId = userIdRef.current.value;
    myPeerId = roomId + "-" + userId;
    let data = {
      'user_id': userId,
      'room_id': roomId,
    }
    rssClient.joinMediaRoom(data, () => {
      rssClient.awaitAddPeer((data) => {
        let peerId = data["peer_id"]
        let isOfferer = data["is_offerer"]
        if (peerId in roomyPcs) {
          console.log('Already connected to peer=%o', peerId)
          return
        }

        let pc = newPeerConnection()

        pc.onicecandidate = function(event) {
          if (event.candidate) {
            let iceCandidateData = {
              'peer_id': peerId,
              'ice_candidate': {
                'sdpMLineIndex': event.candidate.sdpMLineIndex,
                'candidate': event.candidate.candidate,
              }
            }
            rssClient.relayIceCandidate(iceCandidateData, () => {})
          }
        }

        // Await incoming media stream.
        pc.onaddstream = function(event) {
          console.log('incoming stream for peerId=%o', peerId)
          // TODO: muta audio/video.
          // TODO: grid.
          ingressMediaStream = event.stream
          ingressMediaRef.current.srcObject = ingressMediaStream
        }
        
        // Add local media stream on pc.
        pc.addStream(egressMediaStream);

        // If offerer, create offer.
        if (isOfferer) {
          console.log('Creating offer to peerId=%o', peerId);
          pc.createOffer(
            function(localDescription) {
              console.log('Local sdp: ', localDescription)
              pc.setLocalDescription(localDescription,
                function() {
                  let sdpData = {
                    'peer_id': peerId,
                    'sdp': localDescription,
                  }
                  rssClient.relaySDP(sdpData, () => {})
                },
                function() { alert("setLocalDescription failed!")}
              )
            },
            function(e) {
              console.log('Error sending offer=%o', e)
            }
          )
        }
      })

      rssClient.awaitIncomingSDP((data) => {
        console.log('Received remote sdp=%o', data)
        let peerId = data["peer_id"]
        let pc = roomyPcs[peerId];
        let remoteSDP = data["sdp"];
        let desc = new RTCSessionDescription(remoteSDP);
        let stuff = pc.setRemoteDescription(desc,
          function() {
            console.log('setRemoteDescription succeeded')
            if (remoteSDP.type == "offer") {
              console.log('Creating answer')
              pc.createAnswer(
                function(localDescription) {
                  console.log('Answer description is=%o', localDescription)
                  pc.setLocalDescription(localDescription,
                    function() {
                      let sdpData = {
                        'peer_id': peerId,
                        'sdp': localDescription,
                      }
                      rssClient.relaySDP(sdpData, () => {})
                    },
                    function(e) {
                      console.log('error creating answer=%o', e)
                    }
                  )
                }
              )
            }
          },
          function(e) {
            console.log('setRemoteDescription error=%o', e)
          }
        )
        console.log('description object: ', desc);
      })

      rssClient.awaitIncomingIceCandidate((data) => {
        let peerId = data["peer_id"]
        let pc = roomyPcs[peerId]
        let iceCandidate = data["ice_candidate"]
        pc.addIceCandidate(new RTCIceCandidate(iceCandidate))
      })

      // TODO: handle peer left.
    }) // End: joinMediaRoom.
  }

  return (
    <div className="App">
      <div className="header">
        <h1>RSS Frontend Test Environment</h1>
      </div>
      <div className="user-actions">
        <button className="roomz-btn button-primary" onClick={setupLocalMedia}>Setup Media</button>
      </div>
      <div className="videos">
        <div className="video" id="egress">
          <label htmlFor="outgoing-vid">Egress Video</label><br/>
          <video ref={egressMediaRef} id="egress-vid" autoPlay controls/>
        </div>
        <div className="video" id="incoming">
          <label htmlFor="incoming-vid">Ingress Video</label><br/>
          <video ref={ingressMediaRef} id="ingress-vid" autoPlay controls/>
        </div>
      </div>
      <div className="user-actions">
        <button className="roomz-btn button-primary" onClick={joinMediaRoom}>JoinMediaRoom</button>
      </div>
    </div>

  );
}

export default App;
