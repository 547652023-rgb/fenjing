export type ImageSize = { width: number; height: number };

export function jpegOrientation(bytes: Uint8Array): number {
  if (bytes[0] !== 255 || bytes[1] !== 216) return 1;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 2; offset + 4 <= bytes.length;) {
    if (bytes[offset] !== 255) break;
    const marker = bytes[offset + 1];
    if (marker === 218 || marker === 217) break;
    if (marker === 255) { offset++; continue; }
    const length = view.getUint16(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > bytes.length) break;
    if (marker === 225 && length >= 16 && view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0) {
      const start = offset + 10;
      const endian = view.getUint16(start);
      const little = endian === 0x4949;
      if ((little || endian === 0x4d4d) && view.getUint16(start + 2, little) === 42) {
        const directory = start + view.getUint32(start + 4, little);
        if (directory >= start + 8 && directory + 2 <= end) {
          const count = view.getUint16(directory, little);
          for (let i = 0; i < count; i++) {
            const entry = directory + 2 + i * 12;
            if (entry + 12 > end) break;
            if (view.getUint16(entry, little) === 0x0112 && view.getUint16(entry + 2, little) === 3 && view.getUint32(entry + 4, little) === 1) {
              const value = view.getUint16(entry + 8, little);
              return value >= 1 && value <= 8 ? value : 1;
            }
          }
        }
      }
    }
    offset = end;
  }
  return 1;
}

/** Map the original image unit square into its upright PDF rectangle. */
export function orientedImageMatrix(orientation: number, x: number, y: number, w: number, h: number): [number, number, number, number, number, number] {
  switch (orientation) {
    case 2: return [-w, 0, 0, h, x + w, y];
    case 3: return [-w, 0, 0, -h, x + w, y + h];
    case 4: return [w, 0, 0, -h, x, y + h];
    case 5: return [0, -h, -w, 0, x + w, y + h];
    case 6: return [0, -h, w, 0, x, y + h];
    case 7: return [0, h, w, 0, x, y];
    case 8: return [0, h, -w, 0, x + w, y];
    default: return [w, 0, 0, h, x, y];
  }
}

// Read the original dimensions without re-encoding PNG/JPEG/GIF uploads.
export function imageSize(bytes: Uint8Array): ImageSize | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && bytes[0] === 137 && bytes[1] === 80) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 10 && bytes[0] === 71 && bytes[1] === 73) {
    return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset] !== 255) break;
      const marker = bytes[offset + 1];
      if (marker === 218 || marker === 217) break;
      if (marker === 255) { offset += 1; continue; }
      const length = view.getUint16(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 7) {
        return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
      }
      offset += 2 + length;
    }
  }
  return undefined;
}

export function fitImage(size: ImageSize, width: number, height: number): ImageSize {
  const scale = Math.min(width / size.width, height / size.height);
  return { width: size.width * scale, height: size.height * scale };
}
