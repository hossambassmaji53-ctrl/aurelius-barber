import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { formatLastSeen, ONLINE_STALE_MS, tsToMillis } from './utils/time';

export const ADMIN_EMAIL = 'hossambassmaji53@gmail.com';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration: the client is offline.');
    }
  }
}

testConnection();

export function createSafeId(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function makeConversationId(uid1: string, uid2: string): string {
  const sorted = [uid1, uid2].sort();
  return `${sorted[0]}_${sorted[1]}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}

export function isSuperAdminEmail(email?: string | null): boolean {
  return (email || '').trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

export { formatLastSeen, tsToMillis };

export function isUserCurrentlyOnline(
  user?: {
    isOnline?: boolean;
    lastActiveAt?: any;
    updatedAt?: any;
    liveStatus?: string;
  } | null,
  nowMs = Date.now()
): boolean {
  if (!user || !user.isOnline || user.liveStatus === 'offline') return false;
  const ms = tsToMillis(user.lastActiveAt || user.updatedAt);
  if (!ms) return false;
  return nowMs - ms < ONLINE_STALE_MS;
}

export function makeLikeId(
  targetType: 'profile' | 'gallery',
  targetId: string,
  userId: string
): string {
  return `${targetType}_${targetId}_${userId}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
}
