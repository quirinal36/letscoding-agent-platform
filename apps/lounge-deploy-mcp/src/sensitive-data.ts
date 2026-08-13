/** Conservative secret-shape detector for report input and rendering. */
export function looksSensitive(value: string): boolean {
  return (
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/i.test(value) ||
    /\b(?:sk-[a-z\d_-]{16,}|gh[pousr]_[a-z\d]{16,})\b/i.test(value) ||
    /\beyJ[a-z\d_-]{10,}\.[a-z\d_-]{10,}\.[a-z\d_-]{10,}\b/i.test(value) ||
    /\b(?:password|passwd|secret|token|api[_-]?key|private[_-]?key)\s*[:=]\s*\S+/i.test(
      value,
    ) ||
    /\b[a-z][a-z\d+.-]*:\/\/[^\s/:]+:[^\s/@]+@/i.test(value)
  );
}
