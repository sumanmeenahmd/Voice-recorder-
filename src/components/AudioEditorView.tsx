import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy, Pause, Play, RotateCcw, Scissors } from 'lucide-react';
import { RecordingItem } from '../types/recording';
import { formatTime, trimAndProcessAudioBlob } from '../utils/audioProcessing';
import { WaveformCanvas } from './WaveformCanvas';

interface AudioEditorViewProps {
  recordings: RecordingItem[];
  selectedId: string | null;
  onSelectRecording: (id: string) => void;
  onSaveNewTake: (item: RecordingItem) => Promise<void>;
  onOverwriteTake: (item: RecordingItem) => Promise<void>;
  onSwitchToStudio: () => void;
  isDark: boolean;
}

export const AudioEditorView: React.FC<AudioEditorViewProps> = ({
  recordings,
  selectedId,
  onSelectRecording,
  onSaveNewTake,
  onOverwriteTake,
  onSwitchToStudio,
  isDark,
}) => {
  const recording = recordings.find((r) => r.id === selectedId) ?? recordings[0] ?? null;

  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(recording?.durationSec ?? 0);
  const [normalize, setNormalize] = useState(false);
  const [gainMultiplier, setGainMultiplier] = useState(1);
  const [fadeInSec, setFadeInSec] = useState(0);
  const [fadeOutSec, setFadeOutSec] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  // Sync trim range when selected recording changes
  useEffect(() => {
    stopPreview();
    if (recording) {
      setTrimStart(0);
      setTrimEnd(recording.durationSec);
      setPreviewTime(0);
      setNormalize(false);
      setGainMultiplier(1);
      setFadeInSec(0);
      setFadeOutSec(0);
      setStatusMessage(null);
    }
  }, [recording?.id]);

  const stopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewPlaying(false);
  };

  useEffect(() => {
    return () => stopPreview();
  }, []);

  if (!recording) {
    return (
      <section className="rounded-2xl border border-[#E4E6EA] bg-white p-10 text-center dark:border-[#262930] dark:bg-[#181A1E]">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#F3F4F6] text-[#646973] dark:bg-[#22252B] dark:text-[#9CA3AF]">
          <Scissors className="h-5 w-5" />
        </div>
        <h2 className="mt-4 font-display text-lg font-semibold text-[#141619] dark:text-[#F2F3F5]">
          No recordings to edit
        </h2>
        <p className="mt-1 text-sm text-[#646973] dark:text-[#9CA3AF]">
          Record a voice memo in the Studio or import an audio file first to trim and process it here.
        </p>
        <button
          type="button"
          onClick={onSwitchToStudio}
          className="mt-5 min-h-[44px] rounded-xl bg-[#E13B2D] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#C83225]"
        >
          Open Studio Recorder
        </button>
      </section>
    );
  }

  const togglePreviewSelection = () => {
    if (previewPlaying) {
      stopPreview();
      return;
    }

    const url = URL.createObjectURL(recording.blob);
    previewUrlRef.current = url;
    const audio = new Audio(url);
    audio.currentTime = trimStart;
    previewAudioRef.current = audio;

    audio.ontimeupdate = () => {
      setPreviewTime(audio.currentTime);
      if (audio.currentTime >= trimEnd) {
        stopPreview();
        setPreviewTime(trimStart);
      }
    };
    audio.onended = () => {
      stopPreview();
      setPreviewTime(trimStart);
    };

    audio.play().then(() => setPreviewPlaying(true)).catch(() => stopPreview());
  };

  const resetControls = () => {
    stopPreview();
    setTrimStart(0);
    setTrimEnd(recording.durationSec);
    setPreviewTime(0);
    setNormalize(false);
    setGainMultiplier(1);
    setFadeInSec(0);
    setFadeOutSec(0);
    setStatusMessage(null);
  };

  const processAndSave = async (overwrite: boolean) => {
    stopPreview();
    setIsProcessing(true);
    setStatusMessage(null);
    try {
      const result = await trimAndProcessAudioBlob(recording.blob, {
        startSec: trimStart,
        endSec: trimEnd,
        normalize,
        fadeInSec,
        fadeOutSec,
        gainMultiplier,
      });

      const updatedMarkers = recording.markers
        .filter((m) => m.timeSec >= trimStart && m.timeSec <= trimEnd)
        .map((m) => ({
          ...m,
          timeSec: Number((m.timeSec - trimStart).toFixed(2)),
        }));

      if (overwrite) {
        const updatedItem: RecordingItem = {
          ...recording,
          blob: result.blob,
          mimeType: 'audio/wav',
          sizeBytes: result.blob.size,
          durationSec: result.durationSec,
          sampleRate: result.sampleRate,
          channels: result.channels,
          peaks: result.peaks,
          markers: updatedMarkers,
          updatedAt: Date.now(),
        };
        await onOverwriteTake(updatedItem);
        setTrimStart(0);
        setTrimEnd(result.durationSec);
        setStatusMessage('Saved changes directly to this take.');
      } else {
        const now = Date.now();
        const newItem: RecordingItem = {
          ...recording,
          id: crypto.randomUUID ? crypto.randomUUID() : `rec_${now}_${Math.random().toString(36).slice(2, 8)}`,
          title: `${recording.title} (Edited)`,
          createdAt: now,
          updatedAt: now,
          blob: result.blob,
          mimeType: 'audio/wav',
          sizeBytes: result.blob.size,
          durationSec: result.durationSec,
          sampleRate: result.sampleRate,
          channels: result.channels,
          peaks: result.peaks,
          markers: updatedMarkers,
        };
        await onSaveNewTake(newItem);
        setStatusMessage('Saved as a new WAV take in your library.');
      }
    } catch {
      setStatusMessage('Unable to process this audio format in your browser.');
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedDuration = Math.max(0, trimEnd - trimStart);

  return (
    <section
      aria-label="Audio Trimmer and Processor"
      className="rounded-2xl border border-[#E4E6EA] bg-white p-5 sm:p-6 dark:border-[#262930] dark:bg-[#181A1E]"
    >
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#ECEDF0] pb-4 dark:border-[#262930]">
        <div>
          <h2 className="font-display text-lg font-semibold text-[#141619] dark:text-[#F2F3F5]">
            Trim & Mastering Editor
          </h2>
          <p className="mt-0.5 text-xs text-[#646973] dark:text-[#9CA3AF]">
            Drag the start and end handles on the waveform, apply fade or volume normalization, and save as lossless WAV.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="editor-take-select" className="text-xs font-medium text-[#646973] dark:text-[#9CA3AF]">
            Take:
          </label>
          <select
            id="editor-take-select"
            value={recording.id}
            onChange={(e) => onSelectRecording(e.target.value)}
            className="min-h-[40px] max-w-[240px] rounded-lg border border-[#DCDFE4] bg-[#F6F6F4] px-3 text-xs font-medium text-[#141619] dark:border-[#2E323B] dark:bg-[#121417] dark:text-[#F2F3F5]"
          >
            {recordings.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title} ({formatTime(r.durationSec)})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Trim Waveform Canvas */}
      <div className="mt-6 rounded-xl border border-[#ECEDF0] bg-[#FAFAFA] p-4 dark:border-[#262930] dark:bg-[#121417]">
        <WaveformCanvas
          mode="trim"
          peaks={recording.peaks}
          currentTime={previewTime}
          duration={recording.durationSec}
          markers={recording.markers}
          trimStartSec={trimStart}
          trimEndSec={trimEnd}
          onTrimChange={(start, end) => {
            setTrimStart(start);
            setTrimEnd(end);
            setPreviewTime(start);
          }}
          onSeek={(t) => {
            setPreviewTime(t);
            if (previewAudioRef.current) {
              previewAudioRef.current.currentTime = t;
            }
          }}
          isDark={isDark}
          height={160}
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-[#646973] tabular-nums dark:text-[#9CA3AF]">
          <span>In: {formatTime(trimStart, true)}</span>
          <span className="font-semibold text-[#141619] dark:text-[#F2F3F5]">
            Selection: {formatTime(selectedDuration, true)}
          </span>
          <span>Out: {formatTime(trimEnd, true)}</span>
        </div>
      </div>

      {/* Fine Controls Grid */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="block text-xs font-medium text-[#4B5058] dark:text-[#9CA3AF]">
            Start Trim (sec)
          </label>
          <input
            type="number"
            min={0}
            max={Math.max(0, trimEnd - 0.25)}
            step={0.1}
            value={Number(trimStart.toFixed(2))}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!Number.isNaN(val)) {
                setTrimStart(Math.max(0, Math.min(val, trimEnd - 0.25)));
              }
            }}
            className="mt-1.5 min-h-[40px] w-full rounded-lg border border-[#DCDFE4] bg-[#F6F6F4] px-3 font-mono text-xs text-[#141619] tabular-nums dark:border-[#2E323B] dark:bg-[#121417] dark:text-[#F2F3F5]"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[#4B5058] dark:text-[#9CA3AF]">
            End Trim (sec)
          </label>
          <input
            type="number"
            min={Math.min(recording.durationSec, trimStart + 0.25)}
            max={recording.durationSec}
            step={0.1}
            value={Number(trimEnd.toFixed(2))}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              if (!Number.isNaN(val)) {
                setTrimEnd(Math.min(recording.durationSec, Math.max(val, trimStart + 0.25)));
              }
            }}
            className="mt-1.5 min-h-[40px] w-full rounded-lg border border-[#DCDFE4] bg-[#F6F6F4] px-3 font-mono text-xs text-[#141619] tabular-nums dark:border-[#2E323B] dark:bg-[#121417] dark:text-[#F2F3F5]"
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-xs font-medium text-[#4B5058] dark:text-[#9CA3AF]">
            <span>Output Gain</span>
            <span className="font-mono tabular-nums">{gainMultiplier.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min={0.4}
            max={2.2}
            step={0.05}
            value={gainMultiplier}
            onChange={(e) => setGainMultiplier(parseFloat(e.target.value))}
            className="studio-slider mt-3.5 w-full text-[#141619] dark:text-[#F2F3F5]"
          />
        </div>

        <div>
          <div className="flex items-center justify-between text-xs font-medium text-[#4B5058] dark:text-[#9CA3AF]">
            <span>Fade In / Out</span>
            <span className="font-mono tabular-nums">
              {fadeInSec.toFixed(1)}s / {fadeOutSec.toFixed(1)}s
            </span>
          </div>
          <div className="mt-2.5 flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={fadeInSec}
              onChange={(e) => setFadeInSec(parseFloat(e.target.value))}
              aria-label="Fade in duration"
              className="studio-slider w-full text-[#141619] dark:text-[#F2F3F5]"
            />
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={fadeOutSec}
              onChange={(e) => setFadeOutSec(parseFloat(e.target.value))}
              aria-label="Fade out duration"
              className="studio-slider w-full text-[#141619] dark:text-[#F2F3F5]"
            />
          </div>
        </div>
      </div>

      {/* Action & Save Row */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[#ECEDF0] pt-5 dark:border-[#262930]">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={togglePreviewSelection}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[#DCDFE4] bg-white px-4 py-2 text-xs font-medium text-[#141619] transition-colors hover:bg-[#F6F6F4] whitespace-nowrap dark:border-[#2E323B] dark:bg-[#1E2025] dark:text-[#F2F3F5] dark:hover:bg-[#262930]"
          >
            {previewPlaying ? (
              <>
                <Pause className="h-3.5 w-3.5 fill-current" />
                Stop Preview
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-current" />
                Preview Selection
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setNormalize((prev) => !prev)}
            className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
              normalize
                ? 'border-[#141619] bg-[#141619] text-white dark:border-[#F2F3F5] dark:bg-[#F2F3F5] dark:text-[#111214]'
                : 'border-[#DCDFE4] text-[#4B5058] hover:text-[#141619] dark:border-[#2E323B] dark:text-[#9CA3AF]'
            }`}
          >
            <Check className="h-3.5 w-3.5" />
            Normalize Peak Volume
          </button>

          <button
            type="button"
            onClick={resetControls}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-[#646973] hover:text-[#141619] whitespace-nowrap dark:text-[#9CA3AF] dark:hover:text-[#F2F3F5]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => processAndSave(true)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[#DCDFE4] px-4 py-2 text-xs font-medium text-[#141619] transition-colors hover:bg-[#F6F6F4] disabled:opacity-60 whitespace-nowrap dark:border-[#2E323B] dark:text-[#F2F3F5] dark:hover:bg-[#22252B]"
          >
            Overwrite Original
          </button>

          <button
            type="button"
            disabled={isProcessing}
            onClick={() => processAndSave(false)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#E13B2D] px-5 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#C83225] disabled:opacity-60 whitespace-nowrap"
          >
            <Copy className="h-3.5 w-3.5" />
            {isProcessing ? 'Rendering WAV...' : 'Save as New Take'}
          </button>
        </div>
      </div>

      {statusMessage && (
        <p className="mt-4 text-xs font-medium text-[#16A34A] dark:text-[#4ADE80]">
          {statusMessage}
        </p>
      )}
    </section>
  );
};
