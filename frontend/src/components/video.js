import React, { useState, useRef } from 'react';

function Video(props) {
  const [mediaStream, setMediaStream] = useState(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [peerId, setPeerId] = useState("");
  const mediaRef = useRef();

  return (
    <div className="video" id={peerId}>
      <video ref={mediaRef} id="egress-video" autoPlay controls/>
    </div>
  )
}

export default Video;