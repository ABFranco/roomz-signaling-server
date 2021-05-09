import React, { useState, useRef, useEffect } from 'react';

function Video(props) {
  const [mediaStream, setMediaStream] = useState(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [peerId, setPeerId] = useState("");
  const mediaRef = useRef();

  useEffect(() => {
    console.log('new props')
    mediaRef.current.srcObject = props.stream;
  }, [props.stream])

  if (props.stream !== null) {
    console.log('hello')
    return (
      <div className="video" id={peerId}>
        <video ref={mediaRef} id="egress-video" autoPlay controls/>
      </div>
    )
  } else {
    return (<div></div>)
  }
  
}

export default Video;