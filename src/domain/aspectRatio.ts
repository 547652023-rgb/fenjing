export function parseAspectRatio(value?: string): { width: number; height: number } | null {
  const match = value?.trim().normalize("NFKC").match(/^(\d+(?:\.\d+)?|\.\d+)\s*:\s*(\d+(?:\.\d+)?|\.\d+)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  const ratio = width / height;
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 && ratio >= 0.05 && ratio <= 20
    ? { width, height } : null;
}

export function imageAspectRatio(value?: string): { width: number; height: number; css: string } {
  const { width, height } = parseAspectRatio(value) ?? { width: 16, height: 9 };
  return { width, height, css: `${width} / ${height}` };
}
