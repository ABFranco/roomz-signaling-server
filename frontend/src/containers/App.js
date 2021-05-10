import React, { useEffect, useRef, useReducer } from 'react';
import * as rssClient from '../api/RSSClient.js'
import Grid from '../components/grid.js';
import './App.css';


function App(props) {
  // Currently, we only do P2P video chat between 2 people. If a third enters
  // the room, the RSS will support, however, the 'Ingress Media Element'
  // will be overridden by latest joined user.
  const roomIdRef = useRef();
  const userIdRef = useRef();

  // These are public domain STUN servers offered for free from Google.
  // Ty Google :)
  let ICE_SERVERS = [
    {urls:"stun:stun.l.google.com:19302"}
  ];
  let roomyPcs = {};
  let myPeerId = "";
  const [videoStreams, dispatchVideoStreams] = useReducer(addVideoStream, []);

  useEffect(() => {
    rssClient.askToConnect()
  })

  // Add Video Stream appends a peer's video stream data to the array of
  // video streams passed via props to the Grid component.
  function addVideoStream(prevVideoStreams, newStream) {
    console.log('Adding new video stream to grid')
    let newVideoStreams = [...prevVideoStreams, newStream];
    return newVideoStreams;
  }
  
  // setupLocalMedia requests access to the user's microphone and webcam and
  // properly sets up the egress media stream.
  // NOTE: This will likely be called on load within the vestibule component.
  function setupLocalMediaUtil(cb, eb) {
    if (videoStreams.length > 0 && videoStreams[0].stream != null) {
      if (cb) cb();
      return
    }
    console.log('Asking for local audio/video inputs')
    navigator.getUserMedia = (navigator.getUserMedia ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia ||
      navigator.msGetUserMedia);
    
    // TODO: Pass config to mute audio/video.
    navigator.getUserMedia({"audio": true, "video": true},
      function(stream) {
        console.log('Granted access to audio/video')
        // Add local video stream to Grid.
        let addVideoData = {
          'stream': stream,
          // NOTE: I may want to access a stream one day by peerId.
          // Use -1 to indicate local media stream.
          'peerId': -1,
        }
        dispatchVideoStreams(addVideoData)
        if (cb) cb();
      },
      function() {
        console.log('Access denied for audio/video')
        alert('Have fun being lame on zoom')
        if (eb) eb();
      });
  }

  function setupLocalMedia() {
    setupLocalMediaUtil(() => {
      console.log('Successfully setup local media')
    })
  }

  function newPeerConnection() {
    return new RTCPeerConnection(
      {"iceServers": ICE_SERVERS},
      // NOTE: This is needed for chrome/firefox/edge support.
      {"optional": [{"DtlsSrtpKeyAgreement": true}]}
    )
  }

  // joinMediaRoom emits the 'JoinMediaRoom' event to the RSS and registers
  // event handlers for possible response events from the RSS.
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
      // Once in the room, we must await any new joining RoomUser. Once this
      // happens, we must start the webrtc offer/answer process and relay of
      // ICE candidates so data can flow from one to the other P2P.
      rssClient.awaitAddPeer((data) => {
        console.log('Received request to AddPeer=%o', data)
        let peerId = data["peer_id"]
        // An 'AddPeer' request has a boolean 'is_offerer' field, this
        // indicates whether a person is the initial offerer to start the
        // offer/answer process. Any new joining member is the initiator.
        let isOfferer = data["is_offerer"]
        if (peerId in roomyPcs) {
          console.log('Already connected to peer=%o', peerId)
          return
        }

        // Create a fresh peer connection we will use to create offers/answers
        // relay ICE candidates on, and respond to new media events. Store
        // these away to grab the "socket" if you will to a peer's peer
        // connection.
        let pc = newPeerConnection()
        roomyPcs[peerId] = pc;

        // ICE Candidate events represent network connection candidates used to
        // form a connection between 2 peers.
        pc.onicecandidate = function(event) {
          console.log('Received possible ICE candidate for peerId=%o', peerId)
          console.log(event)
          if (event.candidate) {
            let iceCandidateData = {
              'from_peer_id': myPeerId,
              'to_peer_id': peerId,
              'ice_candidate': {
                // NOTE: I don't really know what this is yet, but is needed.
                'sdpMLineIndex': event.candidate.sdpMLineIndex,
                'candidate': event.candidate.candidate,
              }
            }
            rssClient.relayICECandidate(iceCandidateData, () => {
              console.log('Sent ICE Candidate to peerId=%o', peerId)
            })
          }
        }

        // Await incoming media stream events on the peer connection.
        pc.onaddstream = function(event) {
          console.log('Incoming stream for peerId=%o', peerId)
          console.log(event)
          // TODO: muta audio/video.
          let addVideoData = {
            'stream': event.stream,
            'peerId': peerId,
          }
          dispatchVideoStreams(addVideoData);
        }
        
        // To begin sending media data to the new peer, we must add the stream
        // on the peer connection.
        if (videoStreams.length > 0) {
          // NOTE: It is currently guaranteed that the first videoStream is the
          // local media stream.
          console.log('Attaching local media stream onto peerId=%o\'s peer connection')
          pc.addStream(videoStreams[0].stream);
        }

        // If offerer, create an offer to the existing RoomUser, and then
        // set the local description on the peer connection to communicate
        // what media they recognize.
        if (isOfferer) {
          console.log('Creating offer to peerId=%o', peerId);
          pc.createOffer(
            function(localDescription) {
              console.log('Local sdp: ', localDescription)
              pc.setLocalDescription(localDescription,
                function() {
                  let sdpData = {
                    'from_peer_id': myPeerId,
                    'to_peer_id': peerId,
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

      // If not the offerer, the RFE client must respond to offers from any
      // incoming new RoomUsers. They do this by creating answers on the
      // new RoomUser's peer connection, and then setting the remote/local
      // descriptions to complete the media acceptance agreement.
      rssClient.awaitIncomingSDP((data) => {
        console.log('Received incoming sdp=%o', data)
        let peerId = data["peer_id"]
        let pc = roomyPcs[peerId];
        let remoteSDP = data["sdp"];
        let desc = new RTCSessionDescription(remoteSDP);
        let stuff = pc.setRemoteDescription(desc,
          function() {
            console.log('Set remote description for peerId=%o', peerId)
            if (remoteSDP.type === "offer") {
              console.log('Received an offer from peerId=%', peerId)
              pc.createAnswer(
                function(localDescription) {
                  console.log('Answer description for peerId=%o is =%o', peerId, localDescription)
                  pc.setLocalDescription(localDescription,
                    function() {
                      let sdpData = {
                        'from_peer_id': myPeerId,
                        'to_peer_id': peerId,
                        'sdp': localDescription,
                      }
                      rssClient.relaySDP(sdpData, () => {})
                    },
                    function(e) {
                      console.log('Error setting local description for peerId=%o, error=%o', peerId, e)
                    }
                  )
                },
                function(e) {
                  console.log('error creating answer=%o', e)
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

      // The RFE Client must also respond to ICE or simply network connection
      // canidate events. The ICE candidate must be added to the peer's peer
      // connection.
      rssClient.awaitIncomingICECandidate((data) => {
        let peerId = data["peer_id"]
        let pc = roomyPcs[peerId]
        let iceCandidate = data["ice_candidate"]
        console.log('Set ICE candidate for peerId=%o', peerId)
        console.log(iceCandidate)
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
      <div className="room-user-form">
        <form className="user-settings-form">
          <div className="user-input-form">
            <label htmlFor="room-id">Room Id: </label>
            <input id="room-id" ref={roomIdRef} autoFocus/>
          </div>
          <div className="user-input-form">
            <label htmlFor="user-id">User Id: </label>
            <input id="user-id" ref={userIdRef} autoFocus/>
          </div>
        </form>
        <div className="user-actions">
          <button className="roomz-btn button-primary" onClick={joinMediaRoom}>JoinMediaRoom</button>
        </div>
      </div>
      <div className="grid-test">
        <Grid
          videos={videoStreams}
          />
      </div>
    </div>

  );
}

export default App;
