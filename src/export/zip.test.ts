import { createZip } from "./zip";

it("creates a deterministic stored ZIP with local and central records", () => {
  const entries = [{ name: "a.txt", data: new TextEncoder().encode("A") }];

  const first = createZip(entries);
  const second = createZip(entries);

  expect([...first.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  expect(new TextDecoder().decode(first)).toContain("a.txt");
  expect([...first.slice(-22, -18)]).toEqual([0x50, 0x4b, 0x05, 0x06]);
  expect([...first]).toEqual([...second]);
});

it("uses the valid DOS epoch and writes a self-consistent end-of-central-directory record", () => {
  const archive = createZip([
    { name: "a.txt", data: new TextEncoder().encode("A") },
    { name: "目录/b.txt", data: new TextEncoder().encode("BC") },
  ]);
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const eocdOffset = archive.length - 22;
  const centralSize = view.getUint32(eocdOffset + 12, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);

  expect(view.getUint16(10, true)).toBe(0);
  expect(view.getUint16(12, true)).toBe(0x0021);
  expect(view.getUint32(eocdOffset, true)).toBe(0x06054b50);
  expect(view.getUint16(eocdOffset + 8, true)).toBe(2);
  expect(view.getUint16(eocdOffset + 10, true)).toBe(2);
  expect(view.getUint16(eocdOffset + 20, true)).toBe(0);
  expect(centralOffset + centralSize).toBe(eocdOffset);
  expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
  expect(view.getUint16(centralOffset + 12, true)).toBe(0);
  expect(view.getUint16(centralOffset + 14, true)).toBe(0x0021);
  expect(view.getUint32(centralOffset + 42, true)).toBe(0);
});
