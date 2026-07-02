// Weekly opening-hours model + helpers.
// Days are Sunday..Saturday (index 0..6) — matches JS Date.getDay().

export type DayHours = { closed: boolean; open: string; close: string };
export type WeeklyHours = { tz?: string; days: DayHours[] };

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export const DEFAULT_HOURS: WeeklyHours = {
  tz: "Indian/Maldives",
  days: Array.from({ length: 7 }, () => ({ closed: false, open: "09:00", close: "22:00" })),
};

export function normalizeHours(input: unknown): WeeklyHours | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as any;
  const src = Array.isArray(obj.days) ? obj.days : null;
  if (!src) return null;
  const days: DayHours[] = Array.from({ length: 7 }, (_, i) => {
    const d = src[i] ?? {};
    return {
      closed: !!d.closed,
      open: typeof d.open === "string" ? d.open : "09:00",
      close: typeof d.close === "string" ? d.close : "22:00",
    };
  });
  return { tz: typeof obj.tz === "string" ? obj.tz : undefined, days };
}

function toMin(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const mm = Math.min(59, Math.max(0, Number(m[2])));
  return h * 60 + mm;
}

function nowInTz(tz?: string): { day: number; minutes: number } {
  const now = new Date();
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz || undefined,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(now);
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
    const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    const dayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
    return { day: dayIdx < 0 ? now.getDay() : dayIdx, minutes: (hh % 24) * 60 + mm };
  } catch {
    return { day: now.getDay(), minutes: now.getHours() * 60 + now.getMinutes() };
  }
}

export type HoursStatus =
  | { state: "open"; closesInMin: number }
  | { state: "closed"; opensInMin: number | null; nextLabel?: string }
  | { state: "unknown" };

export function computeHoursStatus(hours: WeeklyHours | null | undefined, at: Date = new Date()): HoursStatus {
  const h = normalizeHours(hours);
  if (!h) return { state: "unknown" };
  void at;
  const { day, minutes } = nowInTz(h.tz);

  // Check today's window (ignoring overnight for simplicity).
  const today = h.days[day];
  if (today && !today.closed) {
    const o = toMin(today.open);
    const c = toMin(today.close);
    if (o != null && c != null && c > o && minutes >= o && minutes < c) {
      return { state: "open", closesInMin: c - minutes };
    }
    if (o != null && minutes < o) {
      return { state: "closed", opensInMin: o - minutes, nextLabel: "today" };
    }
  }

  // Find next opening within the next 7 days.
  for (let i = 1; i <= 7; i++) {
    const idx = (day + i) % 7;
    const d = h.days[idx];
    if (!d || d.closed) continue;
    const o = toMin(d.open);
    if (o == null) continue;
    const minsUntilMidnight = 24 * 60 - minutes;
    const totalMins = minsUntilMidnight + (i - 1) * 24 * 60 + o;
    return { state: "closed", opensInMin: totalMins, nextLabel: i === 1 ? "tomorrow" : DAY_LABELS[idx] };
  }
  return { state: "closed", opensInMin: null };
}

export function formatDuration(min: number): string {
  if (min < 1) return "under a minute";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m === 0 ? `${h}h` : `${h}h ${m}m`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh === 0 ? `${d}d` : `${d}d ${rh}h`;
}