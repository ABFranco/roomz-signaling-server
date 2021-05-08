import React, { useEffect, useRef } from 'react';

import * as rssClient from '../api/RSSClient.js'
import './App.css';



function App(props) {
  const roomIdRef = useRef();
  const userIdRef = useRef();
  const egressMediaRef = useRef();
  const ingressMediaRef = useRef();

  var ICE_SERVERS = [
    {urls:"stun:stun.l.google.com:19302"}
  ];
  var roomyPcs = {};
  let videos = [
    { peer_id: "0-0" },
  ];
  let videoRefs = [];
  var myPeerId = "";
  let egressMediaStream = null;

  useEffect(() => {
    rmsClient.askToConnect()
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

  function enterMediaRoom() {

  }

  // completeBroadcast creates a broadcaster pc, adds the local media tracks
  // onto the broadcaster pc, and performs the offer/answer process with the
  // RMS. This should be called before emitting a "RecvMediaFrom" event
  // asking to receive their own media.
  function completeBroadcast(peerId, cb) {
    console.log('completing broadcast for peerId=%o', peerId)
    let broadcastPc = newPeerConnection();
    let tracks = egressMediaStream.getTracks()
    for (var i = 0; i < tracks.length; i++) {
      broadcastPc.addTrack(tracks[i], egressMediaStream)
    }
    
    broadcastPc.onicecandidate = function(event) {
      console.log('received ICE Candidate for broadcast pc for peerId=%o', peerId)
      console.log(event)
    }

    // Store peer connection in map.
    roomyPcs[peerId] = broadcastPc;

    broadcastPc.createOffer(
      function(localDescription) {
        console.log('set local description for peerId=%o\'s broadcaster pc.', peerId)
        broadcastPc.setLocalDescription(localDescription,
        function() {
          let data = {
            'peer_id': peerId,
            'desc': btoa(JSON.stringify(broadcastPc.localDescription))
          }
          rmsClient.completeBroadcastOffer(data, () => {
            console.log('peerId=%o send CompleteBroadcastOffer event', peerId)
            rmsClient.awaitCompleteBroadcastAnswer((resp) => {
              let sdpAnswer = JSON.parse(atob(resp["sdp_answer"]));
              if (sdpAnswer !== '') {
                var remoteDescription = new RTCSessionDescription(sdpAnswer)
                var tmp = broadcastPc.setRemoteDescription(remoteDescription,
                function() {
                  console.log('set remote description on peerId=%o\'s broadcast pc', peerId);
                  cb()
                }, function (e) {
                  console.log('error=%o setting remote description for peerId\'s broadcast pc', e, peerId)
                })
              }
            })
          })
        })
      },
      function(e) {
        console.log('error=%o setting peerId=%o\'s local description', e, peerId)
      }
    )
  }

  function recvMediaFrom(fromPeerId) {
    // Create a fresh peer connection.
    let recvBroadcastPc = newPeerConnection()
    // Store this peer connection in RoomyPeerConnection map
    let recvKey = fromPeerId + "to" + myPeerId
    roomyPcs[recvKey] = recvBroadcastPc;

    // Setup handlers for when we receive data back on this peer connection.
    recvBroadcastPc.ontrack = function(event) {
      let fromUserId = fromPeerId.split("-")[1];
      if (event.streams.length > 0 && fromUserId >= 0) {
        console.log('setting up media for userId=%o', fromUserId)
        ingressMediaRef.current.srcObject = event.streams[0]
        // TODO: Add to grid component somehow.
        // Keep video refs for now?
      }
    }

    // Setup handler to monitor ICE candidates we can use on the peer
    // connection.
    recvBroadcastPc.onicecandidate = function(event) {
      console.log('recvBroadcast - received ICE candidate from newPeerId=%o', fromPeerId)
      console.log(event)
      if (event.candidate === null) {
        console.log('creating offer..')
        recvBroadcastPc.createOffer(
          function(localDescription) {
            console.log('set local description for newPeerId=%o', fromPeerId)
            recvBroadcastPc.setLocalDescription(localDescription,
            function() {
              // With the local description, we can send the event. We will
              // await a 'ReceiveMediaAnswer' event and set the remote
              // description on this peer connection.
              let data = {
                'from_peer_id': fromPeerId,
                'to_peer_id':   myPeerId,
                'desc':         btoa(JSON.stringify(recvBroadcastPc.localDescription))
              }
              rmsClient.receiveMediaFrom(data, () => {
                console.log('peerId=%o requested to receive media from peerId=%o', myPeerId, fromPeerId);
                rmsClient.awaitReceiveMediaAnswer((resp) => {
                  console.log('received media answer resp=%o for peerId=%o', resp, fromPeerId);
                  // TODO: validate.
                  let sdpAnswer = JSON.parse(atob(resp["sdp_answer"]));
                  if (sdpAnswer !== '') {
                    var remoteDescription = new RTCSessionDescription(sdpAnswer);
                    var tmp = recvBroadcastPc.setRemoteDescription(remoteDescription,
                    function() {
                      console.log('set remote description for peerId=%o', fromPeerId);
                    }, function (e) {
                      console.log('error=%o setting remote description for peerId=%o', e, fromPeerId);
                    });
                    console.log('remote description=%o for peerId=%o', fromPeerId)
                  }
                });
              });
            });
          },
          function(e) {
            console.log('error setting local description=%o', e)
          });
      }
    }

    // Add an offer on the peer connection and after setting the local
    // description of the peer connection, emit the 'ReceiveMediaFrom'
    // event using the SDP.
    // console.log('creating offer..')
    // recvBroadcastPc.createOffer(
    //   function(localDescription) {
    //     console.log('set local description for newPeerId=%o', fromPeerId)
    //     recvBroadcastPc.setLocalDescription(localDescription,
    //     function() {
    //       // With the local description, we can send the event. We will
    //       // await a 'ReceiveMediaAnswer' event and set the remote
    //       // description on this peer connection.
    //       let data = {
    //         'from_peer_id': fromPeerId,
    //         'to_peer_id':   myPeerId,
    //         'desc':         btoa(JSON.stringify(recvBroadcastPc.localDescription))
    //       }
    //       rmsClient.receiveMediaFrom(data, () => {
    //         console.log('peerId=%o requested to receive media from peerId=%o', myPeerId, fromPeerId);
    //         rmsClient.awaitReceiveMediaAnswer((resp) => {
    //           console.log('received media answer resp=%o for peerId=%o', resp, fromPeerId);
    //           // TODO: validate.
    //           let sdpAnswer = JSON.parse(atob(resp["sdp_answer"]));
    //           if (sdpAnswer !== '') {
    //             var remoteDescription = new RTCSessionDescription(sdpAnswer);
    //             var tmp = recvBroadcastPc.setRemoteDescription(remoteDescription,
    //             function() {
    //               console.log('set remote description for peerId=%o', fromPeerId);
    //             }, function (e) {
    //               console.log('error=%o setting remote description for peerId=%o', e, fromPeerId);
    //             });
    //             console.log('remote description=%o for peerId=%o', fromPeerId)
    //           }
    //         });
    //       });
    //     });
    //   },
    //   function(e) {
    //     console.log('error setting local description=%o', e)
    //   });
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
        if (peerId in roomPcs) {
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
                function { Alert("setLocalDescription failed!")}
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
    })


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
