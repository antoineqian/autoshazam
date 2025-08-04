
import React, { useState, useRef } from 'react';


const AudioPlayer = ({ audioSrc }) => {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
    } else {
      audio.play().catch((err) => {
        console.warn("Playback failed", err);
      });
    }
    setPlaying(!playing);
  };


  return (
    <div>
      <audio ref={audioRef} src={audioSrc} preload="auto" />
      <button
        onClick={togglePlay}
        className="playbutton text-sm font-semibold border px-3 py-1 rounded"
        title={playing ? "Pause" : "Play"}
      >
        {playing ?
          <img src="pause.svg" alt="Pause Icon" className="icon" />
          : <img src="play-button.svg" alt="Play Icon" className="icon" />
        }
      </button>
    </div>
  );
};

export default AudioPlayer;