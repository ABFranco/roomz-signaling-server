import React, { useState, useRef, useEffect } from 'react';

function Video(props) {
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const mediaRef = useRef();

  useEffect(() => {
    console.log('Setting stream data on Video component for peerId=%o', props.peerId)
    if (props.stream !== null) {
      mediaRef.current.srcObject = props.stream;
    }
  }, [props.stream])

  if (props.stream !== null) {
    return (
      <div className="video" id={props.peerId}>
        <video ref={mediaRef} id="egress-video" autoPlay controls/>
      </div>
    )
  } else {
    return (<div></div>)
  }
  
}

export default Video;