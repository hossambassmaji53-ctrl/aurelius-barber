import { tsToMillis } from '../firebase';
import { UserProfile } from '../types';

export const USERNAME_PATTERN = /^[a-z0-9_]{1,24}$/;
export const NUMERIC_ID_PATTERN = /^\d{1,12}$/;

/**
 * Normalizes raw user input into a lowercase ASCII handle / numeric ID (`a-z`, `0-9`, `_`).
 */
export function normalizeUsernameInput(raw: string): string {
  return raw
    .trim()
    .replace(/^[@#]+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '')
    .slice(0, 24);
}

/**
 * Normalizes raw numeric ID input (digits only, max 12 digits).
 */
export function normalizeNumericIdInput(raw: string): string {
  return raw.replace(/[^\d]/g, '').slice(0, 12);
}

export function isValidUsername(value?: string | null): boolean {
  if (!value) return false;
  return USERNAME_PATTERN.test(value);
}

export function isNumericUserId(value?: string | null): boolean {
  if (!value) return false;
  return NUMERIC_ID_PATTERN.test(value);
}

/**
 * Identifies VIP / special numbers reserved for Founder/Admin assignment:
 * - Short 1 to 4 digit numbers (e.g. 1, 7, 77, 777, 1000)
 * - Repeating single digit (e.g. 55555, 777777)
 * - Ascending / descending sequences (e.g. 12345, 123456, 654321)
 * - Clean round multiples of 10000 / 100000 (e.g. 100000, 500000)
 */
export function isReservedSpecialNumber(numStr: string): boolean {
  if (!NUMERIC_ID_PATTERN.test(numStr)) return false;
  if (numStr.length <= 4) return true;
  if (/^(\d)\1+$/.test(numStr)) return true;
  if ('0123456789'.includes(numStr) || '9876543210'.includes(numStr)) return true;
  if (/^[1-9]0{4,}$/.test(numStr)) return true;
  return false;
}

function hashUidToSixDigits(uid: string): string {
  let hash = 2166136261;
  for (let i = 0; i < uid.length; i++) {
    hash ^= uid.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const num = 100000 + (Math.abs(hash) % 899999);
  return String(num);
}

/**
 * Generates a unique random 6-digit numeric user ID (excluding reserved VIP numbers).
 */
export function generateUniqueNumericId(
  uid: string,
  takenHandles?: Set<string>
): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = String(100000 + Math.floor(Math.random() * 900000));
    if (isReservedSpecialNumber(candidate)) continue;
    if (!takenHandles || !takenHandles.has(candidate)) {
      return candidate;
    }
  }

  let fallback = Number(hashUidToSixDigits(uid || 'member'));
  for (let i = 0; i < 500; i++) {
    const str = String(100000 + ((fallback + i) % 899999));
    if (!isReservedSpecialNumber(str) && (!takenHandles || !takenHandles.has(str))) {
      return str;
    }
  }
  return hashUidToSixDigits(uid || 'member');
}

/**
 * Generates a default unique numeric ID for new or legacy accounts.
 */
export function generateDefaultUsername(
  _displayName: string,
  uid: string,
  takenHandles?: Set<string>
): string {
  return generateUniqueNumericId(uid, takenHandles);
}

/**
 * Checks whether a user's Special ID is currently active (not expired).
 */
export function isActiveSpecialId(
  user?: Partial<Pick<UserProfile, 'isSpecialId' | 'specialIdExpiresAt' | 'role' | 'roles'>> | null,
  nowMs = Date.now()
): boolean {
  if (!user?.isSpecialId) return false;
  if (user.role === 'admin' || user.roles?.includes('admin')) return true;
  if (!user.specialIdExpiresAt) return true;
  const exp = tsToMillis(user.specialIdExpiresAt);
  if (!exp) return true;
  return exp > nowMs;
}

/**
 * Returns the member's persisted ID/username, falling back to baseUsername if a timed Special ID expired.
 */
export function getUserHandle(
  user?: (Partial<
    Pick<
      UserProfile,
      'displayName' | 'username' | 'baseUsername' | 'isSpecialId' | 'specialIdExpiresAt' | 'role' | 'roles'
    >
  > & { uid: string }) | null,
  nowMs = Date.now()
): string {
  if (!user) return '100000';
  if (user.isSpecialId && !isActiveSpecialId(user, nowMs) && isValidUsername(user.baseUsername)) {
    return user.baseUsername!;
  }
  if (isValidUsername(user.username)) {
    return user.username!;
  }
  return hashUidToSixDigits(user.uid || 'member');
}

export interface MessageSegment {
  type: 'text' | 'mention';
  value: string;
  handle?: string;
}

/**
 * Parses text safely into text and `@id` / `@username` segments.
 */
export function parseMessageTextSegments(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  const regex = /@([a-z0-9_]{1,24})/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const prevChar = start > 0 ? text[start - 1] : '';
    if (prevChar && /[a-z0-9._-]/i.test(prevChar)) {
      continue;
    }
    if (start > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, start) });
    }
    const handle = match[1].toLowerCase();
    segments.push({ type: 'mention', value: match[0], handle });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: text }];
}

/**
 * Resolves up to 10 unique mentioned users from message text.
 */
export function extractMentionedUsers(
  text: string,
  users: UserProfile[],
  excludeUid?: string
): UserProfile[] {
  const handleMap = new Map<string, UserProfile>();
  for (const u of users) {
    if (!u.isBanned) {
      handleMap.set(getUserHandle(u).toLowerCase(), u);
    }
  }

  const found: UserProfile[] = [];
  const seen = new Set<string>();
  const segments = parseMessageTextSegments(text);

  for (const seg of segments) {
    if (seg.type !== 'mention' || !seg.handle) continue;
    const matched = handleMap.get(seg.handle.toLowerCase());
    if (matched && matched.uid !== excludeUid && !seen.has(matched.uid)) {
      seen.add(matched.uid);
      found.push(matched);
      if (found.length >= 10) break;
    }
  }

  return found;
}
