import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Conversation, UserProfile } from '../types';

export async function setRoomTypingStatus(
  roomKey: string,
  scope: 'global' | 'local',
  user: Pick<UserProfile, 'uid' | 'displayName'>,
  isTyping: boolean
): Promise<void> {
  if (!roomKey || !user?.uid) return;
  const typingId = `${roomKey}_${user.uid}`;
  try {
    await setDoc(doc(db, 'typingStatuses', typingId), {
      id: typingId,
      scope,
      roomKey,
      userId: user.uid,
      userName: (user.displayName || 'عضو').slice(0, 80),
      isTyping,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    // Non-blocking ephemeral indicator
    console.warn('Room typing status update skipped:', err);
  }
}

export async function setDmTypingStatus(
  conversation: Pick<Conversation, 'id' | 'participant1Id' | 'participant2Id'>,
  user: Pick<UserProfile, 'uid' | 'displayName'>,
  isTyping: boolean
): Promise<void> {
  if (!conversation?.id || !user?.uid) return;
  try {
    await setDoc(doc(db, 'conversations', conversation.id, 'typing', user.uid), {
      id: user.uid,
      conversationId: conversation.id,
      participant1Id: conversation.participant1Id,
      participant2Id: conversation.participant2Id,
      userId: user.uid,
      userName: (user.displayName || 'عضو').slice(0, 80),
      isTyping,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    // Non-blocking ephemeral indicator
    console.warn('DM typing status update skipped:', err);
  }
}
