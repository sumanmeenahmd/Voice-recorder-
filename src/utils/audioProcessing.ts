export function formatTime(seconds: number, showCentiseconds = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return showCentiseconds ? '00:00.00' : '00:00';
  }
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);

  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');

  if (hrs > 0) {
    const hh = String(hrs).padStart(2, '0');
    return showCentiseconds
      ? `${hh}:${mm}:${ss}.${String(cs).padStart(2, '0')}`
      : `${hh}:${mm}:${ss}`;
  }

  return showCentiseconds ? `${mm}:${ss}.${String(cs).padStart(2, '0')}` : `${mm}:${ss}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today, ${timeStr}`;
  if (isYesterday) return `Yesterday, ${timeStr}`;

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + `, ${timeStr}`;
}

export function getSupportedMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

export function getExtensionFromMime(mimeType: string): string {
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('mp4') || mimeType.includes('aac') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  return 'webm';
}

export function computeRmsDb(timeDomainBytes: Uint8Array): number {
  let sumSquares = 0;
  for (let i = 0; i < timeDomainBytes.length; i++) {
    const normalized = (timeDomainBytes[i] - 128) / 128;
    sumSquares += normalized * normalized;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, timeDomainBytes.length));
  if (rms < 0.0001) return -60;
  const db = 20 * Math.log10(rms);
  return Math.max(-60, Math.min(0, db));
}

export async function decodeAudioMetadataAndPeaks(
  blob: Blob,
  targetBars = 140
): Promise<{ durationSec: number; sampleRate: number; channels: number; peaks: number[] }> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const peaks = extractPeaksFromAudioBuffer(audioBuffer, targetBars);
    return {
      durationSec: audioBuffer.duration,
      sampleRate: audioBuffer.sampleRate,
      channels: audioBuffer.numberOfChannels,
      peaks,
    };
  } finally {
    await ctx.close().catch(() => {});
  }
}

export function extractPeaksFromAudioBuffer(audioBuffer: AudioBuffer, targetBars = 140): number[] {
  const channelData = audioBuffer.getChannelData(0);
  const totalSamples = channelData.length;
  if (totalSamples === 0) return new Array(targetBars).fill(0.08);

  const blockSize = Math.max(1, Math.floor(totalSamples / targetBars));
  const peaks: number[] = [];

  for (let i = 0; i < targetBars; i++) {
    const start = i * blockSize;
    const end = Math.min(totalSamples, start + blockSize);
    let maxAmp = 0;
    const step = Math.max(1, Math.floor((end - start) / 64));
    for (let j = start; j < end; j += step) {
      const abs = Math.abs(channelData[j]);
      if (abs > maxAmp) maxAmp = abs;
    }
    peaks.push(Math.max(0.04, Math.min(1, maxAmp)));
  }

  // Normalize subtle low-volume takes gently while preserving dynamic range
  const globalMax = Math.max(...peaks, 0.01);
  if (globalMax < 0.35 && globalMax > 0.05) {
    const boost = Math.min(2.4, 0.75 / globalMax);
    return peaks.map((p) => Math.min(1, p * boost));
  }
  return peaks;
}

export function encodeWavFromAudioBuffer(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const numSamples = buffer.length;
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;

  const wavBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wavBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // Bits per sample
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
}

export async function convertBlobToWav(blob: Blob): Promise<Blob> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    return encodeWavFromAudioBuffer(audioBuffer);
  } finally {
    await ctx.close().catch(() => {});
  }
}

export interface AudioEditOptions {
  startSec: number;
  endSec: number;
  normalize: boolean;
  fadeInSec: number;
  fadeOutSec: number;
  gainMultiplier: number;
}

export async function trimAndProcessAudioBlob(
  blob: Blob,
  options: AudioEditOptions
): Promise<{
  blob: Blob;
  durationSec: number;
  sampleRate: number;
  channels: number;
  peaks: number[];
}> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const sourceBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

    const safeStart = Math.max(0, Math.min(options.startSec, sourceBuffer.duration - 0.1));
    const safeEnd = Math.max(safeStart + 0.1, Math.min(options.endSec, sourceBuffer.duration));
    const startSample = Math.floor(safeStart * sourceBuffer.sampleRate);
    const endSample = Math.floor(safeEnd * sourceBuffer.sampleRate);
    const frameCount = Math.max(1, endSample - startSample);

    const outBuffer = ctx.createBuffer(
      sourceBuffer.numberOfChannels,
      frameCount,
      sourceBuffer.sampleRate
    );

    let peakAmplitude = 0;
    for (let ch = 0; ch < sourceBuffer.numberOfChannels; ch++) {
      const src = sourceBuffer.getChannelData(ch);
      const dst = outBuffer.getChannelData(ch);
      for (let i = 0; i < frameCount; i++) {
        const val = src[startSample + i] ?? 0;
        dst[i] = val;
        const abs = Math.abs(val);
        if (abs > peakAmplitude) peakAmplitude = abs;
      }
    }

    const normMultiplier =
      options.normalize && peakAmplitude > 0.001 ? Math.min(8, 0.92 / peakAmplitude) : 1;
    const totalGain = normMultiplier * options.gainMultiplier;

    const fadeInSamples = Math.min(
      Math.floor(frameCount / 2),
      Math.floor(options.fadeInSec * sourceBuffer.sampleRate)
    );
    const fadeOutSamples = Math.min(
      Math.floor(frameCount / 2),
      Math.floor(options.fadeOutSec * sourceBuffer.sampleRate)
    );

    for (let ch = 0; ch < outBuffer.numberOfChannels; ch++) {
      const dst = outBuffer.getChannelData(ch);
      for (let i = 0; i < frameCount; i++) {
        let env = 1;
        if (fadeInSamples > 0 && i < fadeInSamples) {
          env *= i / fadeInSamples;
        }
        if (fadeOutSamples > 0 && i >= frameCount - fadeOutSamples) {
          env *= (frameCount - 1 - i) / fadeOutSamples;
        }
        dst[i] = Math.max(-0.99, Math.min(0.99, dst[i] * totalGain * env));
      }
    }

    const wavBlob = encodeWavFromAudioBuffer(outBuffer);
    const peaks = extractPeaksFromAudioBuffer(outBuffer, 140);

    return {
      blob: wavBlob,
      durationSec: outBuffer.duration,
      sampleRate: outBuffer.sampleRate,
      channels: outBuffer.numberOfChannels,
      peaks,
    };
  } finally {
    await ctx.close().catch(() => {});
  }
}
