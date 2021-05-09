import React, { useState } from 'react';
import Video from './video';

function Grid(props) {
  const [videos, setVideos] = useState([])

  return (
    <div>
      <div className="grid-header">
        <h1>Grid</h1>
      </div>
      <div className="grid-container">
        {props.videos.map((v, index) => (
          <div>
            <Video
              key={index}
              stream={v}
              />
            <h1>video</h1>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Grid;