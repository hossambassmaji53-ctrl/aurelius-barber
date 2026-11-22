export const MAX_TEXT_LENGTHS = {
  displayName: 80,
  username: 24,
  bio: 400,
  salonName: 100,
  addressLabel: 160,
  chatMessage: 1000,
  staffMessage: 1200,
  postText: 1200,
  galleryTitle: 100,
  galleryDescription: 500,
  serviceName: 100,
  serviceDescription: 300,
  storyCaption: 200,
  ticketSubject: 140,
  ticketDescription: 1500,
  bookingNotes: 400,
  reviewComment: 500,
  reportReason: 400,
  moderationReason: 240,
  announcementTitle: 120,
  announcementSummary: 1200,
} as const;

const BIDI_CONTROL_REGEX = /[\u202A-\u202E\u2066-\u2069]/g;
// Strip ASCII control chars except \n (0x0A) and \t (0x09)
const ASCII_CTRL_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const SCRIPT_BLOCK_REGEX = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const STYLE_BLOCK_REGEX = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
const HTML_TAG_REGEX = /<\/?[a-zA-Z!/?][^>]*>/g;
const DANGEROUS_URI_REGEX = /\b(javascript|vbscript)\s*:|data\s*:\s*text\/html/gi;

export interface SanitizeTextOptions {
  multiline?: boolean;
  maxLength?: number;
}

/**
 * Sanitizes user-supplied plain text to neutralize XSS payloads, HTML tags,
 * BiDi spoofing control characters, and oversized strings.
 */
export function sanitizePlainText(
  raw: string | undefined | null,
  maxLength = 1000,
  options?: SanitizeTextOptions
): string {
  if (!raw || typeof raw !== 'string') return '';
  const limit = options?.maxLength ?? maxLength;
  const multiline = options?.multiline ?? true;

  let cleaned = raw
    .replace(BIDI_CONTROL_REGEX, '')
    .replace(ASCII_CTRL_REGEX, '')
    .replace(SCRIPT_BLOCK_REGEX, '')
    .replace(STYLE_BLOCK_REGEX, '')
    .replace(HTML_TAG_REGEX, '')
    .replace(DANGEROUS_URI_REGEX, '');

  if (multiline) {
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n');
  } else {
    cleaned = cleaned.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ');
  }

  return cleaned.trim().slice(0, limit);
}

/**
 * Sanitizes handles/IDs strictly to lowercase alphanumeric + underscore.
 */
export function sanitizeHandleInput(raw: string | undefined | null, maxLength = 24): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, maxLength);
}

const SAFE_IMAGE_DATA_URI_REGEX =
  /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-zA-Z0-9+/=\s]+$/i;
const SAFE_VIDEO_DATA_URI_REGEX =
  /^data:video\/(mp4|webm|quicktime);base64,[a-zA-Z0-9+/=\s]+$/i;
const SAFE_LOCAL_ASSET_REGEX = /^\.?\/(src\/assets|assets)\/[a-zA-Z0-9_.\-/]+$/;

/**
 * Validates that a media URL uses HTTPS, safe raster image data URIs (never SVG),
 * optional safe video data URIs, or local bundled asset paths.
 */
export function isSafeMediaUrl(
  raw: string | undefined | null,
  allowVideo = false
): boolean {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (trimmed.length > 750000) return false;

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('data:text/') ||
    lower.startsWith('data:image/svg')
  ) {
    return false;
  }

  if (SAFE_LOCAL_ASSET_REGEX.test(trimmed)) return true;
  if (SAFE_IMAGE_DATA_URI_REGEX.test(trimmed)) return true;
  if (allowVideo && SAFE_VIDEO_DATA_URI_REGEX.test(trimmed)) return true;

  if (lower.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  return false;
}

export function sanitizeMediaUrl(
  raw: string | undefined | null,
  allowVideo = false
): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  return isSafeMediaUrl(trimmed, allowVideo) ? trimmed : '';
}

interface RateBucket {
  timestamps: number[];
  lastAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

export interface RateLimitConfig {
  cooldownMs: number;
  maxInWindow: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
  message?: string;
}

/**
 * Client-side anti-spam throttle protecting chat, posts, gallery, tickets,
 * friend requests, and content reports from automated or rapid bursts.
 */
export function checkActionRateLimit(
  actionKey: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const existing = rateBuckets.get(actionKey) || { timestamps: [], lastAt: 0 };

  if (config.cooldownMs > 0 && now - existing.lastAt < config.cooldownMs) {
    const remainingMs = config.cooldownMs - (now - existing.lastAt);
    const retryAfterSec = Math.max(1, Math.ceil(remainingMs / 1000));
    return {
      allowed: false,
      retryAfterSec,
      message: `تمهّل قليلاً (${retryAfterSec} ث) لحماية الدردشة والمنصة من الإرسال المتكرر.`,
    };
  }

  const recent = existing.timestamps.filter((ts) => now - ts < config.windowMs);
  if (recent.length >= config.maxInWindow) {
    const oldest = recent[0];
    const remainingMs = Math.max(1000, config.windowMs - (now - oldest));
    const retryAfterSec = Math.max(1, Math.ceil(remainingMs / 1000));
    return {
      allowed: false,
      retryAfterSec,
      message: `تجاوزت الحد المسموح مؤقتاً. يرجى الانتظار ${retryAfterSec} ث قبل المحاولة مرة أخرى.`,
    };
  }

  recent.push(now);
  rateBuckets.set(actionKey, { timestamps: recent, lastAt: now });
  return { allowed: true, retryAfterSec: 0 };
}
