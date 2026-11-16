import React, { useEffect, useRef, useState } from 'react';
import {
  Bookmark,
  Headphones,
  Mic,
  Pause,
  Play,
  SlidersHorizontal,
  Square,
  Trash2,
} from 'lucide-react';
import {
  AudioDeviceOption,
  RecorderSettings,
  RecordingCategory,
  RecordingItem,
  RecordingMarker,
} from '../types/recording';
import {
  computeRmsDb,
  decodeAudioMetadataAndPeaks,
  formatTime,
  getSupportedMimeType,
} from '../utils/audioProcessing';
import { WaveformCanvas } from './WaveformCanvas';

interface RecordingDeckProps {
  settings: RecorderSettings;
  onUpdateSettings: (next: RecorderSettings) => void;
  onSaveRecording: (item: RecordingItem) => Promise<void>;
  isDark: boolean;
}

type CaptureStatus = 'idle' | 'recording' | 'paused';

export const RecordingDeck: React.FC<RecordingDeckProps> = ({
  settings,
  onUpdateSettings,
  onSaveRecording,
  isDark,
}) => {
  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [elapsedSec, setElapsedSec] = useState(0);
  const [liveDb, setLiveDb] = useState(-60);
  const [liveBars, setLiveBars] = useState<number[]>([]);
  const [devices, setDevices] = useState<AudioDeviceOption[]>([]);
  const [sampleRate, setSampleRate] = useState<number>(48000);
  const [channelCount, setChannelCount] = useState<number>(1);
  const [category, setCategory] = useState<Exclude<RecordingCategory, 'All'>>('Notes');
  const [takeTitle, setTakeTitle] = useState('');
  const [liveMarkers, setLiveMarkers] = useState<RecordingMarker[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showInputSettings, setShowInputSettings] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const monitorGainRef = useRef<GainNode | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const accumulatedMsRef = useRef<number>(0);
  const statusRef = useRef<CaptureStatus>('idle');
  const discardOnStopRef = useRef<boolean>(false);

  // Sync ref for animation loop
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const refreshDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const inputs = list
        .filter((d) => d.kind === 'audioinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${idx + 1}`,
        }));
      setDevices(inputs);
    } catch {
      // Ignore enumerate failure
    }
  };

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
      cleanupAudioResources();
    };
  }, []);

  // Update monitor gain dynamically if toggled mid-recording
  useEffect(() => {
    if (monitorGainRef.current && audioContextRef.current) {
      monitorGainRef.current.gain.setValueAtTime(
        settings.monitorInput ? 0.85 : 0,
        audioContextRef.current.currentTime
      );
    }
  }, [settings.monitorInput]);

  const cleanupAudioResources = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    monitorGainRef.current = null;
  };

  const startMeterLoop = () => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const buffer = new Uint8Array(analyser.fftSize);
    let lastBarTimestamp = 0;

    const tick = (now: number) => {
      if (statusRef.current === 'idle') return;

      if (statusRef.current === 'recording') {
        const currentTotalMs = accumulatedMsRef.current + (performance.now() - startTimeRef.current);
        setElapsedSec(currentTotalMs / 1000);

        analyser.getByteTimeDomainData(buffer);
        const db = computeRmsDb(buffer);
        setLiveDb(db);

        // Push bar roughly every 60ms (~16 bars/sec) for smooth studio strip chart
        if (now - lastBarTimestamp >= 55) {
          lastBarTimestamp = now;
          const normalized = Math.max(0.04, Math.min(1, (db + 55) / 52));
          setLiveBars((prev) => {
            const next = [...prev, normalized];
            return next.length > 220 ? next.slice(next.length - 220) : next;
          });
        }
      } else {
        setLiveDb(-60);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  const startRecording = async () => {
    setErrorMsg(null);
    discardOnStopRef.current = false;

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMsg('Microphone recording is not supported in this browser.');
      return;
    }

    try {
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
      };
      if (settings.deviceId) {
        audioConstraints.deviceId = { exact: settings.deviceId };
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      mediaStreamRef.current = stream;
      await refreshDevices();

      const track = stream.getAudioTracks()[0];
      const trackSettings = track?.getSettings();
      const detectedChannels = trackSettings?.channelCount ?? 1;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      setSampleRate(ctx.sampleRate);
      setChannelCount(detectedChannels);

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.75;
      analyserRef.current = analyser;

      const monitorGain = ctx.createGain();
      monitorGain.gain.value = settings.monitorInput ? 0.85 : 0;
      monitorGainRef.current = monitorGain;

      source.connect(analyser);
      analyser.connect(monitorGain);
      monitorGain.connect(ctx.destination);

      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        const finalDurationMs = accumulatedMsRef.current;
        const wasDiscarded = discardOnStopRef.current;
        const capturedMarkers = [...liveMarkers];
        const chosenCategory = category;
        const customTitle = takeTitle.trim();
        const actualMime = recorder.mimeType || mimeType || 'audio/webm';

        cleanupAudioResources();
        setStatus('idle');
        setLiveDb(-60);

        if (wasDiscarded || chunksRef.current.length === 0) {
          setElapsedSec(0);
          setLiveBars([]);
          setLiveMarkers([]);
          return;
        }

        const blob = new Blob(chunksRef.current, { type: actualMime });
        setIsSaving(true);
        try {
          let durationSec = Math.max(0.2, finalDurationMs / 1000);
          let peaks: number[] = [];
          let finalRate = ctx.sampleRate || 48000;
          let finalChannels = detectedChannels;

          try {
            const decoded = await decodeAudioMetadataAndPeaks(blob, 140);
            if (Number.isFinite(decoded.durationSec) && decoded.durationSec > 0) {
              durationSec = decoded.durationSec;
            }
            peaks = decoded.peaks;
            finalRate = decoded.sampleRate;
            finalChannels = decoded.channels;
          } catch {
            // Fallback to live captured bars resampled to 140 points
            peaks = resamplePeaks(liveBarsRef.current, 140);
          }

          const now = Date.now();
          const defaultName = `Voice Take ${new Date(now).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}`;

          const newItem: RecordingItem = {
            id: crypto.randomUUID ? crypto.randomUUID() : `rec_${now}_${Math.random().toString(36).slice(2, 8)}`,
            title: customTitle || defaultName,
            createdAt: now,
            updatedAt: now,
            durationSec,
            mimeType: actualMime,
            sizeBytes: blob.size,
            sampleRate: finalRate,
            channels: finalChannels,
            category: chosenCategory,
            starred: false,
            notes: '',
            markers: capturedMarkers,
            peaks,
            blob,
          };

          await onSaveRecording(newItem);
          setTakeTitle('');
          setElapsedSec(0);
          setLiveBars([]);
          setLiveMarkers([]);
        } finally {
          setIsSaving(false);
        }
      };

      mediaRecorderRef.current = recorder;
      accumulatedMsRef.current = 0;
      startTimeRef.current = performance.now();
      setLiveBars([]);
      setLiveMarkers([]);
      setElapsedSec(0);

      recorder.start(250);
      statusRef.current = 'recording';
      setStatus('recording');
      startMeterLoop();
    } catch (err) {
      cleanupAudioResources();
      setStatus('idle');
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access was blocked. Allow microphone permission in your browser settings and try again.'
          : err instanceof DOMException && err.name === 'NotFoundError'
          ? 'No microphone input device was detected on this system.'
          : 'Unable to start audio capture. Check your microphone connection or import an audio file instead.';
      setErrorMsg(message);
    }
  };

  // Keep a ref of liveBars for fallback peak extraction in onstop
  const liveBarsRef = useRef<number[]>([]);
  useEffect(() => {
    liveBarsRef.current = liveBars;
  }, [liveBars]);

  const pauseRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    accumulatedMsRef.current += performance.now() - startTimeRef.current;
    recorder.pause();
    statusRef.current = 'paused';
    setStatus('paused');
  };

  const resumeRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    startTimeRef.current = performance.now();
    recorder.resume();
    statusRef.current = 'recording';
    setStatus('recording');
  };

  const stopAndSave = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    if (status === 'recording') {
      accumulatedMsRef.current += performance.now() - startTimeRef.current;
    }
    discardOnStopRef.current = false;
    recorder.stop();
  };

  const discardRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    discardOnStopRef.current = true;
    recorder.stop();
  };

  const addLiveMarker = () => {
    if (status === 'idle') return;
    const currentSec =
      status === 'recording'
        ? (accumulatedMsRef.current + (performance.now() - startTimeRef.current)) / 1000
        : accumulatedMsRef.current / 1000;
    setLiveMarkers((prev) => [
      ...prev,
      {
        id: `m_${Date.now()}_${prev.length + 1}`,
        timeSec: Number(currentSec.toFixed(2)),
        label: `Marker ${prev.length + 1}`,
      },
    ]);
  };

  const dbPercentage = Math.max(0, Math.min(100, ((liveDb + 60) / 60) * 100));

  return (
    <section
      aria-label="Voice Recorder Deck"
      className="rounded-2xl border border-[#E4E6EA] bg-white p-5 sm:p-6 dark:border-[#262930] dark:bg-[#181A1E]"
    >
      {/* Top Deck Bar: Status & Input Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ECEDF0] pb-4 dark:border-[#262930]">
        <div className="flex items-center gap-3">
          {status === 'recording' ? (
            <span className="inline-flex items-center gap-2 text-xs font-medium text-[#E13B2D]">
              <span className="h-2 w-2 rounded-full bg-[#E13B2D] animate-pulse" />
              Recording
            </span>
          ) : status === 'paused' ? (
            <span className="text-xs font-medium text-[#D97706]">Paused</span>
          ) : (
            <span className="text-xs font-medium text-[#646973] dark:text-[#9CA3AF]">
              Ready to record
            </span>
          )}
          <span aria-hidden="true" className="text-[#D1D5DB] dark:text-[#374151]">
            ·
          </span>
          <span className="font-mono text-xs text-[#646973] tabular-nums dark:text-[#9CA3AF]">
            {(sampleRate / 1000).toFixed(1)} kHz · {channelCount > 1 ? 'Stereo' : 'Mono'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowInputSettings((prev) => !prev)}
            className={`inline-flex min-h-[40px] items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E13B2D] ${
              showInputSettings
                ? 'border-[#141619] bg-[#141619] text-white dark:border-[#F2F3F5] dark:bg-[#F2F3F5] dark:text-[#111214]'
                : 'border-[#E4E6EA] bg-transparent text-[#3B4048] hover:bg-[#F6F6F4] dark:border-[#2E323B] dark:text-[#D1D5DB] dark:hover:bg-[#22252B]'
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Audio Input
          </button>
        </div>
      </div>

      {/* Collapsible Input & Acoustic Processing Drawer */}
      {showInputSettings && (
        <div className="mt-4 grid grid-cols-1 gap-4 rounded-xl bg-[#F6F6F4] p-4 sm:grid-cols-2 dark:bg-[#121417]">
          <div>
            <label
              htmlFor="mic-device-select"
              className="mb-1.5 block text-xs font-medium text-[#4B5058] dark:text-[#9CA3AF]"
            >
              Microphone Source
            </label>
            <select
              id="mic-device-select"
              value={settings.deviceId}
              disabled={status !== 'idle'}
              onChange={(e) =>
                onUpdateSettings({ ...settings, deviceId: e.target.value })
              }
              className="min-h-[40px] w-full rounded-lg border border-[#DCDFE4] bg-white px-3 text-xs text-[#141619] disabled:opacity-60 dark:border-[#2E323B] dark:bg-[#181A1E] dark:text-[#F2F3F5]"
            >
              <option value="">System Default Microphone</option>
              {devices.map((dev) => (
                <option key={dev.deviceId} value={dev.deviceId}>
                  {dev.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            {(
              [
                ['noiseSuppression', 'Noise Suppression'],
                ['echoCancellation', 'Echo Cancel'],
                ['autoGainControl', 'Auto Gain'],
              ] as const
            ).map(([key, label]) => {
              const active = settings[key];
              return (
                <button
                  key={key}
                  type="button"
                  disabled={status !== 'idle'}
                  onClick={() => onUpdateSettings({ ...settings, [key]: !active })}
                  className={`min-h-[40px] rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap disabled:opacity-60 ${
                    active
                      ? 'border-[#141619] bg-[#141619] text-white dark:border-[#F2F3F5] dark:bg-[#F2F3F5] dark:text-[#111214]'
                      : 'border-[#DCDFE4] bg-white text-[#4B5058] hover:text-[#141619] dark:border-[#2E323B] dark:bg-[#181A1E] dark:text-[#9CA3AF]'
                  }`}
                >
                  {label}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ ...settings, monitorInput: !settings.monitorInput })
              }
              title="Listen to microphone through headphones"
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                settings.monitorInput
                  ? 'border-[#E13B2D] bg-[#E13B2D]/10 text-[#E13B2D]'
                  : 'border-[#DCDFE4] bg-white text-[#4B5058] hover:text-[#141619] dark:border-[#2E323B] dark:bg-[#181A1E] dark:text-[#9CA3AF]'
              }`}
            >
              <Headphones className="h-3.5 w-3.5" />
              Monitor
            </button>
          </div>
        </div>
      )}

      {/* Error State */}
      {errorMsg && (
        <div
          role="alert"
          className="mt-4 flex flex-col gap-3 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-4 text-sm text-[#991B1B] sm:flex-row sm:items-center sm:justify-between dark:border-[#7F1D1D] dark:bg-[#2A1215] dark:text-[#FCA5A5]"
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={startRecording}
            className="min-h-[40px] rounded-lg bg-[#991B1B] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#7F1D1D] whitespace-nowrap shrink-0"
          >
            Retry Microphone
          </button>
        </div>
      )}

      {/* Primary Timecode & Take Title Row */}
      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="font-mono text-4xl font-semibold tracking-tight text-[#141619] tabular-nums sm:text-5xl dark:text-[#F2F3F5]">
            {formatTime(elapsedSec, true)}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="h-1.5 w-36 overflow-hidden rounded-full bg-[#ECEEF2] dark:bg-[#262930]">
              <div
                className={`h-full transition-all duration-75 ${
                  liveDb > -6 ? 'bg-[#DC2626]' : 'bg-[#E13B2D]'
                }`}
                style={{ width: `${dbPercentage}%` }}
              />
            </div>
            <span className="font-mono text-xs text-[#646973] tabular-nums dark:text-[#9CA3AF]">
              {status === 'recording' ? `${Math.round(liveDb)} dBFS` : '-∞ dBFS'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <input
            type="text"
            value={takeTitle}
            onChange={(e) => setTakeTitle(e.target.value)}
            placeholder="Name this take (optional)"
            aria-label="Recording title"
            className="min-h-[40px] w-full rounded-lg border border-[#DCDFE4] bg-[#F6F6F4] px-3 text-sm text-[#141619] placeholder:text-[#8A909B] focus:border-[#141619] focus:outline-none sm:w-52 dark:border-[#2E323B] dark:bg-[#121417] dark:text-[#F2F3F5] dark:placeholder:text-[#6B7280] dark:focus:border-[#9CA3AF]"
          />

          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as Exclude<RecordingCategory, 'All'>)
            }
            aria-label="Recording category"
            className="min-h-[40px] rounded-lg border border-[#DCDFE4] bg-[#F6F6F4] px-3 text-xs font-medium text-[#141619] dark:border-[#2E323B] dark:bg-[#121417] dark:text-[#F2F3F5]"
          >
            <option value="Notes">Notes</option>
            <option value="Meetings">Meetings</option>
            <option value="Ideas">Ideas</option>
            <option value="Music">Music</option>
          </select>
        </div>
      </div>

      {/* Live Waveform Display */}
      <div className="mt-5 rounded-xl border border-[#ECEDF0] bg-[#FAFAFA] p-3 dark:border-[#262930] dark:bg-[#121417]">
        <WaveformCanvas
          mode="live"
          liveBars={liveBars}
          isDark={isDark}
          isRecording={status === 'recording'}
          height={128}
        />
      </div>

      {/* Live Markers strip during recording */}
      {liveMarkers.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#646973] dark:text-[#9CA3AF]">
          <span className="font-medium text-[#141619] dark:text-[#F2F3F5]">Markers:</span>
          {liveMarkers.map((m) => (
            <span key={m.id} className="font-mono tabular-nums">
              {formatTime(m.timeSec)} · {m.label}
            </span>
          ))}
        </div>
      )}

      {/* Tactile Transport Controls */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        {status === 'idle' ? (
          <button
            type="button"
            disabled={isSaving}
            onClick={startRecording}
            className="inline-flex min-h-[48px] items-center justify-center gap-2.5 rounded-xl bg-[#E13B2D] px-6 py-3 text-sm font-semibold text-white transition-transform hover:bg-[#C83225] active:scale-[0.98] disabled:opacity-60 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E13B2D]"
          >
            <Mic className="h-4 w-4" />
            {isSaving ? 'Saving Take...' : 'Start Recording'}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={stopAndSave}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-[#141619] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#2A2E35] whitespace-nowrap dark:bg-[#F2F3F5] dark:text-[#111214] dark:hover:bg-[#E2E4E9]"
            >
              <Square className="h-4 w-4 fill-current" />
              Stop & Save
            </button>

            {status === 'recording' ? (
              <button
                type="button"
                onClick={pauseRecording}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-[#DCDFE4] bg-white px-4 py-3 text-sm font-medium text-[#141619] transition-colors hover:bg-[#F6F6F4] whitespace-nowrap dark:border-[#2E323B] dark:bg-[#1E2025] dark:text-[#F2F3F5] dark:hover:bg-[#262930]"
              >
                <Pause className="h-4 w-4" />
                Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={resumeRecording}
                className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-[#E13B2D] bg-[#E13B2D]/10 px-4 py-3 text-sm font-medium text-[#E13B2D] transition-colors hover:bg-[#E13B2D]/15 whitespace-nowrap"
              >
                <Play className="h-4 w-4 fill-current" />
                Resume
              </button>
            )}

            <button
              type="button"
              onClick={addLiveMarker}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-[#DCDFE4] bg-white px-4 py-3 text-sm font-medium text-[#141619] transition-colors hover:bg-[#F6F6F4] whitespace-nowrap dark:border-[#2E323B] dark:bg-[#1E2025] dark:text-[#F2F3F5] dark:hover:bg-[#262930]"
            >
              <Bookmark className="h-4 w-4" />
              Mark Time
            </button>

            <button
              type="button"
              onClick={discardRecording}
              aria-label="Discard current recording"
              className="inline-flex min-h-[48px] items-center gap-1.5 rounded-xl px-3.5 py-3 text-sm font-medium text-[#646973] transition-colors hover:bg-[#FEE2E2] hover:text-[#DC2626] whitespace-nowrap dark:text-[#9CA3AF] dark:hover:bg-[#3B181A] dark:hover:text-[#FCA5A5]"
            >
              <Trash2 className="h-4 w-4" />
              Discard
            </button>
          </div>
        )}

        <p className="text-xs text-[#646973] dark:text-[#9CA3AF]">
          Saved locally in your browser · Export as WAV anytime
        </p>
      </div>
    </section>
  );
};

function resamplePeaks(bars: number[], targetCount: number): number[] {
  if (bars.length === 0) return new Array(targetCount).fill(0.08);
  const out: number[] = [];
  for (let i = 0; i < targetCount; i++) {
    const idx = Math.floor((i / targetCount) * bars.length);
    out.push(bars[idx] ?? 0.08);
  }
  return out;
}
