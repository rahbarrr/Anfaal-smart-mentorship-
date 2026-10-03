// Direct-to-storage uploads can safely exceed OpenAI's per-request limit because
// the worker splits recordings before transcription. The legacy memory upload
// path remains capped separately in callRoutes.ts.
export const MAX_RECORDING_UPLOAD_BYTES = 200 * 1024 * 1024;

export const ALLOWED_RECORDING_EXTENSIONS = new Set([
  'mp3', 'mpeg', 'mpga', 'wav', 'm4a', 'mp4', 'webm', 'ogg', 'oga', 'aac', 'flac',
]);

export const ALLOWED_MIME_TYPES = new Set([
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/m4a',
  'audio/x-m4a', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/flac', 'video/mp4',
  'video/webm',
]);

export function sanitizeUploadFileName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^[_\.]+/, '');
  return sanitized || 'recording.audio';
}

export function hasAllowedRecordingExtension(fileName: string): boolean {
  const extension = fileName.split('.').pop()?.toLowerCase();
  return Boolean(extension && ALLOWED_RECORDING_EXTENSIONS.has(extension));
}

export function isAllowedRecording(fileName: string, mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.has(mimeType.toLowerCase()) || hasAllowedRecordingExtension(fileName);
}

export function isValidRecordingSize(fileSize: number): boolean {
  return Number.isInteger(fileSize) && fileSize > 0 && fileSize <= MAX_RECORDING_UPLOAD_BYTES;
}

/** A storage key is valid only when it was issued for this exact call. */
export function isStorageKeyOwnedByCall(storageKey: string, callId: string): boolean {
  const escapedCallId = callId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^calls/\\d{4}/\\d{2}/call_${escapedCallId}/[^/]+$`).test(storageKey);
}
