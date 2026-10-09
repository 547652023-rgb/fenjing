import * as geometry from "./imageGeometry";

it("recognizes little-endian and big-endian JPEG EXIF orientation", () => {
  const orientation = (geometry as unknown as { jpegOrientation?: (bytes: Uint8Array) => number }).jpegOrientation;
  expect(orientation).toBeTypeOf("function");
  const bytes = (hex: string) => Uint8Array.from(hex.match(/../g)!, value => parseInt(value, 16));
  expect(orientation!(bytes("ffd8ffe1002245786966000049492a0008000000010012010300010000000600000000000000ffd9"))).toBe(6);
  expect(orientation!(bytes("ffd8ffe100224578696600004d4d002a00000008000101120003000000010002000000000000ffd9"))).toBe(2);
  expect(orientation!(bytes("ffd8ffd9"))).toBe(1);
  expect(orientation!(bytes("ffd8ffe100224578696600004949"))).toBe(1);
});

it("places rotated and mirrored original pixels with the correct PDF transform", () => {
  const matrix = (geometry as unknown as { orientedImageMatrix?: (orientation: number, x: number, y: number, w: number, h: number) => number[] }).orientedImageMatrix;
  expect(matrix).toBeTypeOf("function");
  expect(matrix!(1, 10, 20, 30, 40)).toEqual([30, 0, 0, 40, 10, 20]);
  expect(matrix!(2, 10, 20, 30, 40)).toEqual([-30, 0, 0, 40, 40, 20]);
  expect(matrix!(3, 10, 20, 30, 40)).toEqual([-30, 0, 0, -40, 40, 60]);
  expect(matrix!(4, 10, 20, 30, 40)).toEqual([30, 0, 0, -40, 10, 60]);
  expect(matrix!(5, 10, 20, 30, 40)).toEqual([0, -40, -30, 0, 40, 60]);
  expect(matrix!(6, 10, 20, 30, 40)).toEqual([0, -40, 30, 0, 10, 60]);
  expect(matrix!(7, 10, 20, 30, 40)).toEqual([0, 40, 30, 0, 10, 20]);
  expect(matrix!(8, 10, 20, 30, 40)).toEqual([0, 40, -30, 0, 40, 20]);
});
