import React, { useState } from 'react';
import ReactPlayer from 'react-player';


const AudioPlayer = ({ audioSrc }) => {
  const [playing, setPlaying] = useState(false);

  const handlePlayPause = () => {
    setPlaying(!playing);
  };

  return (
    <div>
      <ReactPlayer
        url={audioSrc}
        playing={playing}
        width="0px"
        height="0px"
      />
      <button className='playbutton'
        onClick={handlePlayPause}
        title="Play Preview">
        {playing ?
          <img src="pause.svg" alt="Pause Icon" className="icon" />
          : <img src="play-button.svg" alt="Play Icon" className="icon" />
        }
      </button>
    </div>
  );
};

export default AudioPlayer;