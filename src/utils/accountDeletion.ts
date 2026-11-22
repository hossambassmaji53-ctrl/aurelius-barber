import {
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, googleProvider, isSuperAdminEmail } from '../firebase';
import { UserProfile } from '../types';

async function deleteQueryDocsInBatches(docsList: { ref: any }[]): Promise<void> {
  const chunkSize = 400;
  for (let i = 0; i < docsList.length; i += chunkSize) {
    const chunk = docsList.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    const batch = writeBatch(db);
    chunk.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

export interface DeleteAccountResult {
  ok: boolean;
  error?: string;
  requiresPassword?: boolean;
}

/**
 * Performs permanent in-app account and user data deletion across Firestore and
 * Firebase Authentication in compliance with Google Play Account Deletion rules.
 */
export async function deleteOwnAccountAndData(
  currentUser: UserProfile,
  fbUser: User,
  passwordForReauth?: string
): Promise<DeleteAccountResult> {
  if (isSuperAdminEmail(fbUser.email) || currentUser.role === 'admin') {
    return {
      ok: false,
      error: 'حساب المؤسس الرئيسي محمي ولا يمكن حذفه تلقائياً من واجهة المستخدم.',
    };
  }

  const uid = fbUser.uid;
  if (currentUser.uid !== uid) {
    return { ok: false, error: 'تعذر التحقق من ملكية الحساب.' };
  }

  try {
    // 1. Delete user's conversations and their nested messages first
    const [convSnap1, convSnap2] = await Promise.all([
      getDocs(query(collection(db, 'conversations'), where('participant1Id', '==', uid))),
      getDocs(query(collection(db, 'conversations'), where('participant2Id', '==', uid))),
    ]);
    const convDocs = [...convSnap1.docs, ...convSnap2.docs];
    for (const cDoc of convDocs) {
      const cData = cDoc.data() as { participant1Id?: string; participant2Id?: string };
      const participantField =
        cData.participant1Id === uid ? 'participant1Id' : 'participant2Id';
      const msgsSnap = await getDocs(
        query(
          collection(db, 'conversations', cDoc.id, 'messages'),
          where('conversationId', '==', cDoc.id),
          where(participantField, '==', uid)
        )
      );
      await deleteQueryDocsInBatches(msgsSnap.docs);
      await deleteDoc(cDoc.ref);
    }

    // 2. Delete user's confidential support tickets & ticket messages
    const ticketSnap = await getDocs(
      query(collection(db, 'supportTickets'), where('userId', '==', uid))
    );
    for (const tDoc of ticketSnap.docs) {
      const tMsgsSnap = await getDocs(
        query(
          collection(db, 'supportTickets', tDoc.id, 'messages'),
          where('ticketOwnerId', '==', uid)
        )
      );
      await deleteQueryDocsInBatches(tMsgsSnap.docs);
      await deleteDoc(tDoc.ref);
    }

    // 3. Delete owned top-level records and blocked users subcollection
    const queriesToDelete = [
      getDocs(query(collection(db, 'posts'), where('authorId', '==', uid))),
      getDocs(query(collection(db, 'likes'), where('userId', '==', uid))),
      getDocs(query(collection(db, 'storyReactions'), where('userId', '==', uid))),
      getDocs(query(collection(db, 'gallery'), where('barberId', '==', uid))),
      getDocs(query(collection(db, 'stories'), where('barberId', '==', uid))),
      getDocs(query(collection(db, 'verificationRequests'), where('userId', '==', uid))),
      getDocs(query(collection(db, 'notifications'), where('recipientId', '==', uid))),
      getDocs(query(collection(db, 'friendships'), where('user1Id', '==', uid))),
      getDocs(query(collection(db, 'friendships'), where('user2Id', '==', uid))),
      getDocs(query(collection(db, 'typingStatuses'), where('userId', '==', uid))),
      getDocs(query(collection(db, 'users', uid, 'blockedUsers'))),
    ];

    const snaps = await Promise.all(queriesToDelete);
    for (const snap of snaps) {
      if (!snap.empty) {
        await deleteQueryDocsInBatches(snap.docs);
      }
    }

    // 4. Delete private info document and public profile document
    try {
      await deleteDoc(doc(db, 'users', uid, 'private', 'info'));
    } catch {
      // May not exist if profile created with legacy provider
    }
    await deleteDoc(doc(db, 'users', uid));

    // 5. Delete Firebase Auth user (with re-auth fallback if session is old)
    try {
      await deleteUser(fbUser);
    } catch (authErr: unknown) {
      const code = (authErr as { code?: string })?.code || '';
      if (code === 'auth/requires-recent-login') {
        const usesPassword = fbUser.providerData.some(
          (p) => p.providerId === 'password'
        );
        if (usesPassword && !passwordForReauth) {
          return {
            ok: false,
            requiresPassword: true,
            error: 'لحماية حسابك، يرجى إدخال كلمة المرور الحالية لإتمام الحذف النهائي.',
          };
        }
        if (usesPassword && passwordForReauth && fbUser.email) {
          const cred = EmailAuthProvider.credential(fbUser.email, passwordForReauth);
          await reauthenticateWithCredential(fbUser, cred);
          await deleteUser(fbUser);
          return { ok: true };
        }
        // Google OAuth re-auth popup
        await reauthenticateWithPopup(fbUser, googleProvider);
        await deleteUser(fbUser);
        return { ok: true };
      }
      throw authErr;
    }

    return { ok: true };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      return {
        ok: false,
        requiresPassword: true,
        error: 'كلمة المرور غير صحيحة. يرجى التأكد والمحاولة مرة أخرى.',
      };
    }
    if (code === 'auth/popup-closed-by-user') {
      return {
        ok: false,
        error: 'تم إغلاق نافذة التحقق قبل تأكيد حذف الحساب.',
      };
    }
    return {
      ok: false,
      error: 'تعذر إتمام حذف الحساب بالكامل حالياً. يرجى إعادة المحاولة.',
    };
  }
}
