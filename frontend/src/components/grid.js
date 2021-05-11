import React from 'react';
import Video from './video';

function Grid(props) {
  return (
    <div>
      <div className="grid-header">
        <h1>Grid</h1>
      </div>
      <div className="grid-container">
        {props.videos.map((v, index) => (
          v.stream !== null ?
          <Video
            key={index}
            stream={v.stream}
            peerId={v.peerId}
            /> : <div></div>
        ))}
      </div>
    </div>
  )
}

export default Grid;