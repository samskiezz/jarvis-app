
/**
 * GPU color-picking contract.
 * In production, every object ID is encoded as a unique RGB value in an offscreen framebuffer.
 * Mouse hover reads one pixel and maps the color back to an object ID.
 */
export function idToColor(id: number): [number, number, number] {
  return [(id >> 16) & 255, (id >> 8) & 255, id & 255];
}

export function colorToId(r: number, g: number, b: number): number {
  return (r << 16) | (g << 8) | b;
}
