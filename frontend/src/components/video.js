import React, { useState, useRef, useEffect } from 'react';

function Video(props) {
  const [audioMuted, setAudioMuted] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const audioRef = useRef();
  const videoRef = useRef();

  useEffect(() => {
    console.log('Setting stream data on Video component for peerId=%o', props.peerId)
    // For audio, we always keep an active stream.
    videoRef.current.srcObject = props.stream;
    // if (props.stream !== null && !props.muted) {
    //   audioRef.current.srcObject = props.stream;
    // } else if (props.stream !== null) {
    //   console.log('localstream=%o', props.stream)
    //   setLocalStream(props.stream);
    // }
  }, [props.stream])

  useEffect(() => {
    console.log('local stream saved!')
  }, [localStream])

  useEffect(() => {
    console.log('[Video]: new muted=%o', props.muted)
  }, [props.muted])


  if (props.stream !== null) {
    return (
      <div className="video" id={props.peerId}>
        <video ref={videoRef} id="egress-video" autoPlay controls muted={props.muted}/>
      </div>
    )
  } else if (!props.muted) {
    return (
      <div className="audio" id={props.peerId}>
        <audio ref={audioRef} id="egress-audio" autoPlay controls muted={props.muted}/>
      </div>
    )
  }
  return <div>No audio or video</div>;
}

export default Video;