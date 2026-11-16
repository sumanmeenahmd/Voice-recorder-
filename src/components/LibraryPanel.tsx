import React, { useMemo, useState } from 'react';
import { Mic, Pause, Play, Search, Star, Trash2 } from 'lucide-react';
import { RecordingFilter, RecordingItem } from '../types/recording';
import { formatTime, formatTimestamp } from '../utils/audioProcessing';

interface LibraryPanelProps {
  recordings: RecordingItem[];
  selectedId: string | null;
  playingId: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  onSelect: (id: string) => void;
  onTogglePlay: (item: RecordingItem) => void;
  onToggleStar: (item: RecordingItem) => void;
  onDelete: (id: string) => void;
  onSwitchToStudio?: () => void;
  fullWidth?: boolean;
}

const FILTERS: RecordingFilter[] = ['All', 'Starred', 'Meetings', 'Ideas', 'Notes', 'Music'];

export const LibraryPanel: React.FC<LibraryPanelProps> = ({
  recordings,
  selectedId,
  playingId,
  isPlaying,
  isLoading,
  onSelect,
  onTogglePlay,
  onToggleStar,
  onDelete,
  onSwitchToStudio,
  fullWidth = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<RecordingFilter>('All');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const filteredRecordings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return recordings.filter((item) => {
      if (filter === 'Starred' && !item.starred) return false;
      if (
        filter !== 'All' &&
        filter !== 'Starred' &&
        item.category !== filter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.notes.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.markers.some((m) => m.label.toLowerCase().includes(q))
      );
    });
  }, [recordings, searchQuery, filter]);

  const totalDurationSec = useMemo(
    () => recordings.reduce((acc, r) => acc + r.durationSec, 0),
    [recordings]
  );

  return (
    <aside
      aria-label="Recordings Library"
      className={`rounded-2xl border border-[#E4E6EA] bg-white dark:border-[#262930] dark:bg-[#181A1E] ${
        fullWidth ? 'p-6' : 'p-5'
      }`}
    >
      {/* Library Header */}
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-base font-semibold text-[#141619] dark:text-[#F2F3F5]">
          Saved Recordings
        </h2>
        <span className="font-mono text-xs text-[#646973] tabular-nums dark:text-[#9CA3AF]">
          {recordings.length} {recordings.length === 1 ? 'take' : 'takes'} ·{' '}
          {formatTime(totalDurationSec)}
        </span>
      </div>

      {/* Search Input */}
      <div className="relative mt-3.5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8A909B]" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search titles, notes, or markers..."
          aria-label="Search recordings"
          className="min-h-[40px] w-full rounded-lg border border-[#DCDFE4] bg-[#F6F6F4] pl-9 pr-3 text-xs text-[#141619] placeholder:text-[#8A909B] focus:border-[#141619] focus:outline-none dark:border-[#2E323B] dark:bg-[#121417] dark:text-[#F2F3F5] dark:placeholder:text-[#6B7280]"
        />
      </div>

      {/* Segmented Interactive Filter Buttons */}
      <div className="mt-3 flex flex-wrap items-center gap-1 rounded-lg bg-[#F3F4F6] p-1 dark:bg-[#121417]">
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`min-h-[32px] rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-white text-[#141619] shadow-xs dark:bg-[#262930] dark:text-[#F2F3F5]'
                  : 'text-[#646973] hover:text-[#141619] dark:text-[#9CA3AF] dark:hover:text-[#F2F3F5]'
              }`}
            >
              {f}
            </button>
          );
        })}
      </div>

      {/* Recordings List */}
      <div className="mt-4">
        {isLoading ? (
          <div className="space-y-3 py-2">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="h-14 animate-pulse rounded-lg bg-[#F3F4F6] dark:bg-[#22252B]"
              />
            ))}
          </div>
        ) : filteredRecordings.length === 0 ? (
          <div className="py-10 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#F3F4F6] text-[#646973] dark:bg-[#22252B] dark:text-[#9CA3AF]">
              <Mic className="h-4 w-4" />
            </div>
            <p className="mt-3 text-sm font-medium text-[#141619] dark:text-[#F2F3F5]">
              {recordings.length === 0
                ? 'Your library is empty'
                : 'No matching recordings'}
            </p>
            <p className="mt-1 text-xs text-[#646973] dark:text-[#9CA3AF]">
              {recordings.length === 0
                ? 'Press Start Recording or import an audio file to begin.'
                : 'Try adjusting your search text or active category filter.'}
            </p>
            {recordings.length === 0 && onSwitchToStudio && (
              <button
                type="button"
                onClick={onSwitchToStudio}
                className="mt-4 min-h-[40px] rounded-lg bg-[#E13B2D] px-4 py-2 text-xs font-medium text-white hover:bg-[#C83225]"
              >
                Go to Studio Recorder
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-[#ECEDF0] dark:divide-[#262930]">
            {filteredRecordings.map((item) => {
              const isSelected = item.id === selectedId;
              const isItemPlaying = item.id === playingId && isPlaying;
              const isConfirmingDelete = confirmDeleteId === item.id;

              return (
                <li
                  key={item.id}
                  className={`group flex min-h-[60px] items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors ${
                    isSelected
                      ? 'bg-[#F6F6F4] dark:bg-[#22252B]'
                      : 'hover:bg-[#FAFAFA] dark:hover:bg-[#1E2025]'
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(item.id);
                        onTogglePlay(item);
                      }}
                      aria-label={
                        isItemPlaying ? `Pause ${item.title}` : `Play ${item.title}`
                      }
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors ${
                        isItemPlaying
                          ? 'border-[#E13B2D] bg-[#E13B2D] text-white'
                          : 'border-[#DCDFE4] bg-white text-[#141619] hover:border-[#141619] dark:border-[#2E323B] dark:bg-[#121417] dark:text-[#F2F3F5] dark:hover:border-[#9CA3AF]'
                      }`}
                    >
                      {isItemPlaying ? (
                        <Pause className="h-4 w-4 fill-current" />
                      ) : (
                        <Play className="h-4 w-4 translate-x-0.5 fill-current" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onSelect(item.id)}
                      className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-[#E13B2D]"
                    >
                      <div className="truncate text-sm font-medium text-[#141619] dark:text-[#F2F3F5]">
                        {item.title}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-[#646973] dark:text-[#9CA3AF]">
                        <span className="font-mono tabular-nums">
                          {formatTime(item.durationSec)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatTimestamp(item.createdAt)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{item.category}</span>
                      </div>
                    </button>
                  </div>

                  {/* Row Actions */}
                  <div className="flex shrink-0 items-center gap-1">
                    {isConfirmingDelete ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteId(null);
                            onDelete(item.id);
                          }}
                          className="min-h-[36px] rounded-md bg-[#DC2626] px-2.5 text-xs font-medium text-white hover:bg-[#B91C1C]"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-[36px] rounded-md px-2 text-xs text-[#646973] hover:text-[#141619] dark:text-[#9CA3AF] dark:hover:text-[#F2F3F5]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => onToggleStar(item)}
                          aria-label={
                            item.starred ? `Unstar ${item.title}` : `Star ${item.title}`
                          }
                          className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                            item.starred
                              ? 'text-[#D97706] dark:text-[#FBBF24]'
                              : 'text-[#8A909B] hover:text-[#141619] dark:hover:text-[#F2F3F5]'
                          }`}
                        >
                          <Star
                            className={`h-4 w-4 ${item.starred ? 'fill-current' : ''}`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          aria-label={`Delete ${item.title}`}
                          className="flex h-10 w-10 items-center justify-center rounded-lg text-[#8A909B] transition-colors hover:text-[#DC2626]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
};
