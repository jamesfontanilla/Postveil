export function qrImageSource(value: string): string {
  const raw = value.trim();
  if (!raw) return "";

  // Keep already-usable image sources intact when an integration returns raw SVG.
  if (/^(data:image\/|blob:|https?:\/\/)/i.test(raw)) return raw;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(raw)}`;
}
