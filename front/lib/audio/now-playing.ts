/**
 * One playing track at a time, across every player on the page.
 *
 * The library renders an independent <audio> per row, and browsers are happy
 * to play all of them at once. Rather than lifting playback into shared state,
 * each player announces itself here and the previous one is paused; its own
 * 'pause' event then puts its button back, so the UI stays truthful without
 * the players knowing about each other.
 */
let current: HTMLAudioElement | null = null;

export function claimPlayback(audio: HTMLAudioElement): void {
  const previous = current;
  current = audio;
  if (previous && previous !== audio) {
    previous.pause();
  }
}

export function releasePlayback(audio: HTMLAudioElement): void {
  if (current === audio) {
    current = null;
  }
}
