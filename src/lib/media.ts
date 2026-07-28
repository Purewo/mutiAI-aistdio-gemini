/** User-facing labels for backend-normalized media types. */
const MEDIA_TYPE_LABELS: Readonly<Record<string, string>> = {
  'application/json': 'JSON',
  'application/pdf': 'PDF',
  'application/vnd.ms-excel': 'Excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel / XLSX',
  'image/gif': 'GIF 图片',
  'image/jpeg': 'JPEG 图片',
  'image/png': 'PNG 图片',
  'image/webp': 'WebP 图片',
  'image/*': '图片',
  'text/csv': 'CSV',
  'text/markdown': 'Markdown',
  'text/plain': '文本',
};

export function formatMediaType(mediaType: string): string {
  return MEDIA_TYPE_LABELS[mediaType.trim().toLowerCase()] ?? mediaType;
}

export function formatMediaTypes(mediaTypes: readonly string[]): string {
  return mediaTypes.map(formatMediaType).join('、');
}
