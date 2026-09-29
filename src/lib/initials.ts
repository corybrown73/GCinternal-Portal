/** "Nicole-Joy Morris" → "NM"; "FGP Manufacturing" → "FM"; "acme" → "AC". */
export function initials(name: string | null | undefined): string {
  const words = (name ?? "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}
