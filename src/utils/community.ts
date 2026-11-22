import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { auth, db, isUserCurrentlyOnline } from '../firebase';
import { MemberLiveStatus, UserProfile } from '../types';
import { isBarberMember } from './roles';
import { tsToMillis } from './time';
import { checkActionRateLimit } from './security';

export { tsToMillis };

export function getTodayDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface CommunityLevelInfo {
  level: number;
  title: string;
  minPoints: number;
  nextLevelPoints: number | null;
  progressPercent: number;
  textColorClass: string;
  ringColorClass: string;
}

const LEVELS: {
  level: number;
  title: string;
  minPoints: number;
  textColorClass: string;
  ringColorClass: string;
}[] = [
  {
    level: 1,
    title: 'عضو مبتدئ',
    minPoints: 0,
    textColorClass: 'text-[#A6A196]',
    ringColorClass: 'bg-[#6B665E]',
  },
  {
    level: 2,
    title: 'عضو نشيط',
    minPoints: 50,
    textColorClass: 'text-emerald-300',
    ringColorClass: 'bg-emerald-400',
  },
  {
    level: 3,
    title: 'عضو متميز',
    minPoints: 150,
    textColorClass: 'text-sky-300',
    ringColorClass: 'bg-sky-400',
  },
  {
    level: 4,
    title: 'نخبة أوريليوس',
    minPoints: 350,
    textColorClass: 'text-slate-200',
    ringColorClass: 'bg-slate-200',
  },
  {
    level: 5,
    title: 'أسطورة أوريليوس',
    minPoints: 700,
    textColorClass: 'text-[#F5D67B]',
    ringColorClass: 'bg-[#D4A853]',
  },
];

export function getCommunityLevel(pointsInput?: number | null): CommunityLevelInfo {
  const points = Math.max(0, Math.floor(pointsInput || 0));
  let currentIdx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (points >= LEVELS[i].minPoints) {
      currentIdx = i;
    }
  }
  const current = LEVELS[currentIdx];
  const next = LEVELS[currentIdx + 1] || null;
  const progressPercent = next
    ? Math.min(
        100,
        Math.max(
          0,
          Math.round(
            ((points - current.minPoints) / (next.minPoints - current.minPoints)) * 100
          )
        )
      )
    : 100;

  return {
    level: current.level,
    title: current.title,
    minPoints: current.minPoints,
    nextLevelPoints: next ? next.minPoints : null,
    progressPercent,
    textColorClass: current.textColorClass,
    ringColorClass: current.ringColorClass,
  };
}

/**
 * Awards Aurelius Credits / Coins atomically using a Firestore transaction
 * so concurrent actions or stale closures never overwrite the user's true balance.
 */
export async function awardAureliusCoins(
  userId: string,
  _currentPoints: number | undefined,
  delta: number,
  extraFields?: Record<string, unknown>
): Promise<void> {
  if (!auth.currentUser || auth.currentUser.uid !== userId) return;
  const hasBookingCompletion =
    Boolean(extraFields && typeof extraFields.completedBookingsCount === 'number');
  if (!hasBookingCompletion) {
    const rate = checkActionRateLimit(`coins_${userId}`, {
      cooldownMs: 1500,
      maxInWindow: 15,
      windowMs: 60 * 1000,
    });
    if (!rate.allowed) return;
  }

  const safeDelta = Math.max(1, Math.min(40, Math.round(delta)));
  const userRef = doc(db, 'users', userId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) return;
      const data = snap.data() as UserProfile;
      if (data.isBanned) return;

      const serverPoints = Math.max(0, Math.floor(data.points || 0));
      const nextPoints = Math.min(1000000, serverPoints + safeDelta);
      const updatePayload: Record<string, unknown> = {
        points: nextPoints,
        updatedAt: serverTimestamp(),
      };

      if (extraFields && typeof extraFields.completedBookingsCount === 'number') {
        const serverCompleted = Math.max(0, Math.floor(data.completedBookingsCount || 0));
        updatePayload.completedBookingsCount = Math.min(100000, serverCompleted + 1);
      }

      tx.update(userRef, updatePayload);
    });
  } catch (err) {
    // Non-blocking reward write so primary UX (chat, booking, review) never stalls
    console.warn('Aurelius Credits reward update skipped:', err);
  }
}

export interface LiveStatusMeta {
  status: MemberLiveStatus;
  label: string;
  dotClass: string;
  textClass: string;
}

export function getEffectiveLiveStatus(
  user?: Pick<
    UserProfile,
    'isOnline' | 'lastActiveAt' | 'updatedAt' | 'liveStatus' | 'availability' | 'role' | 'roles' | 'hideOnlineStatus'
  > | null,
  forceOnline = false,
  nowMs = Date.now()
): LiveStatusMeta {
  if (!user) {
    return {
      status: 'offline',
      label: 'أوفلاين',
      dotClass: 'bg-[#5E5A54]',
      textClass: 'text-[#8B857B]',
    };
  }

  if (user.hideOnlineStatus && !forceOnline) {
    return {
      status: 'offline',
      label: 'أوفلاين',
      dotClass: 'bg-[#5E5A54]',
      textClass: 'text-[#8B857B]',
    };
  }

  if (user.liveStatus === 'offline') {
    return {
      status: 'offline',
      label: 'أوفلاين',
      dotClass: 'bg-[#5E5A54]',
      textClass: 'text-[#8B857B]',
    };
  }

  const browserOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  const onlineNow = (forceOnline && browserOnline) || isUserCurrentlyOnline(user, nowMs);
  if (!onlineNow) {
    return {
      status: 'offline',
      label: 'أوفلاين',
      dotClass: 'bg-[#5E5A54]',
      textClass: 'text-[#8B857B]',
    };
  }

  const isCutting =
    user.liveStatus === 'cutting' ||
    (isBarberMember(user) && user.availability === 'busy' && user.liveStatus !== 'online');

  if (isCutting) {
    return {
      status: 'cutting',
      label: 'مشغول',
      dotClass: 'bg-amber-400',
      textClass: 'text-amber-400',
    };
  }

  return {
    status: 'online',
    label: 'أونلاين',
    dotClass: 'bg-emerald-400',
    textClass: 'text-emerald-400',
  };
}
