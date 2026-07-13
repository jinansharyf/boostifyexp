export function extractTrackingNo(input: string) {
  const raw = safelyDecode(input).trim().toUpperCase();
  const fromTrackUrl = raw.match(/\/TRACK\/([A-Z0-9][A-Z0-9-]{4,})/i)?.[1];
  const fromMessage = raw.match(/\b[A-Z]{2,6}-[A-Z0-9-]{4,}\b/i)?.[0];
  const candidate = fromTrackUrl ?? fromMessage ?? raw;

  return candidate
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function escapePostgrestPattern(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function safelyDecode(input: string) {
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}