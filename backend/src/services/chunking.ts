export function chunkText(text: string, maxChars = 12000, overlapChars = 400): string[] {
  if (!text) return [];
  if (maxChars <= 0 || overlapChars < 0 || overlapChars >= maxChars) throw new Error('Invalid chunk limits.');
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - overlapChars;
  }
  return chunks;
}

export function boundedText(text: string, maxChars = 120000): string {
  return chunkText(text, maxChars, 0).join('\n');
}
