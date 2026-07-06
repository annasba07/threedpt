/** Map a 1–10 pain intensity to a colour: amber (mild) → red (severe). */
export function painColor(intensity: number): string {
  const t = Math.min(1, Math.max(0, (intensity - 1) / 9));
  const hue = 45 - 45 * t; // 45° amber → 0° red
  return `hsl(${hue}, 92%, ${54 - t * 6}%)`;
}
