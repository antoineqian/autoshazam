import React, { useEffect, useRef, useState } from 'react';
import { FileAudio, Pause, Play } from 'lucide-react';
import toast from 'react-hot-toast';
import { claimPlayback, releasePlayback } from '@/lib/audio/now-playing';

const AudioPlayer = ({
  audioSrc,
  label = 'Shazam preview',
  original = false,
}) => {
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
    audio.addEventListener('error', onStop);

    return () => {
      audio.pause();
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onStop);
      audio.removeEventListener('ended', onStop);
      audio.removeEventListener('error', onStop);
      releasePlayback(audio);
    };
  }, [audioSrc]);

  const reportError = () => {
    toast.error(
      original
        ? 'Original audio is unavailable. Check that the backend is running on the computer where this analysis was made.'
        : 'Could not play the Shazam preview.',
      { id: 'audio-playback-error' },
    );
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (audio.paused) {
      audio.play().catch((err) => {
        if (err.name !== 'AbortError') reportError();
      });
    } else {
      audio.pause();
    }
  };

  return (
    <div className="flex shrink-0 items-center">
      <audio ref={audioRef} src={audioSrc} preload="none" onError={reportError} />
      <button
        type="button"
        onClick={togglePlay}
        className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-medium text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        title={`${playing ? 'Pause' : 'Play'} ${label}`}
        aria-label={`${playing ? 'Pause' : 'Play'} ${label}`}
        aria-pressed={playing}
      >
        {playing ? <Pause aria-hidden="true" className="h-4 w-4" /> :
          original ? <FileAudio aria-hidden="true" className="h-4 w-4" /> :
            <Play aria-hidden="true" className="h-4 w-4" />}
        {original && <span>Original</span>}
      </button>
    </div>
  );
};

export default AudioPlayer;
