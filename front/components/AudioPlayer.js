import React, { useEffect, useRef, useState } from 'react';
import { FileAudio, Pause, Play } from 'lucide-react';
import toast from 'react-hot-toast';
import { claimPlayback, releasePlayback } from '@/lib/audio/now-playing';

const AudioPlayer = ({
  audioSrc,
  label = 'Shazam preview',
  original = false,
  startTime = 0,
  duration = Infinity,
  autoPlay = false,
  errorMessage = '',
  onError = () => {},
}) => {
  const audioRef = useRef(null);
  const autoPlayPending = useRef(autoPlay);
  const [playing, setPlaying] = useState(false);

  const reportError = () => {
    toast.error(errorMessage || (original
      ? 'Original audio is unavailable. Check that the backend is running on the computer where this analysis was made.'
      : 'Could not play the Shazam preview.'), { id: 'audio-playback-error' });
    onError();
  };

  const play = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (Number.isFinite(audio.duration) && startTime >= audio.duration) {
      reportError();
      return;
    }
    if (audio.currentTime < startTime || audio.currentTime >= startTime + duration || audio.ended) {
      audio.currentTime = startTime;
    }
    audio.play().catch((err) => {
      if (err.name === 'NotAllowedError') {
        toast('Press Original to start playback.', { id: 'audio-playback-error' });
      } else if (err.name !== 'AbortError') reportError();
    });
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setPlaying(false);
    const onPlay = () => { setPlaying(true); claimPlayback(audio); };
    const onStop = () => { setPlaying(false); releasePlayback(audio); };
    const onMetadata = () => {
      if (Number.isFinite(audio.duration) && startTime >= audio.duration) {
        audio.pause();
        reportError();
      } else {
        audio.currentTime = startTime;
      }
    };
    const onTime = () => {
      if (audio.currentTime >= startTime + duration) audio.pause();
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onStop);
    audio.addEventListener('ended', onStop);
    audio.addEventListener('error', onStop);
    audio.addEventListener('loadedmetadata', onMetadata);
    audio.addEventListener('timeupdate', onTime);
    // React's development check mounts effects twice. Defer until the retained
    // effect so its cleanup cannot immediately pause the requested playback.
    const frame = autoPlayPending.current ? requestAnimationFrame(() => {
      autoPlayPending.current = false;
      play();
    }) : null;
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      audio.pause();
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onStop);
      audio.removeEventListener('ended', onStop);
      audio.removeEventListener('error', onStop);
      audio.removeEventListener('loadedmetadata', onMetadata);
      audio.removeEventListener('timeupdate', onTime);
      releasePlayback(audio);
    };
  }, [audioSrc, startTime, duration]);

  return (
    <div className="flex shrink-0 items-center">
      <audio ref={audioRef} src={audioSrc} preload="none" onError={reportError} />
      <button type="button" onClick={() => audioRef.current?.paused ? play() : audioRef.current?.pause()}
        className="inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-medium text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        title={`${playing ? 'Pause' : 'Play'} ${label}`}
        aria-label={`${playing ? 'Pause' : 'Play'} ${label}`} aria-pressed={playing}>
        {playing ? <Pause aria-hidden="true" className="h-4 w-4" /> :
          original ? <FileAudio aria-hidden="true" className="h-4 w-4" /> :
            <Play aria-hidden="true" className="h-4 w-4" />}
        {original && <span>Original</span>}
      </button>
    </div>
  );
};

export default AudioPlayer;
