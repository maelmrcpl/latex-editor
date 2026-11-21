const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

const oneDecimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** Taille lisible en français : « 850 Ko », « 12,4 Mo », « 1,2 Go ». */
export function formatBytes(bytes: number): string {
  if (bytes >= GB) return `${oneDecimal.format(bytes / GB)} Go`;
  if (bytes >= MB) return `${oneDecimal.format(bytes / MB)} Mo`;
  if (bytes >= KB) return `${Math.round(bytes / KB)} Ko`;
  return `${bytes} o`;
}

/** Part du quota utilisée (0–1), ou null si illimité. */
export function quotaRatio(usedBytes: number, quotaBytes: number | null): number | null {
  if (quotaBytes === null || quotaBytes <= 0) return null;
  return Math.min(1, usedBytes / quotaBytes);
}
