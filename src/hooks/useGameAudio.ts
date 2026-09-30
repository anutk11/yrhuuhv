import { useEffect, useRef, useCallback } from "react";

export interface GameAudioSettings {
  bgMusicUrl?: string;
  correctSoundUrl?: string;
  wrongSoundUrl?: string;
  endMusicUrl?: string;
}

interface UseGameAudioOptions {
  settings: GameAudioSettings;
  phase: string;
  isPaused: boolean;
  hasVideo: boolean;
  isFinished?: boolean;
  /** master volume 0..1 (default 1) */
  masterVolume?: number;
  muted?: boolean;
}

const DUCK_VOLUME = 0.15;
const NORMAL_VOLUME = 0.5;
const FADE_STEP_MS = 30;

function fadeVolume(audio: HTMLAudioElement, target: number, duration: number) {
  const steps = Math.max(1, Math.round(duration / FADE_STEP_MS));
  const diff = target - audio.volume;
  const stepSize = diff / steps;
  let step = 0;
  const id = setInterval(() => {
    step++;
    if (step >= steps) {
      audio.volume = Math.max(0, Math.min(1, target));
      clearInterval(id);
      return;
    }
    audio.volume = Math.max(0, Math.min(1, audio.volume + stepSize));
  }, FADE_STEP_MS);
  return id;
}

export function useGameAudio({ settings, phase, isPaused, hasVideo, isFinished, masterVolume = 1, muted = false }: UseGameAudioOptions) {
  const master = muted ? 0 : Math.max(0, Math.min(1, masterVolume));
  const masterRef = useRef(master);
  masterRef.current = master;
  const bgRef = useRef<HTMLAudioElement | null>(null);
  const sfxRef = useRef<HTMLAudioElement | null>(null);
  const endRef = useRef<HTMLAudioElement | null>(null);
  const fadeIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endPlayedRef = useRef(false);

  // Create / update background music element
  useEffect(() => {
    if (!settings.bgMusicUrl) {
      if (bgRef.current) { bgRef.current.pause(); bgRef.current = null; }
      return;
    }

    if (bgRef.current?.src === settings.bgMusicUrl) return;

    if (bgRef.current) bgRef.current.pause();
    const audio = new Audio(settings.bgMusicUrl);
    audio.loop = true;
    audio.volume = NORMAL_VOLUME * masterRef.current;
    bgRef.current = audio;

    return () => {
      audio.pause();
      bgRef.current = null;
    };
  }, [settings.bgMusicUrl]);

  // Play/pause bg music based on game state
  useEffect(() => {
    const bg = bgRef.current;
    if (!bg) return;

    if (isPaused || isFinished) {
      bg.pause();
    } else if (phase !== "idle") {
      bg.play().catch(() => {});
    }
  }, [phase, isPaused, isFinished]);

  // Duck bg music when video is playing (reading phase with video)
  useEffect(() => {
    const bg = bgRef.current;
    if (!bg) return;

    if (fadeIdRef.current) clearInterval(fadeIdRef.current);

    if (hasVideo && phase === "reading") {
      // Fast fade to 0
      fadeIdRef.current = fadeVolume(bg, 0, 400);
    } else {
      // Restore
      fadeIdRef.current = fadeVolume(bg, NORMAL_VOLUME * masterRef.current, 300);
    }

    return () => {
      if (fadeIdRef.current) clearInterval(fadeIdRef.current);
    };
  }, [hasVideo, phase]);

  // Play correct/wrong sound effect
  const playAnswerSound = useCallback((isCorrect: boolean | null) => {
    if (isCorrect === null) return; // survey

    const url = isCorrect ? settings.correctSoundUrl : settings.wrongSoundUrl;
    if (!url) return;

    // Duck background music
    const bg = bgRef.current;
    if (bg) {
      if (fadeIdRef.current) clearInterval(fadeIdRef.current);
      fadeIdRef.current = fadeVolume(bg, DUCK_VOLUME * masterRef.current, 200);
    }

    if (sfxRef.current) { sfxRef.current.pause(); sfxRef.current = null; }

    const sfx = new Audio(url);
    sfx.volume = 0.8 * masterRef.current;
    sfxRef.current = sfx;

    sfx.onended = () => {
      sfxRef.current = null;
      // Restore bg volume
      if (bg) {
        if (fadeIdRef.current) clearInterval(fadeIdRef.current);
        fadeIdRef.current = fadeVolume(bg, NORMAL_VOLUME * masterRef.current, 400);
      }
    };

    sfx.play().catch(() => {});
  }, [settings.correctSoundUrl, settings.wrongSoundUrl]);

  // Fade out any playing SFX (e.g. when moving to next question)
  const fadeOutSfx = useCallback((duration = 500) => {
    const sfx = sfxRef.current;
    if (!sfx) return;

    const steps = Math.max(1, Math.round(duration / FADE_STEP_MS));
    const stepSize = sfx.volume / steps;
    let step = 0;
    const id = setInterval(() => {
      step++;
      if (step >= steps || !sfxRef.current) {
        sfx.pause();
        sfxRef.current = null;
        clearInterval(id);
        // Restore bg volume
        const bg = bgRef.current;
        if (bg) {
          if (fadeIdRef.current) clearInterval(fadeIdRef.current);
          fadeIdRef.current = fadeVolume(bg, NORMAL_VOLUME * masterRef.current, 400);
        }
        return;
      }
      sfx.volume = Math.max(0, sfx.volume - stepSize);
    }, FADE_STEP_MS);
  }, []);

  // End-game music
  useEffect(() => {
    if (!isFinished || !settings.endMusicUrl || endPlayedRef.current) return;
    endPlayedRef.current = true;

    // Stop bg
    if (bgRef.current) bgRef.current.pause();

    const audio = new Audio(settings.endMusicUrl);
    audio.volume = 0.7 * masterRef.current;
    endRef.current = audio;
    audio.play().catch(() => {});

    return () => {
      audio.pause();
      endRef.current = null;
    };
  }, [isFinished, settings.endMusicUrl]);

  // Apply master volume / mute changes live
  useEffect(() => {
    const bg = bgRef.current;
    if (bg) {
      if (fadeIdRef.current) clearInterval(fadeIdRef.current);
      const ducked = hasVideo && phase === "reading";
      bg.volume = ducked ? 0 : NORMAL_VOLUME * master;
    }
    if (sfxRef.current) sfxRef.current.volume = 0.8 * master;
    if (endRef.current) endRef.current.volume = 0.7 * master;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [master]);

  // Cleanup all on unmount
  useEffect(() => {
    return () => {
      bgRef.current?.pause();
      sfxRef.current?.pause();
      endRef.current?.pause();
      if (fadeIdRef.current) clearInterval(fadeIdRef.current);
    };
  }, []);

  return { playAnswerSound, fadeOutSfx };
}
