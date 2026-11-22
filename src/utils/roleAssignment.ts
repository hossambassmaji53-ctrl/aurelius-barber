import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import {
  auth,
  createSafeId,
  db,
  handleFirestoreError,
  isSuperAdminEmail,
  OperationType,
} from '../firebase';
import { UserProfile, UserRole } from '../types';
import {
  assertFounderActor,
  formatRolesArabicSummary,
  getUserEffectivePermissions,
  hasRole,
  normalizeUserRoles,
} from './roles';

export async function assignMemberRoles(
  actor: UserProfile,
  target: UserProfile,
  requestedRoles: UserRole[],
  sourceLabel: string
): Promise<UserRole[] | null> {
  const isFounderAuth = isSuperAdminEmail(auth.currentUser?.email) && auth.currentUser?.uid === actor.uid;
  assertFounderActor(actor, isFounderAuth);

  // Founder role is permanent, exclusive, and cannot be assigned or stripped
  if (target.uid === actor.uid || hasRole(target, 'admin')) return null;

  const finalRoles = normalizeUserRoles(requestedRoles).filter((r) => r !== 'admin');
  const safeRoles: UserRole[] = finalRoles.length > 0 ? finalRoles : ['customer'];
  const primaryRole = safeRoles[0];
  const summaryLabel = formatRolesArabicSummary(safeRoles);

  try {
    await updateDoc(doc(db, 'users', target.uid), {
      role: primaryRole,
      roles: safeRoles,
      updatedAt: serverTimestamp(),
    });

    const logId = createSafeId('log');
    await setDoc(doc(db, 'activityLogs', logId), {
      id: logId,
      actorId: actor.uid,
      actorName: actor.displayName,
      action: `تعيين الرتب (${summaryLabel}) ${sourceLabel}`,
      targetUserId: target.uid,
      targetUserName: target.displayName,
      reason: `تعيين يدوي مباشر من المؤسس (${safeRoles.join(', ')})`,
      createdAt: serverTimestamp(),
    });

    const perms = getUserEffectivePermissions({ role: primaryRole, roles: safeRoles }, false);
    const perks: string[] = [];
    if (perms.accessStaffRoom) {
      perks.push('دخول غرفة الإدارة والإشراف ومراقبة الغرف');
    }
    if (perms.banUsers) {
      perks.push('صلاحيات الكتم والطرد والحظر');
    } else if (perms.muteUsers || perms.kickUsers) {
      perks.push('صلاحيات حذف الرسائل والكتم والطرد المخفف');
    }
    if (perms.publishGallery) {
      perks.push('النشر في المعرض العام');
    }
    if (perms.receiveBookings) {
      perks.push('استقبال الحجوزات وتحديد الموقع على الخريطة');
    }

    const bodyText =
      perks.length > 0
        ? `منحك المؤسس الرتب التالية: ${summaryLabel}. الصلاحيات المفعلة: ${perks.join('، ')}.`
        : 'تم تعديل رتبتك في المنصة إلى: زبون (عضو افتراضي).';

    const notifId = createSafeId('ntf');
    await setDoc(doc(db, 'notifications', notifId), {
      id: notifId,
      recipientId: target.uid,
      senderId: actor.uid,
      senderName: actor.displayName,
      type: 'role_update',
      title: 'تم تحديث رتبك وصلاحياتك في المنصة',
      body: bodyText.slice(0, 300),
      targetView: 'profile',
      targetId: target.uid,
      read: false,
      createdAt: serverTimestamp(),
    });

    return safeRoles;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `users/${target.uid}`);
    return null;
  }
}
