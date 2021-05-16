import React, { useRef, useEffect } from 'react';

function Video(props) {
  const mediaRef = useRef();

  useEffect(() => {
    console.log('Setting stream data on Video component for peerId=%o', props.peerId)
    mediaRef.current.srcObject = props.stream;
  }, [props.stream])

  useEffect(() => {
    console.log('[Video]: new muted=%o', props.muted)
  }, [props.muted])


  return (
    <div className="video" id={props.peerId}>
      <video ref={mediaRef} id="egress-video" autoPlay controls muted={props.muted}/>
    </div>
  )
}

export default Video;