export function toBits(value: number, bits: number): boolean[] {
  return Array.from({ length: bits }, (_, i) => Boolean((value >> (bits - 1 - i)) & 1));
}
