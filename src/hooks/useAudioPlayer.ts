import { useCallback, useEffect, useRef, useState } from 'react';
import { RecordingItem } from '../types/recording';

export function useAudioPlayer(recordings: RecordingItem[]) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const loadedIdRef = useRef<string | null>(null);

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [isLooping, setIsLooping] = useState(false);

  const cleanupUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audioRef.current = audio;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    };
    const handleEnded = () => {
      if (!audio.loop) {
        setIsPlaying(false);
        setCurrentTime(0);
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      cleanupUrl();
    };
  }, [cleanupUrl]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.loop = isLooping;
    }
  }, [isLooping]);

  const loadRecording = useCallback(
    (item: RecordingItem, autoPlay = false) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (loadedIdRef.current !== item.id) {
        audio.pause();
        cleanupUrl();
        const url = URL.createObjectURL(item.blob);
        objectUrlRef.current = url;
        loadedIdRef.current = item.id;
        audio.src = url;
        audio.playbackRate = playbackRate;
        audio.volume = volume;
        audio.loop = isLooping;
        setPlayingId(item.id);
        setCurrentTime(0);
        setDuration(item.durationSec);
      }

      if (autoPlay) {
        audio.play().catch(() => setIsPlaying(false));
      }
    },
    [cleanupUrl, isLooping, playbackRate, volume]
  );

  // Reload if current playing item's blob changed (e.g. overwritten in editor)
  const reloadRecordingBlob = useCallback(
    (item: RecordingItem) => {
      if (loadedIdRef.current === item.id && audioRef.current) {
        audioRef.current.pause();
        cleanupUrl();
        const url = URL.createObjectURL(item.blob);
        objectUrlRef.current = url;
        audioRef.current.src = url;
        setCurrentTime(0);
        setDuration(item.durationSec);
        setIsPlaying(false);
      }
    },
    [cleanupUrl]
  );

  // Stop playback if loaded recording was deleted
  useEffect(() => {
    if (playingId && !recordings.some((r) => r.id === playingId)) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.removeAttribute('src');
      }
      cleanupUrl();
      loadedIdRef.current = null;
      setPlayingId(null);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    }
  }, [recordings, playingId, cleanupUrl]);

  const togglePlay = useCallback(
    (item: RecordingItem) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (loadedIdRef.current !== item.id) {
        loadRecording(item, true);
        return;
      }
      if (audio.paused) {
        audio.play().catch(() => setIsPlaying(false));
      } else {
        audio.pause();
      }
    },
    [loadRecording]
  );

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const seekTo = useCallback((item: RecordingItem, timeSec: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (loadedIdRef.current !== item.id) {
      loadRecording(item, false);
    }
    const maxDur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : item.durationSec;
    const clamped = Math.max(0, Math.min(timeSec, maxDur));
    audio.currentTime = clamped;
    setCurrentTime(clamped);
  }, [loadRecording]);

  const skipBy = useCallback(
    (item: RecordingItem, deltaSec: number) => {
      const base = loadedIdRef.current === item.id ? currentTime : 0;
      seekTo(item, base + deltaSec);
    },
    [currentTime, seekTo]
  );

  return {
    playingId,
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    setPlaybackRate,
    volume,
    setVolume,
    isLooping,
    setIsLooping,
    loadRecording,
    reloadRecordingBlob,
    togglePlay,
    pause,
    seekTo,
    skipBy,
  };
}
