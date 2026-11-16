import React, { useCallback, useEffect, useState } from 'react';
import { Library, Mic, Moon, Scissors, Sun } from 'lucide-react';
import { AudioEditorView } from './components/AudioEditorView';
import { Header } from './components/Header';
import { LibraryPanel } from './components/LibraryPanel';
import { PlaybackInspector } from './components/PlaybackInspector';
import { RecordingDeck } from './components/RecordingDeck';
import { useAudioPlayer } from './hooks/useAudioPlayer';
import { AppView, RecorderSettings, RecordingItem } from './types/recording';
import { decodeAudioMetadataAndPeaks } from './utils/audioProcessing';
import {
  getAllRecordings,
  loadRecorderSettings,
  loadThemePreference,
  putRecording,
  removeRecording,
  saveRecorderSettings,
  saveThemePreference,
} from './utils/storage';

export default function App() {
  const [recordings, setRecordings] = useState<RecordingItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<AppView>('studio');
  const [isLoading, setIsLoading] = useState(true);
  const [importError, setImportError] = useState<string | null>(null);
  const [settings, setSettings] = useState<RecorderSettings>(() => loadRecorderSettings());
  const [theme, setTheme] = useState<'light' | 'dark'>(() => loadThemePreference());

  const player = useAudioPlayer(recordings);

  // Sync theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    saveThemePreference(theme);
  }, [theme]);

  // Hydrate recordings from IndexedDB
  useEffect(() => {
    let mounted = true;
    getAllRecordings()
      .then((items) => {
        if (!mounted) return;
        setRecordings(items);
        if (items.length > 0) {
          setSelectedId(items[0].id);
        }
      })
      .catch(() => {
        // Leave empty if IndexedDB is blocked
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleUpdateSettings = useCallback((next: RecorderSettings) => {
    setSettings(next);
    saveRecorderSettings(next);
  }, []);

  const handleSaveNewRecording = useCallback(async (item: RecordingItem) => {
    await putRecording(item);
    setRecordings((prev) => [item, ...prev]);
    setSelectedId(item.id);
  }, []);

  const handleUpdateRecording = useCallback(
    async (updated: RecordingItem) => {
      await putRecording(updated);
      setRecordings((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item))
      );
      player.reloadRecordingBlob(updated);
    },
    [player]
  );

  const handleDeleteRecording = useCallback(
    async (id: string) => {
      await removeRecording(id);
      setRecordings((prev) => {
        const next = prev.filter((item) => item.id !== id);
        if (selectedId === id) {
          setSelectedId(next[0]?.id ?? null);
        }
        return next;
      });
    },
    [selectedId]
  );

  const handleToggleStar = useCallback(
    async (item: RecordingItem) => {
      await handleUpdateRecording({
        ...item,
        starred: !item.starred,
        updatedAt: Date.now(),
      });
    },
    [handleUpdateRecording]
  );

  const handleImportAudio = useCallback(async (file: File) => {
    setImportError(null);
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|m4a|ogg|webm|aac|flac)$/i.test(file.name)) {
      setImportError('Please select a supported audio file (MP3, WAV, M4A, OGG, or WebM).');
      return;
    }

    try {
      const decoded = await decodeAudioMetadataAndPeaks(file, 140);
      const now = Date.now();
      const cleanName = file.name.replace(/\.[^/.]+$/, '') || 'Imported Audio';
      const item: RecordingItem = {
        id: crypto.randomUUID
          ? crypto.randomUUID()
          : `imp_${now}_${Math.random().toString(36).slice(2, 8)}`,
        title: cleanName,
        createdAt: now,
        updatedAt: now,
        durationSec: decoded.durationSec,
        mimeType: file.type || 'audio/mpeg',
        sizeBytes: file.size,
        sampleRate: decoded.sampleRate,
        channels: decoded.channels,
        category: 'Notes',
        starred: false,
        notes: '',
        markers: [],
        peaks: decoded.peaks,
        blob: file,
      };
      await putRecording(item);
      setRecordings((prev) => [item, ...prev]);
      setSelectedId(item.id);
      setActiveView('studio');
    } catch {
      setImportError('Could not decode that audio file. Try a standard WAV, MP3, or WebM file.');
    }
  }, []);

  const selectedRecording =
    recordings.find((r) => r.id === selectedId) ?? recordings[0] ?? null;

  // Spacebar shortcut to toggle play/pause on selected take
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        tag === 'button' ||
        target?.isContentEditable
      ) {
        return;
      }
      if (selectedRecording && activeView !== 'editor') {
        e.preventDefault();
        player.togglePlay(selectedRecording);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedRecording, activeView, player]);

  const isDark = theme === 'dark';

  return (
    <div className="min-h-screen bg-[#F6F6F4] text-[#141619] transition-colors dark:bg-[#111214] dark:text-[#F2F3F5]">
      <Header
        activeView={activeView}
        onSelectView={(v) => {
          player.pause();
          setActiveView(v);
        }}
        onImportAudio={handleImportAudio}
        recordingCount={recordings.length}
      />

      <main className="mx-auto max-w-[1440px] px-4 pb-20 pt-6 sm:px-6 md:pb-12 lg:px-8">
        {/* Workspace Toolbar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#141619] text-balance dark:text-[#F2F3F5]">
              {activeView === 'studio'
                ? 'Voice Studio'
                : activeView === 'library'
                ? 'Recordings Library'
                : 'Audio Editor'}
            </h1>
            <p className="mt-0.5 text-sm text-[#646973] dark:text-[#9CA3AF]">
              {activeView === 'studio'
                ? 'Capture crystal-clear voice memos, place live timestamp markers, and export lossless WAV.'
                : activeView === 'library'
                ? 'Browse, search, organize, and play back all locally saved recordings.'
                : 'Trim start and end boundaries, normalize volume, and export clean takes.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-[#E4E6EA] bg-white px-3.5 py-2 text-xs font-medium text-[#3B4048] transition-colors hover:bg-[#FAFAFA] whitespace-nowrap shrink-0 dark:border-[#262930] dark:bg-[#181A1E] dark:text-[#D1D5DB] dark:hover:bg-[#22252B]"
          >
            {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
            {isDark ? 'Light Surface' : 'Dark Studio'}
          </button>
        </div>

        {importError && (
          <div
            role="alert"
            className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] px-4 py-3 text-xs font-medium text-[#991B1B] dark:border-[#7F1D1D] dark:bg-[#2A1215] dark:text-[#FCA5A5]"
          >
            <span>{importError}</span>
            <button
              type="button"
              onClick={() => setImportError(null)}
              className="underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Active View Content */}
        {activeView === 'studio' && (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-7">
              <RecordingDeck
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
                onSaveRecording={handleSaveNewRecording}
                isDark={isDark}
              />

              <PlaybackInspector
                recording={selectedRecording}
                isPlaying={player.isPlaying}
                isActiveTrack={player.playingId === selectedRecording?.id}
                currentTime={player.currentTime}
                playbackRate={player.playbackRate}
                volume={player.volume}
                isLooping={player.isLooping}
                isDark={isDark}
                onTogglePlay={player.togglePlay}
                onSeek={player.seekTo}
                onSkip={player.skipBy}
                onChangeRate={player.setPlaybackRate}
                onChangeVolume={player.setVolume}
                onToggleLoop={() => player.setIsLooping((p) => !p)}
                onUpdateRecording={handleUpdateRecording}
                onOpenInEditor={(id) => {
                  player.pause();
                  setSelectedId(id);
                  setActiveView('editor');
                }}
              />
            </div>

            <div className="lg:col-span-5">
              <LibraryPanel
                recordings={recordings}
                selectedId={selectedRecording?.id ?? null}
                playingId={player.playingId}
                isPlaying={player.isPlaying}
                isLoading={isLoading}
                onSelect={(id) => setSelectedId(id)}
                onTogglePlay={player.togglePlay}
                onToggleStar={handleToggleStar}
                onDelete={handleDeleteRecording}
              />
            </div>
          </div>
        )}

        {activeView === 'library' && (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            <div className="lg:col-span-6">
              <LibraryPanel
                recordings={recordings}
                selectedId={selectedRecording?.id ?? null}
                playingId={player.playingId}
                isPlaying={player.isPlaying}
                isLoading={isLoading}
                onSelect={(id) => setSelectedId(id)}
                onTogglePlay={player.togglePlay}
                onToggleStar={handleToggleStar}
                onDelete={handleDeleteRecording}
                onSwitchToStudio={() => setActiveView('studio')}
                fullWidth
              />
            </div>
            <div className="lg:col-span-6">
              <PlaybackInspector
                recording={selectedRecording}
                isPlaying={player.isPlaying}
                isActiveTrack={player.playingId === selectedRecording?.id}
                currentTime={player.currentTime}
                playbackRate={player.playbackRate}
                volume={player.volume}
                isLooping={player.isLooping}
                isDark={isDark}
                onTogglePlay={player.togglePlay}
                onSeek={player.seekTo}
                onSkip={player.skipBy}
                onChangeRate={player.setPlaybackRate}
                onChangeVolume={player.setVolume}
                onToggleLoop={() => player.setIsLooping((p) => !p)}
                onUpdateRecording={handleUpdateRecording}
                onOpenInEditor={(id) => {
                  player.pause();
                  setSelectedId(id);
                  setActiveView('editor');
                }}
              />
            </div>
          </div>
        )}

        {activeView === 'editor' && (
          <AudioEditorView
            recordings={recordings}
            selectedId={selectedRecording?.id ?? null}
            onSelectRecording={(id) => setSelectedId(id)}
            onSaveNewTake={handleSaveNewRecording}
            onOverwriteTake={handleUpdateRecording}
            onSwitchToStudio={() => setActiveView('studio')}
            isDark={isDark}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (48px compact height to respect <=15% sticky viewport cap) */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed bottom-0 left-0 right-0 z-30 grid h-12 grid-cols-3 border-t border-[#E4E6EA] bg-[#F6F6F4]/95 backdrop-blur-md md:hidden dark:border-[#262930] dark:bg-[#111214]/95"
      >
        {(
          [
            { id: 'studio', label: 'Studio', Icon: Mic },
            { id: 'library', label: 'Library', Icon: Library },
            { id: 'editor', label: 'Editor', Icon: Scissors },
          ] as const
        ).map(({ id, label, Icon }) => {
          const active = activeView === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                player.pause();
                setActiveView(id);
              }}
              className={`flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                active
                  ? 'text-[#E13B2D]'
                  : 'text-[#646973] dark:text-[#9CA3AF]'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
