// Beeps for the rest timer and the stretching routine.
//
// iOS stops JavaScript while the app is in the background or the screen is locked,
// so a beep triggered from a timer callback never plays there – and the Web Audio
// version used before was queued up and played late on the next tap instead.
// Therefore the whole countdown is rendered as one audio track (silence with the
// beeps at the right offsets) and played by an <audio> element. Media playback
// keeps running on a locked screen and ignores the silent switch.

export type CueKind = 'warn' | 'go'; // warn = one beep, go = two beeps (pause over, next set)

export interface Cue {
  at: number; // epoch ms
  kind: CueKind;
}

const RATE = 8000; // Hz – plenty for a beep and keeps the track small (16 KB per second)
const MAX_TRACK = 600; // seconds; longer schedules are cut (the next reschedule picks up the rest)
const DRIFT = 0.75; // seconds the track may be off the clock before it is corrected

// [start offset, length, frequency] of each tone
const TONES: Record<CueKind, [number, number, number][]> = {
  warn: [[0, 0.3, 1320]],
  go: [
    [0, 0.22, 1760],
    [0.34, 0.22, 1760],
  ],
};

const toneEnd = (kind: CueKind) => Math.max(...TONES[kind].map(([start, length]) => start + length));

function wav(samples: Int16Array): Blob {
  const header = new DataView(new ArrayBuffer(44));
  const text = (offset: number, s: string) => [...s].forEach((c, i) => header.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  header.setUint32(4, 36 + samples.byteLength, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true); // PCM
  header.setUint16(22, 1, true); // mono
  header.setUint32(24, RATE, true);
  header.setUint32(28, RATE * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  text(36, 'data');
  header.setUint32(40, samples.byteLength, true);
  return new Blob([header.buffer, samples.buffer as ArrayBuffer], { type: 'audio/wav' });
}

// Silence of `seconds` length with the tones mixed in at their offsets
function renderTrack(seconds: number, cues: { offset: number; kind: CueKind }[]): Blob {
  const samples = new Int16Array(Math.ceil(seconds * RATE));
  const fade = 0.006 * RATE; // soft edges, no clicks
  for (const cue of cues) {
    for (const [start, length, freq] of TONES[cue.kind]) {
      const first = Math.round((cue.offset + start) * RATE);
      const count = Math.round(length * RATE);
      for (let i = 0; i < count && first + i < samples.length; i++) {
        const edge = Math.min(1, i / fade, (count - i) / fade);
        samples[first + i] = Math.round(Math.sin((2 * Math.PI * freq * i) / RATE) * edge * 0.95 * 32767);
      }
    }
  }
  return wav(samples);
}

// ---------- Playback ----------

const audio = typeof Audio === 'undefined' ? null : new Audio();
let unlocked = false;
let url: string | null = null;
let schedule: { startedAt: number; end: number; cues: Cue[] } | null = null;
let failed = false; // play() was refused (no tap yet) – retried on the next tap

const cueKey = (cues: Cue[]) => cues.map((c) => `${c.kind}@${Math.round(c.at / 100)}`).join(',');

function stop(): void {
  schedule = null;
  failed = false;
  if (!audio) return;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  if (url) URL.revokeObjectURL(url);
  url = null;
}

// Plays exactly these cues from now on and replaces whatever was scheduled.
// Calling it again with the same cues does nothing, so screens can call it on every change.
export function scheduleCues(cues: Cue[], title = 'Timer'): void {
  if (!audio) return;
  const now = Date.now();
  const upcoming = (list: Cue[]) =>
    list.filter((c) => c.at > now + 100 && c.at - now < MAX_TRACK * 1000).sort((a, b) => a.at - b.at);
  const future = upcoming(cues);
  const key = cueKey(future);
  // Same beeps still to come as in the running track (cues already played don't count)
  if (schedule && cueKey(upcoming(schedule.cues)) === key && (failed || !audio.paused)) return;
  stop();
  if (future.length === 0) return;

  const last = future[future.length - 1];
  const seconds = (last.at - now) / 1000 + toneEnd(last.kind) + 0.2;
  url = URL.createObjectURL(renderTrack(seconds, future.map((c) => ({ offset: (c.at - now) / 1000, kind: c.kind }))));
  schedule = { startedAt: now, end: now + seconds * 1000, cues: future };
  audio.src = url;
  if ('mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
    navigator.mediaSession.metadata = new MediaMetadata({ title, artist: 'Trainings-App' });
  }
  audio.play().then(
    () => {
      failed = false;
    },
    () => {
      failed = true;
    },
  );
}

// Keeps the track in step with the clock. Whenever JavaScript runs again (unlock,
// tab visible, iOS resuming the track after an interruption) a track that drifted is
// moved to the right position, and one that is past its end is stopped – so a beep
// can never come late.
function sync(): void {
  if (!audio || !schedule || failed) return;
  const now = Date.now();
  if (now >= schedule.end) {
    stop();
    return;
  }
  if (audio.paused) return;
  const expected = (now - schedule.startedAt) / 1000;
  if (Math.abs(audio.currentTime - expected) > DRIFT) audio.currentTime = expected;
}

// ---------- Sound mode ----------

// true: beeps also on a locked screen – iOS then pauses music from other apps while a timer runs.
// false: beeps mix with music, but only while the app is open and the silent switch is off.
export function setLockScreenSound(on: boolean): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = on ? 'playback' : 'ambient';
}

// ---------- Unlock ----------

// iOS only lets an <audio> element play after it was started from a tap. The first tap
// anywhere plays a few milliseconds of silence; after that the element may play on its own.
function unlock(): void {
  if (!audio) return;
  if (failed && schedule) {
    const cues = schedule.cues;
    stop();
    scheduleCues(cues);
    return;
  }
  if (unlocked || schedule) return;
  unlocked = true;
  url = URL.createObjectURL(renderTrack(0.05, []));
  audio.src = url;
  audio.play().catch(() => {
    unlocked = false;
  });
}

export function installAudio(): void {
  document.addEventListener('touchend', unlock, { passive: true });
  document.addEventListener('click', unlock);
  document.addEventListener('visibilitychange', sync);
  audio?.addEventListener('playing', sync);
  audio?.addEventListener('timeupdate', sync);
}
