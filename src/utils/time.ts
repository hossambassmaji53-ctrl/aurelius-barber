import { useEffect, useState } from 'react';

export const MONTHS_AR = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
] as const;

export const ONLINE_STALE_MS = 2 * 60 * 1000;

/**
 * Converts Firestore Timestamp, serialized timestamp, Date, number, or ISO string to epoch ms.
 */
export function tsToMillis(ts: any): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return Number.isFinite(ts) ? ts : 0;
  if (ts instanceof Date) {
    const t = ts.getTime();
    return Number.isFinite(t) ? t : 0;
  }
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof ts.toMillis === 'function') {
    const t = ts.toMillis();
    return Number.isFinite(t) ? t : 0;
  }
  if (typeof ts.seconds === 'number') {
    return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
  }
  if (typeof ts._seconds === 'number') {
    return ts._seconds * 1000 + Math.floor((ts._nanoseconds || 0) / 1e6);
  }
  return 0;
}

/**
 * Formats exact local hour & minute in 12-hour Arabic notation with Western numerals (e.g. "05:41 ص").
 */
export function formatClockTime(ms: number): string {
  const d = new Date(ms);
  const h24 = d.getHours();
  const period = h24 >= 12 ? 'م' : 'ص';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const hh = String(h12).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm} ${period}`;
}

function getCalendarDayDiff(targetMs: number, nowMs: number): number {
  const target = new Date(targetMs);
  const now = new Date(nowMs);
  const startOfTarget = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate()
  ).getTime();
  const startOfNow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  return Math.round((startOfNow - startOfTarget) / (24 * 60 * 60 * 1000));
}

/**
 * Formats exact real message sending time:
 * - Today: "05:41 ص"
 * - Yesterday: "أمس · 05:41 ص"
 * - Earlier this year: "15 نوفمبر · 05:41 ص"
 * - Previous years: "15 نوفمبر 2025 · 05:41 ص"
 */
export function formatMessageTime(ts: any, nowMs = Date.now()): string {
  const ms = tsToMillis(ts);
  if (!ms) return '';

  const timeStr = formatClockTime(ms);
  const dayDiff = getCalendarDayDiff(ms, nowMs);

  if (dayDiff <= 0) {
    return timeStr;
  }
  if (dayDiff === 1) {
    return `أمس · ${timeStr}`;
  }

  const d = new Date(ms);
  const now = new Date(nowMs);
  const monthName = MONTHS_AR[d.getMonth()];
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getDate()} ${monthName} · ${timeStr}`;
  }
  return `${d.getDate()} ${monthName} ${d.getFullYear()} · ${timeStr}`;
}

/**
 * Formats full Gregorian date + exact clock time for tooltips and audit logs.
 */
export function formatFullDateTime(ts: any): string {
  const ms = tsToMillis(ts);
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()} · ${formatClockTime(ms)}`;
}

/**
 * Formats Gregorian Arabic date only (e.g. "17 نوفمبر 2026").
 */
export function formatGregorianDate(ts: any): string {
  const ms = tsToMillis(ts);
  if (!ms) return 'اليوم';
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Formats accurate, natural Arabic "Last Seen" string based on real elapsed time and calendar day.
 */
export function formatLastSeen(ts: any, nowMs = Date.now()): string {
  const ms = tsToMillis(ts);
  if (!ms) return 'غير متاح';

  const diffSec = Math.max(0, Math.floor((nowMs - ms) / 1000));
  if (diffSec < 60) {
    return 'منذ لحظات';
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    if (diffMin === 1) return 'منذ دقيقة';
    if (diffMin === 2) return 'منذ دقيقتين';
    if (diffMin <= 10) return `منذ ${diffMin} دقائق`;
    return `منذ ${diffMin} دقيقة`;
  }

  const timeStr = formatClockTime(ms);
  const dayDiff = getCalendarDayDiff(ms, nowMs);

  if (dayDiff <= 0) {
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours === 1) return `منذ ساعة (${timeStr})`;
    if (diffHours === 2) return `منذ ساعتين (${timeStr})`;
    if (diffHours <= 10) return `منذ ${diffHours} ساعات (${timeStr})`;
    return `اليوم الساعة ${timeStr}`;
  }

  if (dayDiff === 1) {
    return `أمس الساعة ${timeStr}`;
  }

  if (dayDiff === 2) {
    return `منذ يومين (${timeStr})`;
  }

  if (dayDiff <= 6) {
    return `منذ ${dayDiff} أيام (${timeStr})`;
  }

  const d = new Date(ms);
  const now = new Date(nowMs);
  const monthName = MONTHS_AR[d.getMonth()];
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getDate()} ${monthName} · ${timeStr}`;
  }
  return `${d.getDate()} ${monthName} ${d.getFullYear()} · ${timeStr}`;
}

/**
 * Live clock tick hook so "Online now" and "Last seen X ago" stay accurate as time passes.
 */
export function useNowTick(intervalMs = 20000): number {
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowTick(Date.now());
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return nowTick;
}
