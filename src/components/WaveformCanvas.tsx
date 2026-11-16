import React, { useEffect, useRef, useState } from 'react';
import { RecordingMarker } from '../types/recording';

interface WaveformCanvasProps {
  mode: 'live' | 'playback' | 'trim';
  peaks?: number[];
  liveBars?: number[];
  currentTime?: number;
  duration?: number;
  markers?: RecordingMarker[];
  onSeek?: (timeSec: number) => void;
  trimStartSec?: number;
  trimEndSec?: number;
  onTrimChange?: (startSec: number, endSec: number) => void;
  isDark?: boolean;
  height?: number;
  isRecording?: boolean;
}

export const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
  mode,
  peaks = [],
  liveBars = [],
  currentTime = 0,
  duration = 0,
  markers = [],
  onSeek,
  trimStartSec = 0,
  trimEndSec = 0,
  onTrimChange,
  isDark = false,
  height = 136,
  isRecording = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | 'seek' | null>(null);
  const [width, setWidth] = useState(600);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setWidth(Math.floor(entry.contentRect.width));
        }
      }
    });
    observer.observe(el);
    setWidth(Math.floor(el.getBoundingClientRect().width) || 600);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const midY = height / 2;

    // Subtle horizontal centerline and dB reference ticks
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(20,22,25,0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    if (mode === 'live') {
      const barWidth = 3;
      const gap = 3;
      const step = barWidth + gap;
      const maxSlots = Math.floor(width / step);
      const visibleBars = liveBars.slice(-maxSlots);

      for (let i = 0; i < visibleBars.length; i++) {
        const amp = Math.max(0.04, Math.min(1, visibleBars[i]));
        const barH = Math.max(4, amp * (height - 24));
        const x = width - (visibleBars.length - i) * step;
        const y = midY - barH / 2;

        ctx.fillStyle = isRecording
          ? amp > 0.88
            ? '#DC2626'
            : '#E13B2D'
          : isDark
          ? '#6B7280'
          : '#9CA3AF';
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barH, 1.5);
        ctx.fill();
      }

      // Active recording cursor line on right edge
      if (isRecording) {
        ctx.strokeStyle = '#E13B2D';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(width - 1.5, 8);
        ctx.lineTo(width - 1.5, height - 8);
        ctx.stroke();
      }
      return;
    }

    // Playback or Trim mode
    const barCount = Math.max(1, peaks.length);
    const totalStep = width / barCount;
    const barWidth = Math.max(2, Math.min(4.5, totalStep * 0.62));
    const progressRatio = duration > 0 ? Math.max(0, Math.min(1, currentTime / duration)) : 0;
    const trimStartRatio = duration > 0 ? Math.max(0, Math.min(1, trimStartSec / duration)) : 0;
    const trimEndRatio = duration > 0 ? Math.max(0, Math.min(1, trimEndSec / duration)) : 1;

    // Trim shaded excluded regions
    if (mode === 'trim' && duration > 0) {
      const startX = trimStartRatio * width;
      const endX = trimEndRatio * width;

      ctx.fillStyle = isDark ? 'rgba(0, 0, 0, 0.45)' : 'rgba(20, 22, 25, 0.08)';
      if (startX > 0) ctx.fillRect(0, 0, startX, height);
      if (endX < width) ctx.fillRect(endX, 0, width - endX, height);

      // Active trim region highlight
      ctx.fillStyle = isDark ? 'rgba(225, 59, 45, 0.08)' : 'rgba(225, 59, 45, 0.05)';
      ctx.fillRect(startX, 0, Math.max(0, endX - startX), height);
    }

    // Waveform bars
    for (let i = 0; i < barCount; i++) {
      const amp = Math.max(0.05, Math.min(1, peaks[i] ?? 0.08));
      const barH = Math.max(4, amp * (height - 26));
      const x = i * totalStep + (totalStep - barWidth) / 2;
      const y = midY - barH / 2;
      const ratio = (i + 0.5) / barCount;

      const isPlayed = ratio <= progressRatio;
      const isOutsideTrim =
        mode === 'trim' && (ratio < trimStartRatio || ratio > trimEndRatio);

      if (isOutsideTrim) {
        ctx.fillStyle = isDark ? 'rgba(156, 163, 175, 0.25)' : 'rgba(100, 105, 115, 0.25)';
      } else if (isPlayed) {
        ctx.fillStyle = '#E13B2D';
      } else {
        ctx.fillStyle = isDark ? '#3F4451' : '#C8CDD6';
      }

      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barH, 1.5);
      ctx.fill();
    }

    // Timestamp Markers
    if (duration > 0 && markers.length > 0) {
      for (const marker of markers) {
        const mx = Math.max(4, Math.min(width - 4, (marker.timeSec / duration) * width));
        ctx.strokeStyle = isDark ? '#F59E0B' : '#D97706';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(mx, 6);
        ctx.lineTo(mx, height - 6);
        ctx.stroke();

        ctx.fillStyle = isDark ? '#F59E0B' : '#D97706';
        ctx.beginPath();
        ctx.arc(mx, 8, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Trim handles
    if (mode === 'trim' && duration > 0) {
      const startX = Math.max(2, Math.min(width - 2, trimStartRatio * width));
      const endX = Math.max(2, Math.min(width - 2, trimEndRatio * width));

      [startX, endX].forEach((hx) => {
        ctx.strokeStyle = isDark ? '#F2F3F5' : '#141619';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(hx, 0);
        ctx.lineTo(hx, height);
        ctx.stroke();

        ctx.fillStyle = isDark ? '#F2F3F5' : '#141619';
        ctx.beginPath();
        ctx.roundRect(hx - 5, 4, 10, 18, 3);
        ctx.fill();
      });
    }

    // Playhead scrubber
    if (duration > 0) {
      const px = Math.max(1, Math.min(width - 1, progressRatio * width));
      ctx.strokeStyle = '#E13B2D';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 2);
      ctx.lineTo(px, height - 2);
      ctx.stroke();

      ctx.fillStyle = '#E13B2D';
      ctx.beginPath();
      ctx.arc(px, height - 5, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [
    mode,
    peaks,
    liveBars,
    currentTime,
    duration,
    markers,
    trimStartSec,
    trimEndSec,
    width,
    height,
    isDark,
    isRecording,
  ]);

  const getTimeFromClientX = (clientX: number): number => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || duration <= 0) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode === 'live' || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;

    if (mode === 'trim' && onTrimChange) {
      const startX = (trimStartSec / duration) * rect.width;
      const endX = (trimEndSec / duration) * rect.width;

      if (Math.abs(clickX - startX) <= 14) {
        setDraggingHandle('start');
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      if (Math.abs(clickX - endX) <= 14) {
        setDraggingHandle('end');
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }

    if (onSeek) {
      setDraggingHandle('seek');
      e.currentTarget.setPointerCapture(e.pointerId);
      onSeek(getTimeFromClientX(e.clientX));
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingHandle || duration <= 0) return;
    const time = getTimeFromClientX(e.clientX);

    if (draggingHandle === 'start' && onTrimChange) {
      const clamped = Math.max(0, Math.min(time, trimEndSec - 0.25));
      onTrimChange(clamped, trimEndSec);
    } else if (draggingHandle === 'end' && onTrimChange) {
      const clamped = Math.min(duration, Math.max(time, trimStartSec + 0.25));
      onTrimChange(trimStartSec, clamped);
    } else if (draggingHandle === 'seek' && onSeek) {
      onSeek(time);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (draggingHandle) {
      setDraggingHandle(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if not captured
      }
    }
  };

  return (
    <div ref={containerRef} className="w-full select-none">
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`block rounded-xl ${
          mode === 'live' ? 'cursor-default' : 'cursor-pointer touch-none'
        }`}
        aria-label={mode === 'live' ? 'Live microphone waveform' : 'Interactive audio waveform'}
      />
    </div>
  );
};
