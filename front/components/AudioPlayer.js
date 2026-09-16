import React, { useEffect, useRef, useState } from 'react';
import { claimPlayback, releasePlayback } from '@/lib/audio/now-playing';

const AudioPlayer = ({ audioSrc }) => {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  // The element is the source of truth: it also stops when the clip ends, when
  // another row takes over, or when play() is refused.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlay = () => {
      setPlaying(true);
      claimPlayback(audio);
    };
    const onStop = () => {
      setPlaying(false);
      releasePlayback(audio);
    };

    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onStop);
    audio.addEventListener('ended', onStop);

    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onStop);
      audio.removeEventListener('ended', onStop);
      releasePlayback(audio);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.play().catch((err) => {
        console.warn("Playback failed", err);
      });
    } else {
      audio.pause();
    }
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
          <img src="/pause.svg" alt="Pause Icon" className="icon" />
          : <img src="/play-button.svg" alt="Play Icon" className="icon" />
        }
      </button>
    </div>
  );
};

export default AudioPlayer;
