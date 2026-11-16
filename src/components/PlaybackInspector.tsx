import React, { useState } from 'react';
import {
  BookmarkPlus,
  Check,
  Download,
  Pause,
  Pencil,
  Play,
  Repeat,
  RotateCcw,
  RotateCw,
  Scissors,
  Star,
  Volume2,
  X,
} from 'lucide-react';
import { RecordingCategory, RecordingItem } from '../types/recording';
import {
  convertBlobToWav,
  formatBytes,
  formatTime,
  formatTimestamp,
  getExtensionFromMime,
} from '../utils/audioProcessing';
import { WaveformCanvas } from './WaveformCanvas';

interface PlaybackInspectorProps {
  recording: RecordingItem | null;
  isPlaying: boolean;
  isActiveTrack: boolean;
  currentTime: number;
  playbackRate: number;
  volume: number;
  isLooping: boolean;
  isDark: boolean;
  onTogglePlay: (item: RecordingItem) => void;
  onSeek: (item: RecordingItem, timeSec: number) => void;
  onSkip: (item: RecordingItem, deltaSec: number) => void;
  onChangeRate: (rate: number) => void;
  onChangeVolume: (vol: number) => void;
  onToggleLoop: () => void;
  onUpdateRecording: (updated: RecordingItem) => Promise<void>;
  onOpenInEditor: (id: string) => void;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2];

export const PlaybackInspector: React.FC<PlaybackInspectorProps> = ({
  recording,
  isPlaying,
  isActiveTrack,
  currentTime,
  playbackRate,
  volume,
  isLooping,
  isDark,
  onTogglePlay,
  onSeek,
  onSkip,
  onChangeRate,
  onChangeVolume,
  onToggleLoop,
  onUpdateRecording,
  onOpenInEditor,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [markerLabel, setMarkerLabel] = useState('');
  const [isExportingWav, setIsExportingWav] = useState(false);

  if (!recording) {
    return (
      <section
        aria-label="Take Inspector"
        className="rounded-2xl border border-[#E4E6EA] bg-white p-6 text-center dark:border-[#262930] dark:bg-[#181A1E]"
      >
        <p className="text-sm font-medium text-[#141619] dark:text-[#F2F3F5]">
          No recording selected
        </p>
        <p className="mt-1 text-xs text-[#646973] dark:text-[#9CA3AF]">
          Record a new take above or choose an existing recording from your library to inspect, scrub, add markers, or export.
        </p>
      </section>
    );
  }

  const displayTime = isActiveTrack ? currentTime : 0;

  const beginRename = () => {
    setTitleDraft(recording.title);
    setIsEditingTitle(true);
  };

  const commitRename = async () => {
    const trimmed = titleDraft.trim();
    setIsEditingTitle(false);
    if (trimmed && trimmed !== recording.title) {
      await onUpdateRecording({
        ...recording,
        title: trimmed,
        updatedAt: Date.now(),
      });
    }
  };

  const handleToggleStar = async () => {
    await onUpdateRecording({
      ...recording,
      starred: !recording.starred,
      updatedAt: Date.now(),
    });
  };

  const handleCategoryChange = async (nextCat: Exclude<RecordingCategory, 'All'>) => {
    await onUpdateRecording({
      ...recording,
      category: nextCat,
      updatedAt: Date.now(),
    });
  };

  const handleNotesBlur = async (value: string) => {
    if (value !== recording.notes) {
      await onUpdateRecording({
        ...recording,
        notes: value,
        updatedAt: Date.now(),
      });
    }
  };

  const handleAddMarker = async (e: React.FormEvent) => {
    e.preventDefault();
    const timeSec = Number(displayTime.toFixed(2));
    const label = markerLabel.trim() || `Marker ${recording.markers.length + 1}`;
    const nextMarkers = [
      ...recording.markers,
      { id: `m_${Date.now()}`, timeSec, label },
    ].sort((a, b) => a.timeSec - b.timeSec);

    setMarkerLabel('');
    await onUpdateRecording({
      ...recording,
      markers: nextMarkers,
      updatedAt: Date.now(),
    });
  };

  const handleRemoveMarker = async (markerId: string) => {
    await onUpdateRecording({
      ...recording,
      markers: recording.markers.filter((m) => m.id !== markerId),
      updatedAt: Date.now(),
    });
  };

  const triggerDownload = (blob: Blob, ext: string) => {
    const safeName = recording.title
      .replace(/[^a-z0-9\-_\s]/gi, '')
      .trim()
      .replace(/\s+/g, '_') || 'recording';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadOriginal = () => {
    const ext = getExtensionFromMime(recording.mimeType);
    triggerDownload(recording.blob, ext);
  };

  const handleDownloadWav = async () => {
    setIsExportingWav(true);
    try {
      const wavBlob = await convertBlobToWav(recording.blob);
      triggerDownload(wavBlob, 'wav');
    } catch {
      // Fallback to original format if decode fails
      handleDownloadOriginal();
    } finally {
      setIsExportingWav(false);
    }
  };

  return (
    <section
      aria-label="Active Recording Player"
      className="rounded-2xl border border-[#E4E6EA] bg-white p-5 sm:p-6 dark:border-[#262930] dark:bg-[#181A1E]"
    >
      {/* Header Row: Editable Title + Unboxed Metadata */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setIsEditingTitle(false);
                }}
                onBlur={commitRename}
                className="min-h-[40px] w-full max-w-sm rounded-lg border border-[#141619] bg-[#F6F6F4] px-3 text-base font-semibold text-[#141619] focus:outline-none dark:border-[#F2F3F5] dark:bg-[#121417] dark:text-[#F2F3F5]"
              />
              <button
                type="button"
                onClick={commitRename}
                aria-label="Save title"
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#141619] text-white dark:bg-[#F2F3F5] dark:text-[#111214]"
              >
                <Check className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="truncate font-display text-lg font-semibold text-[#141619] dark:text-[#F2F3F5]">
                {recording.title}
              </h2>
              <button
                type="button"
                onClick={beginRename}
                aria-label="Rename recording"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[#646973] transition-colors hover:bg-[#F6F6F4] hover:text-[#141619] dark:text-[#9CA3AF] dark:hover:bg-[#22252B] dark:hover:text-[#F2F3F5]"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Unboxed clean metadata with typographic separators */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#646973] dark:text-[#9CA3AF]">
            <span>{formatTimestamp(recording.createdAt)}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{formatTime(recording.durationSec)}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {(recording.sampleRate / 1000).toFixed(1)} kHz
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{formatBytes(recording.sizeBytes)}</span>
          </div>
        </div>

        {/* Right Actions: Category, Star, Trim */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={recording.category}
            onChange={(e) =>
              handleCategoryChange(e.target.value as Exclude<RecordingCategory, 'All'>)
            }
            aria-label="Category"
            className="min-h-[40px] rounded-lg border border-[#DCDFE4] bg-[#F6F6F4] px-3 text-xs font-medium text-[#141619] dark:border-[#2E323B] dark:bg-[#121417] dark:text-[#F2F3F5]"
          >
            <option value="Notes">Notes</option>
            <option value="Meetings">Meetings</option>
            <option value="Ideas">Ideas</option>
            <option value="Music">Music</option>
          </select>

          <button
            type="button"
            onClick={handleToggleStar}
            aria-label={recording.starred ? 'Remove from starred' : 'Star recording'}
            className={`flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg border transition-colors ${
              recording.starred
                ? 'border-[#D97706]/40 bg-[#FEF3C7]/60 text-[#D97706] dark:bg-[#D97706]/15 dark:text-[#FBBF24]'
                : 'border-[#DCDFE4] text-[#646973] hover:text-[#141619] dark:border-[#2E323B] dark:text-[#9CA3AF] dark:hover:text-[#F2F3F5]'
            }`}
          >
            <Star className={`h-4 w-4 ${recording.starred ? 'fill-current' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => onOpenInEditor(recording.id)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#DCDFE4] px-3 py-2 text-xs font-medium text-[#141619] transition-colors hover:bg-[#F6F6F4] whitespace-nowrap dark:border-[#2E323B] dark:text-[#F2F3F5] dark:hover:bg-[#22252B]"
          >
            <Scissors className="h-3.5 w-3.5" />
            Trim Audio
          </button>
        </div>
      </div>

      {/* Interactive Scrubber Waveform */}
      <div className="mt-5 rounded-xl border border-[#ECEDF0] bg-[#FAFAFA] p-3 dark:border-[#262930] dark:bg-[#121417]">
        <WaveformCanvas
          mode="playback"
          peaks={recording.peaks}
          currentTime={displayTime}
          duration={recording.durationSec}
          markers={recording.markers}
          onSeek={(t) => onSeek(recording, t)}
          isDark={isDark}
          height={112}
        />
        <div className="mt-2 flex items-center justify-between font-mono text-xs text-[#646973] tabular-nums dark:text-[#9CA3AF]">
          <span>{formatTime(displayTime, true)}</span>
          <span>{formatTime(recording.durationSec, true)}</span>
        </div>
      </div>

      {/* Transport & Speed Controls */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSkip(recording, -5)}
            aria-label="Skip backward 5 seconds"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#DCDFE4] text-[#3B4048] transition-colors hover:bg-[#F6F6F4] dark:border-[#2E323B] dark:text-[#D1D5DB] dark:hover:bg-[#22252B]"
          >
            <RotateCcw className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => onTogglePlay(recording)}
            aria-label={isActiveTrack && isPlaying ? 'Pause' : 'Play'}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[#141619] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2A2E35] whitespace-nowrap dark:bg-[#F2F3F5] dark:text-[#111214] dark:hover:bg-[#E2E4E9]"
          >
            {isActiveTrack && isPlaying ? (
              <>
                <Pause className="h-4 w-4 fill-current" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-current" />
                Play
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onSkip(recording, 5)}
            aria-label="Skip forward 5 seconds"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[#DCDFE4] text-[#3B4048] transition-colors hover:bg-[#F6F6F4] dark:border-[#2E323B] dark:text-[#D1D5DB] dark:hover:bg-[#22252B]"
          >
            <RotateCw className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onToggleLoop}
            aria-label="Toggle loop playback"
            aria-pressed={isLooping}
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border transition-colors ${
              isLooping
                ? 'border-[#E13B2D] bg-[#E13B2D]/10 text-[#E13B2D]'
                : 'border-[#DCDFE4] text-[#646973] hover:text-[#141619] dark:border-[#2E323B] dark:text-[#9CA3AF] dark:hover:text-[#F2F3F5]'
            }`}
          >
            <Repeat className="h-4 w-4" />
          </button>
        </div>

        {/* Speed Segmented Control & Volume */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1 rounded-lg bg-[#F3F4F6] p-1 dark:bg-[#121417]">
            {SPEED_OPTIONS.map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => onChangeRate(rate)}
                className={`min-h-[32px] rounded-md px-2.5 font-mono text-xs font-medium transition-colors whitespace-nowrap ${
                  playbackRate === rate
                    ? 'bg-white text-[#141619] shadow-xs dark:bg-[#262930] dark:text-[#F2F3F5]'
                    : 'text-[#646973] hover:text-[#141619] dark:text-[#9CA3AF] dark:hover:text-[#F2F3F5]'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[#4B5058] dark:text-[#9CA3AF]">
            <Volume2 className="h-4 w-4 shrink-0" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={volume}
              onChange={(e) => onChangeVolume(parseFloat(e.target.value))}
              aria-label="Playback volume"
              className="studio-slider w-20 text-[#141619] dark:text-[#F2F3F5]"
            />
          </div>
        </div>
      </div>

      {/* Divider */}
      <hr className="my-6 border-[#ECEDF0] dark:border-[#262930]" />

      {/* Two-Column Details: Markers & Notes + Export */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Timestamped Markers */}
        <div>
          <h3 className="text-xs font-semibold text-[#141619] dark:text-[#F2F3F5]">
            Timestamp Markers
          </h3>
          <form onSubmit={handleAddMarker} className="mt-2.5 flex items-center gap-2">
            <input
              type="text"
              value={markerLabel}
              onChange={(e) => setMarkerLabel(e.target.value)}
              placeholder={`Add marker at ${formatTime(displayTime)}`}
              className="min-h-[40px] flex-1 rounded-lg border border-[#DCDFE4] bg-[#F6F6F4] px-3 text-xs text-[#141619] placeholder:text-[#8A909B] focus:border-[#141619] focus:outline-none dark:border-[#2E323B] dark:bg-[#121417] dark:text-[#F2F3F5] dark:placeholder:text-[#6B7280]"
            />
            <button
              type="submit"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#DCDFE4] px-3 text-xs font-medium text-[#141619] transition-colors hover:bg-[#F6F6F4] whitespace-nowrap dark:border-[#2E323B] dark:text-[#F2F3F5] dark:hover:bg-[#22252B]"
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              Add
            </button>
          </form>

          {recording.markers.length === 0 ? (
            <p className="mt-3 text-xs text-[#646973] dark:text-[#9CA3AF]">
              No markers yet. Scrub to any moment and add a marker to jump back quickly.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[#ECEDF0] dark:divide-[#262930]">
              {recording.markers.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                  <button
                    type="button"
                    onClick={() => onSeek(recording, m.timeSec)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left hover:text-[#E13B2D]"
                  >
                    <span className="font-mono text-xs font-medium text-[#D97706] tabular-nums">
                      {formatTime(m.timeSec)}
                    </span>
                    <span className="truncate text-xs text-[#141619] dark:text-[#F2F3F5]">
                      {m.label}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveMarker(m.id)}
                    aria-label={`Remove marker ${m.label}`}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-[#8A909B] hover:text-[#DC2626]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Notes & Export */}
        <div className="flex flex-col justify-between gap-4">
          <div>
            <label
              htmlFor="recording-notes"
              className="block text-xs font-semibold text-[#141619] dark:text-[#F2F3F5]"
            >
              Session Notes
            </label>
            <textarea
              id="recording-notes"
              key={recording.id}
              defaultValue={recording.notes}
              onBlur={(e) => handleNotesBlur(e.target.value)}
              rows={3}
              placeholder="Write key takeaways, context, or speaker notes..."
              className="mt-2.5 w-full rounded-lg border border-[#DCDFE4] bg-[#F6F6F4] p-3 text-xs leading-relaxed text-[#141619] placeholder:text-[#8A909B] focus:border-[#141619] focus:outline-none dark:border-[#2E323B] dark:bg-[#121417] dark:text-[#F2F3F5] dark:placeholder:text-[#6B7280]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isExportingWav}
              onClick={handleDownloadWav}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#141619] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#2A2E35] disabled:opacity-60 whitespace-nowrap dark:bg-[#F2F3F5] dark:text-[#111214] dark:hover:bg-[#E2E4E9]"
            >
              <Download className="h-3.5 w-3.5" />
              {isExportingWav ? 'Encoding WAV...' : 'Export WAV'}
            </button>

            <button
              type="button"
              onClick={handleDownloadOriginal}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#DCDFE4] px-3.5 py-2 text-xs font-medium text-[#3B4048] transition-colors hover:bg-[#F6F6F4] whitespace-nowrap dark:border-[#2E323B] dark:text-[#D1D5DB] dark:hover:bg-[#22252B]"
            >
              <Download className="h-3.5 w-3.5" />
              Download .{getExtensionFromMime(recording.mimeType).toUpperCase()}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
