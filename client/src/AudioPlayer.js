import React, { useState } from 'react';
import ReactPlayer from 'react-player';
import playIcon from './play-button.svg'; 
import pauseIcon from './pause.svg'; 

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
          <img src={pauseIcon} alt="Pause Icon" className="icon"/>
          : <img src={playIcon} alt="Play Icon" className="icon"/>
}
      </button>
    </div>
  );
};

export default AudioPlayer;