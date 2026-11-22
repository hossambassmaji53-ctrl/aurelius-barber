import {
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  createSafeId,
  db,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import { Friendship, UserProfile } from '../types';
import { hasRole, isBarberMember } from './roles';
import {
  checkActionRateLimit,
  MAX_TEXT_LENGTHS,
  sanitizeMediaUrl,
  sanitizePlainText,
} from './security';

export function makeFriendshipId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}

export function canSendFriendRequest(
  sender: UserProfile,
  recipient: UserProfile
): { allowed: boolean; reason?: string } {
  if (!recipient || sender.uid === recipient.uid) {
    return { allowed: false, reason: 'لا يمكن إرسال طلب صداقة لنفسك' };
  }
  if (recipient.isBanned) {
    return { allowed: false, reason: 'هذا الحساب غير متاح' };
  }
  const policy = recipient.friendRequestPolicy || 'everyone';
  if (policy === 'nobody') {
    return { allowed: false, reason: 'هذا العضو أغلق استقبال طلبات الصداقة' };
  }
  if (policy === 'barbers_only') {
    const senderEligible = isBarberMember(sender) || hasRole(sender, 'admin');
    if (!senderEligible) {
      return {
        allowed: false,
        reason: 'هذا العضو يقبل طلبات الصداقة من الحلاقين الموثقين فقط',
      };
    }
  }
  return { allowed: true };
}

export async function sendFriendRequest(
  sender: UserProfile,
  recipient: UserProfile
): Promise<void> {
  const check = canSendFriendRequest(sender, recipient);
  if (!check.allowed) {
    throw new Error(check.reason || 'تعذر إرسال طلب الصداقة');
  }

  const rate = checkActionRateLimit(`friend_${sender.uid}`, {
    cooldownMs: 2500,
    maxInWindow: 10,
    windowMs: 60 * 1000,
  });
  if (!rate.allowed) {
    throw new Error(rate.message || 'يرجى الانتظار قبل إرسال طلب صداقة جديد.');
  }

  const [user1Id, user2Id] = [sender.uid, recipient.uid].sort();
  const friendshipId = `${user1Id}_${user2Id}`;
  const reqName =
    sanitizePlainText(sender.displayName, MAX_TEXT_LENGTHS.displayName, { multiline: false }) ||
    'عضو';
  const recName =
    sanitizePlainText(recipient.displayName, MAX_TEXT_LENGTHS.displayName, { multiline: false }) ||
    'عضو';
  const reqPhoto = sanitizeMediaUrl(sender.photoURL);
  const recPhoto = sanitizeMediaUrl(recipient.photoURL);

  const payload = {
    id: friendshipId,
    user1Id,
    user2Id,
    requesterId: sender.uid,
    recipientId: recipient.uid,
    requesterName: reqName,
    ...(reqPhoto ? { requesterPhoto: reqPhoto } : {}),
    recipientName: recName,
    ...(recPhoto ? { recipientPhoto: recPhoto } : {}),
    status: 'pending' as const,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'friendships', friendshipId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `friendships/${friendshipId}`);
    return;
  }

  const notifId = createSafeId('notif');
  try {
    await setDoc(doc(db, 'notifications', notifId), {
      id: notifId,
      recipientId: recipient.uid,
      senderId: sender.uid,
      senderName: sender.displayName.slice(0, 80),
      type: 'friend_request',
      title: 'طلب صداقة جديد',
      body: `أرسل لك ${sender.displayName} طلب صداقة`,
      targetView: 'private_chat',
      targetId: friendshipId,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Friend request notification skipped:', err);
  }
}

export async function acceptFriendRequest(
  friendship: Friendship,
  accepter: UserProfile
): Promise<void> {
  if (friendship.recipientId !== accepter.uid || friendship.status !== 'pending') {
    return;
  }

  try {
    await updateDoc(doc(db, 'friendships', friendship.id), {
      status: 'accepted',
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `friendships/${friendship.id}`);
    return;
  }

  const notifId = createSafeId('notif');
  try {
    await setDoc(doc(db, 'notifications', notifId), {
      id: notifId,
      recipientId: friendship.requesterId,
      senderId: accepter.uid,
      senderName: accepter.displayName.slice(0, 80),
      type: 'friend_accept',
      title: 'تم قبول طلب الصداقة',
      body: `وافق ${accepter.displayName} على طلب الصداقة وأصبحتما أصدقاء`,
      targetView: 'profile',
      targetId: accepter.uid,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Friend accept notification skipped:', err);
  }
}

export async function rejectOrRemoveFriendship(friendshipId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'friendships', friendshipId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `friendships/${friendshipId}`);
  }
}
