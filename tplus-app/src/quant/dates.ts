/** Mọi ngày phiên đều tính theo Asia/Ho_Chi_Minh — không dùng UTC ISO (dễ lùi 1 ngày). */

export const VN_TZ = "Asia/Ho_Chi_Minh";

export function vnDateFromUnix(unix: number): string {
  if (!Number.isFinite(unix) || unix <= 0) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(unix * 1000));
}

export function vnToday(): string {
  return vnDateFromUnix(Math.floor(Date.now() / 1000));
}

export function calendarLagDays(session: string, today = vnToday()): number {
  if (!session) return 999;
  const a = Date.parse(`${session}T00:00:00+07:00`);
  const b = Date.parse(`${today}T00:00:00+07:00`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 999;
  return Math.round((b - a) / 86_400_000);
}

/** Chuỗi nến cũ hơn 7 ngày lịch → reject, không mang đi phân tích. Tết dài hơn thì nới ở đây. */
export function isStaleSession(unix: number, maxLag = 7): boolean {
  const lag = calendarLagDays(vnDateFromUnix(unix));
  return lag > maxLag;
}

export function formatVnSession(unix: number | null | undefined): string {
  if (unix == null || !Number.isFinite(unix)) return "N/A";
  const iso = vnDateFromUnix(unix);
  if (!iso) return "N/A";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
