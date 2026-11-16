export type RecordingCategory = 'All' | 'Meetings' | 'Ideas' | 'Notes' | 'Music';

export type RecordingFilter = 'All' | 'Starred' | 'Meetings' | 'Ideas' | 'Notes' | 'Music';

export type AppView = 'studio' | 'library' | 'editor';

export interface RecordingMarker {
  id: string;
  timeSec: number;
  label: string;
}

export interface RecordingItem {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  durationSec: number;
  mimeType: string;
  sizeBytes: number;
  sampleRate: number;
  channels: number;
  category: Exclude<RecordingCategory, 'All'>;
  starred: boolean;
  notes: string;
  markers: RecordingMarker[];
  peaks: number[];
  blob: Blob;
}

export interface RecorderSettings {
  deviceId: string;
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
  monitorInput: boolean;
}

export interface AudioDeviceOption {
  deviceId: string;
  label: string;
}
