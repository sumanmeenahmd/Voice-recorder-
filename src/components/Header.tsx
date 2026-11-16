import React, { useRef } from 'react';
import { AppView } from '../types/recording';

interface HeaderProps {
  activeView: AppView;
  onSelectView: (view: AppView) => void;
  onImportAudio: (file: File) => void;
  recordingCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  activeView,
  onSelectView,
  onImportAudio,
  recordingCount,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportAudio(file);
      e.target.value = '';
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-[#E4E6EA] bg-[#F6F6F4]/95 backdrop-blur-md dark:border-[#262930] dark:bg-[#111214]/95">
      <div className="mx-auto flex h-12 max-w-[1440px] items-center justify-between gap-8 px-4 sm:px-6 md:h-14 lg:px-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => onSelectView('studio')}
          className="font-display text-lg font-bold tracking-tight text-[#141619] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#E13B2D] dark:text-[#F2F3F5]"
        >
          Cadence
        </button>

        {/* Zone 2: Clean single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
          <button
            type="button"
            onClick={() => onSelectView('studio')}
            className={`relative py-4 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E13B2D] ${
              activeView === 'studio'
                ? 'text-[#141619] dark:text-[#F2F3F5]'
                : 'text-[#646973] hover:text-[#141619] dark:text-[#9CA3AF] dark:hover:text-[#F2F3F5]'
            }`}
          >
            Studio
            {activeView === 'studio' && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#E13B2D]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onSelectView('library')}
            className={`relative py-4 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E13B2D] ${
              activeView === 'library'
                ? 'text-[#141619] dark:text-[#F2F3F5]'
                : 'text-[#646973] hover:text-[#141619] dark:text-[#9CA3AF] dark:hover:text-[#F2F3F5]'
            }`}
          >
            Library{recordingCount > 0 ? ` (${recordingCount})` : ''}
            {activeView === 'library' && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#E13B2D]" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onSelectView('editor')}
            className={`relative py-4 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E13B2D] ${
              activeView === 'editor'
                ? 'text-[#141619] dark:text-[#F2F3F5]'
                : 'text-[#646973] hover:text-[#141619] dark:text-[#9CA3AF] dark:hover:text-[#F2F3F5]'
            }`}
          >
            Audio Editor
            {activeView === 'editor' && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#E13B2D]" />
            )}
          </button>
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="flex items-center shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            className="sr-only"
            aria-label="Import audio file"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[40px] rounded-lg bg-[#141619] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[#2A2E35] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E13B2D] dark:bg-[#F2F3F5] dark:text-[#111214] dark:hover:bg-[#E2E4E9]"
          >
            Import Audio
          </button>
        </div>
      </div>
    </header>
  );
};
