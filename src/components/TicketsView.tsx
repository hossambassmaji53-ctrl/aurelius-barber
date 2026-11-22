import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  CheckCircle2,
  Clock,
  Lock,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Ticket,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { db, createSafeId, handleFirestoreError, OperationType } from '../firebase';
import {
  SupportTicket,
  SupportTicketMessage,
  TicketCategory,
  TicketStatus,
  UserProfile,
} from '../types';
import {
  Avatar,
  RoleBadgesList,
  VipSilverStar,
  getRoleNameColor,
  getUserRoles,
  hasRole,
  isStaffMember,
} from './Avatar';
import { getEffectiveLiveStatus } from '../utils/gamification';
import {
  formatFullDateTime,
  formatLastSeen,
  formatMessageTime,
  tsToMillis,
  useNowTick,
} from '../utils/time';
import { ConfirmModal } from './ConfirmModal';
import {
  checkActionRateLimit,
  MAX_TEXT_LENGTHS,
  sanitizePlainText,
} from '../utils/security';

interface TicketsViewProps {
  currentUser: UserProfile;
  isSuperAdmin: boolean;
  users: UserProfile[];
  tickets: SupportTicket[];
  selectedTicketId: string | null;
  onSelectTicket: (id: string | null) => void;
  onOpenProfile: (uid: string) => void;
  embedded?: boolean;
}

const CATEGORY_LABELS: Record<TicketCategory, string> = {
  complaint: 'شكوى عامة أو على خدمة',
  report_user: 'الإبلاغ عن عضو أو مخالفة',
  technical: 'مشكلة تقنية في المنصة',
  inquiry: 'استفسار إداري خاص',
};

const STATUS_META: Record<TicketStatus, { label: string; color: string }> = {
  open: { label: 'جديد · بانتظار الاستلام', color: 'text-amber-400' },
  in_progress: { label: 'قيد المعالجة', color: 'text-sky-400' },
  closed: { label: 'مغلق بعد الحل', color: 'text-emerald-400' },
};

export const TicketsView: React.FC<TicketsViewProps> = ({
  currentUser,
  isSuperAdmin,
  users,
  tickets,
  selectedTicketId,
  onSelectTicket,
  onOpenProfile,
  embedded = false,
}) => {
  const isStaff = isStaffMember(currentUser, isSuperAdmin);
  const nowTick = useNowTick(20000);

  const [statusFilter, setStatusFilter] = useState<'all' | TicketStatus>('all');
  const [search, setSearch] = useState('');

  // Create ticket modal
  const [createOpen, setCreateOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<TicketCategory>('complaint');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [ticketError, setTicketError] = useState<string | null>(null);

  // Selected ticket thread
  const [messages, setMessages] = useState<SupportTicketMessage[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Close ticket modal
  const [closeModalTicket, setCloseModalTicket] = useState<SupportTicket | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');

  // Super Admin delete ticket confirmation
  const [confirmDeleteTicket, setConfirmDeleteTicket] = useState<SupportTicket | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const visibleTickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (!isStaff && t.userId !== currentUser.uid) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (!q) return true;
      return (
        t.subject.toLowerCase().includes(q) ||
        t.userName.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
      );
    });
  }, [tickets, isStaff, currentUser.uid, statusFilter, search]);

  const activeTicket = useMemo(
    () =>
      visibleTickets.find((t) => t.id === selectedTicketId) ||
      tickets.find((t) => t.id === selectedTicketId) ||
      null,
    [visibleTickets, tickets, selectedTicketId]
  );

  // Listen to messages inside active ticket confidentially
  useEffect(() => {
    if (!activeTicket) {
      setMessages([]);
      return;
    }

    const q = isStaff
      ? query(
          collection(db, 'supportTickets', activeTicket.id, 'messages'),
          where('ticketId', '==', activeTicket.id)
        )
      : query(
          collection(db, 'supportTickets', activeTicket.id, 'messages'),
          where('ticketId', '==', activeTicket.id),
          where('ticketOwnerId', '==', currentUser.uid)
        );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data({ serverTimestamps: 'estimate' }) as SupportTicketMessage)
          .sort((a, b) => tsToMillis(a.createdAt) - tsToMillis(b.createdAt));
        setMessages(list);
      },
      (err) => {
        handleFirestoreError(
          err,
          OperationType.LIST,
          `supportTickets/${activeTicket.id}/messages`
        );
      }
    );

    return () => unsub();
  }, [activeTicket?.id, isStaff, currentUser.uid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const staffRecipients = useMemo(
    () =>
      users.filter(
        (u) =>
          !u.isBanned &&
          u.uid !== currentUser.uid &&
          (hasRole(u, 'admin') || hasRole(u, 'moderator'))
      ),
    [users, currentUser.uid]
  );

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSubj = sanitizePlainText(subject, MAX_TEXT_LENGTHS.ticketSubject);
    const cleanDesc = sanitizePlainText(description, MAX_TEXT_LENGTHS.ticketDescription);
    if (!cleanSubj || !cleanDesc) return;
    const rate = checkActionRateLimit(`ticket_create_${currentUser.uid}`, {
      cooldownMs: 15000,
      maxInWindow: 4,
      windowMs: 300000,
    });
    if (!rate.allowed) {
      setTicketError(rate.message || 'يرجى التمهل قبل فتح تكت جديد.');
      return;
    }
    setTicketError(null);
    setCreating(true);
    try {
      const ticketId = createSafeId('tkt');

      await setDoc(doc(db, 'supportTickets', ticketId), {
        id: ticketId,
        userId: currentUser.uid,
        userName: sanitizePlainText(currentUser.displayName, MAX_TEXT_LENGTHS.displayName) || currentUser.displayName,
        userPhoto: currentUser.photoURL || '',
        userRole: currentUser.role,
        subject: cleanSubj,
        category,
        description: cleanDesc,
        status: 'open',
        assignedModeratorId: '',
        assignedModeratorName: '',
        resolutionNote: '',
        lastMessage: cleanDesc.slice(0, 300),
        lastMessageAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const firstMsgId = createSafeId('tmsg');
      await setDoc(doc(db, 'supportTickets', ticketId, 'messages', firstMsgId), {
        id: firstMsgId,
        ticketId,
        ticketOwnerId: currentUser.uid,
        senderId: currentUser.uid,
        senderName: currentUser.displayName,
        senderPhoto: currentUser.photoURL || '',
        senderRole: currentUser.role,
        text: cleanDesc.slice(0, 1200),
        createdAt: serverTimestamp(),
      });

      // Notify all moderators & Super Admin
      await Promise.all(
        staffRecipients.map((staff) => {
          const notifId = createSafeId('ntf');
          return setDoc(doc(db, 'notifications', notifId), {
            id: notifId,
            recipientId: staff.uid,
            senderId: currentUser.uid,
            senderName: currentUser.displayName,
            type: 'ticket_new',
            title: `تكت / شكوى جديدة من ${currentUser.displayName}`,
            body: cleanSubj.slice(0, 140),
            targetView: 'tickets',
            targetId: ticketId,
            read: false,
            createdAt: serverTimestamp(),
          });
        })
      );

      setCreateOpen(false);
      setSubject('');
      setDescription('');
      setCategory('complaint');
      onSelectTicket(ticketId);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'supportTickets');
    } finally {
      setCreating(false);
    }
  };

  const handleClaimTicket = async (ticket: SupportTicket) => {
    if (!isStaff) return;
    try {
      await updateDoc(doc(db, 'supportTickets', ticket.id), {
        status: 'in_progress',
        assignedModeratorId: currentUser.uid,
        assignedModeratorName: currentUser.displayName,
        updatedAt: serverTimestamp(),
      });

      if (ticket.userId !== currentUser.uid) {
        const notifId = createSafeId('ntf');
        await setDoc(doc(db, 'notifications', notifId), {
          id: notifId,
          recipientId: ticket.userId,
          senderId: currentUser.uid,
          senderName: currentUser.displayName,
          type: 'ticket_update',
          title: `تم استلام التكت الخاص بك`,
          body: `يتابع ${currentUser.displayName} الآن التكت "${ticket.subject}"`,
          targetView: 'tickets',
          targetId: ticket.id,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `supportTickets/${ticket.id}`);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket) return;
    const trimmed = sanitizePlainText(replyText, 1200);
    if (!trimmed) return;
    const rate = checkActionRateLimit(`ticket_reply_${currentUser.uid}`, {
      cooldownMs: 1200,
      maxInWindow: 12,
      windowMs: 60000,
    });
    if (!rate.allowed) {
      setTicketError(rate.message || 'يرجى التمهل قبل إرسال رد جديد.');
      return;
    }
    setTicketError(null);
    setSendingReply(true);
    try {
      const msgId = createSafeId('tmsg');

      await setDoc(doc(db, 'supportTickets', activeTicket.id, 'messages', msgId), {
        id: msgId,
        ticketId: activeTicket.id,
        ticketOwnerId: activeTicket.userId,
        senderId: currentUser.uid,
        senderName: sanitizePlainText(currentUser.displayName, MAX_TEXT_LENGTHS.displayName) || currentUser.displayName,
        senderPhoto: currentUser.photoURL || '',
        senderRole: currentUser.role,
        text: trimmed,
        createdAt: serverTimestamp(),
      });

      const ticketUpdate: Record<string, unknown> = {
        lastMessage: trimmed.slice(0, 300),
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // If staff replies to an open ticket, auto-move to in_progress & claim if unclaimed
      if (isStaff && activeTicket.status === 'open') {
        ticketUpdate.status = 'in_progress';
        if (!activeTicket.assignedModeratorId) {
          ticketUpdate.assignedModeratorId = currentUser.uid;
          ticketUpdate.assignedModeratorName = currentUser.displayName;
        }
      }

      await updateDoc(doc(db, 'supportTickets', activeTicket.id), ticketUpdate);

      // Send confidential notification
      if (isStaff && activeTicket.userId !== currentUser.uid) {
        const notifId = createSafeId('ntf');
        await setDoc(doc(db, 'notifications', notifId), {
          id: notifId,
          recipientId: activeTicket.userId,
          senderId: currentUser.uid,
          senderName: currentUser.displayName,
          type: 'ticket_update',
          title: `رد جديد على التكت: ${activeTicket.subject}`,
          body: trimmed.slice(0, 140),
          targetView: 'tickets',
          targetId: activeTicket.id,
          read: false,
          createdAt: serverTimestamp(),
        });
      } else if (!isStaff) {
        const recipients = activeTicket.assignedModeratorId
          ? users.filter(
              (u) =>
                u.uid === activeTicket.assignedModeratorId || hasRole(u, 'admin')
            )
          : staffRecipients;

        const uniqueRecipients = Array.from(
          new Map(recipients.map((r) => [r.uid, r])).values()
        ).filter((r) => r.uid !== currentUser.uid);

        await Promise.all(
          uniqueRecipients.map((r) => {
            const notifId = createSafeId('ntf');
            return setDoc(doc(db, 'notifications', notifId), {
              id: notifId,
              recipientId: r.uid,
              senderId: currentUser.uid,
              senderName: currentUser.displayName,
              type: 'ticket_update',
              title: `رسالة في التكت: ${activeTicket.subject}`,
              body: trimmed.slice(0, 140),
              targetView: 'tickets',
              targetId: activeTicket.id,
              read: false,
              createdAt: serverTimestamp(),
            });
          })
        );
      }

      setReplyText('');
    } catch (err) {
      handleFirestoreError(
        err,
        OperationType.CREATE,
        `supportTickets/${activeTicket.id}/messages`
      );
    } finally {
      setSendingReply(false);
    }
  };
                                  const handleCloseTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closeModalTicket) return;
    const t = closeModalTicket;
    const note =
      sanitizePlainText(resolutionNote, 400) || 'تم حل المشكلة وإغلاق التكت.';
    try {
      await updateDoc(doc(db, 'supportTickets', t.id), {
        status: 'closed',
        resolutionNote: note,
        updatedAt: serverTimestamp(),
      });

      if (t.userId !== currentUser.uid) {
        const notifId = createSafeId('ntf');
        await setDoc(doc(db, 'notifications', notifId), {
          id: notifId,
          recipientId: t.userId,
          senderId: currentUser.uid,
          senderName: currentUser.displayName,
          type: 'ticket_update',
          title: `تم إغلاق التكت بعد الحل`,
          body: `${t.subject}: ${note.slice(0, 120)}`,
          targetView: 'tickets',
          targetId: t.id,
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      setCloseModalTicket(null);
      setResolutionNote('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `supportTickets/${t.id}`);
    }
  };

  const handleReopenTicket = async (ticket: SupportTicket) => {
    if (!isSuperAdmin) return;
    try {
      await updateDoc(doc(db, 'supportTickets', ticket.id), {
        status: 'in_progress',
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `supportTickets/${ticket.id}`);
    }
  };

  const handleDeleteTicket = async (ticket: SupportTicket) => {
    if (!isSuperAdmin) return;
    try {
      const msgsSnap = await getDocs(
        query(collection(db, 'supportTickets', ticket.id, 'messages'))
      );
      const batch = writeBatch(db);
      msgsSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      await deleteDoc(doc(db, 'supportTickets', ticket.id));
      if (selectedTicketId === ticket.id) {
        onSelectTicket(null);
      }
      setConfirmDeleteTicket(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `supportTickets/${ticket.id}`);
    }
  };

  const openCount = tickets.filter((t) => t.status === 'open').length;
  const inProgressCount = tickets.filter((t) => t.status === 'in_progress').length;

  return (
    <div className="space-y-6">
      {/* Header (Hidden when embedded inside Staff Room) */}
      {!embedded && (
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#D4A853]">
              <Lock className="w-3.5 h-3.5" />
              <span>قنوات تواصل سرية ومباشرة مع المشرفين والإدارة</span>
            </div>
            <h1 className="text-2xl font-bold text-[#F5F2EB] mt-1">
              {isStaff ? 'إدارة التكتات والشكاوى' : 'التكتات وتقديم الشكاوى'}
            </h1>
            <p className="text-sm text-[#9C968B] mt-1">
              {isSuperAdmin
                ? 'إشراف كامل على جميع التكتات، متابعة استلام المشرفين، والرد أو الإغلاق النهائي.'
                : isStaff
                  ? 'استلم الشكاوى والتكتات المفتوحة، تواصل مع أصحابها بسرية تامة، وأغلقها بعد الحل.'
                  : 'افتح تكت شكوى أو استفسار سري ليظهر للمشرفين والمدير فقط دون اطلاع بقية الأعضاء.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold self-start cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>تقديم شكوى / فتح تكت</span>
          </button>
        </div>
      )}

      {/* Staff Summary & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-[#141419] border border-[#27272F] rounded-xl overflow-x-auto">
          {[
            { key: 'all' as const, label: `الكل (${tickets.length})` },
            { key: 'open' as const, label: `جديد (${openCount})` },
            { key: 'in_progress' as const, label: `قيد المعالجة (${inProgressCount})` },
            { key: 'closed' as const, label: 'مغلق' },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setStatusFilter(item.key)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                statusFilter === item.key
                  ? 'bg-[#D4A853] text-[#0B0B0E]'
                  : 'text-[#A6A196] hover:text-[#F5F2EB]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-[#8B857B] absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث في التكتات..."
            className="w-full bg-[#141419] border border-[#27272F] focus:border-[#D4A853] rounded-xl py-2.5 pr-10 pl-3.5 text-xs text-[#F5F2EB] outline-none"
          />
        </div>
      </div>

      {/* Tickets Master-Detail Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[70vh] min-h-[500px]">
        {/* Ticket Queue Sidebar */}
        <aside className="lg:col-span-4 bg-[#141419] border border-[#27272F] rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3.5 border-b border-[#22222A] flex items-center justify-between">
            <span className="text-sm font-bold text-[#F5F2EB]">
              {isStaff ? 'صندوق التكتات الواردة' : 'تكتاتي الخاصة'}
            </span>
            <span className="text-xs font-mono-num text-[#9C968B]">
              {visibleTickets.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#22222A]">
            {visibleTickets.length === 0 ? (
              <div className="p-8 text-center space-y-2 text-xs text-[#8B857B]">
                <Ticket className="w-8 h-8 mx-auto opacity-40" />
                <p>لا توجد تكتات مطابقة للتصفية الحالية.</p>
              </div>
            ) : (
              visibleTickets.map((t) => {
                const st = STATUS_META[t.status];
                const isSelected = activeTicket?.id === t.id;
                const ownerProfile = users.find((u) => u.uid === t.userId);
                const ownerRoles = ownerProfile
                  ? getUserRoles(ownerProfile)
                  : [t.userRole];
                const ownerPrimary = ownerRoles[0];
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelectTicket(t.id)}
                    className={`w-full text-right p-4 space-y-1.5 transition-colors cursor-pointer ${
                      isSelected ? 'bg-[#1D1C24]' : 'hover:bg-[#191920]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#F5F2EB] truncate">
                        {t.subject}
                      </span>
                      <span className={`text-[10px] font-bold shrink-0 ${st.color}`}>
                        {t.status === 'open'
                          ? 'جديد'
                          : t.status === 'in_progress'
                            ? 'قيد الحل'
                            : 'مغلق'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-[#9C968B] flex-wrap">
                      <span className={`font-semibold ${getRoleNameColor(ownerPrimary)}`}>
                        {ownerProfile?.displayName || t.userName}
                      </span>
                      <VipSilverStar roles={ownerRoles} size="xs" />
                      <RoleBadgesList roles={ownerRoles} size="xs" compact />
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{CATEGORY_LABELS[t.category]}</span>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      {t.assignedModeratorName ? (
                        <span className="text-sky-400">
                          المسؤول: {t.assignedModeratorName}
                        </span>
                      ) : (
                        <span />
                      )}
                      {formatMessageTime(t.lastMessageAt || t.createdAt, nowTick) && (
                        <span
                          title={formatFullDateTime(t.lastMessageAt || t.createdAt)}
                          className="font-mono-num text-[#8B857B]"
                        >
                          {formatMessageTime(t.lastMessageAt || t.createdAt, nowTick)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Active Ticket Thread */}
        <section className="lg:col-span-8 bg-[#141419] border border-[#27272F] rounded-2xl overflow-hidden flex flex-col">
          {!activeTicket ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3 text-[#8B857B]">
              <ShieldCheck className="w-10 h-10 text-[#D4A853] opacity-60" />
              <div className="text-sm font-bold text-[#F5F2EB]">
                اختر تكتاً لعرض التفاصيل والمراسلة السرية
              </div>
              <p className="text-xs max-w-sm leading-relaxed">
                جميع التكتات مشفرة ومقتصرة فقط على صاحب الشكوى والمشرفين وإدارة المنصة.
              </p>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="px-5 py-4 border-b border-[#22222A] flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-[#F5F2EB]">
                      {activeTicket.subject}
                    </h2>
                    <span className={`text-xs font-bold ${STATUS_META[activeTicket.status].color}`}>
                      {STATUS_META[activeTicket.status].label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[#9C968B] flex-wrap">
                    {(() => {
                      const ownerProfile = users.find((u) => u.uid === activeTicket.userId);
                      const ownerRoles = ownerProfile
                        ? getUserRoles(ownerProfile)
                        : [activeTicket.userRole];
                      const ownerPrimary = ownerRoles[0];
                      return (
                        <button
                          type="button"
                          onClick={() => onOpenProfile(activeTicket.userId)}
                          className="inline-flex items-center gap-1.5 hover:opacity-90 cursor-pointer flex-wrap"
                        >
                          <Avatar
                            src={ownerProfile?.photoURL || activeTicket.userPhoto}
                            name={ownerProfile?.displayName || activeTicket.userName}
                            size="xs"
                            role={ownerPrimary}
                            roles={ownerRoles}
                          />
                          <span className={`font-bold ${getRoleNameColor(ownerPrimary)}`}>
                            {ownerProfile?.displayName || activeTicket.userName}
                          </span>
                          <VipSilverStar roles={ownerRoles} size="xs" />
                          <RoleBadgesList roles={ownerRoles} size="xs" compact />
                        </button>
                      );
                    })()}
                    <span aria-hidden="true">·</span>
                    <span>{CATEGORY_LABELS[activeTicket.category]}</span>
                    {activeTicket.assignedModeratorName && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-sky-400">
                          مستلم من: {activeTicket.assignedModeratorName}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Staff & Admin Actions */}
                <div className="flex flex-wrap items-center gap-2">
                  {isStaff &&
                    activeTicket.status !== 'closed' &&
                    activeTicket.assignedModeratorId !== currentUser.uid && (
                      <button
                        type="button"
                        onClick={() => handleClaimTicket(activeTicket)}
                        className="px-3.5 py-2 rounded-xl bg-sky-500/15 hover:bg-sky-500 text-sky-300 hover:text-[#0B0B0E] text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>استلام التكت</span>
                      </button>
                    )}

                  {activeTicket.status !== 'closed' &&
                    (isStaff || activeTicket.userId === currentUser.uid) && (
                      <button
                        type="button"
                        onClick={() => {
                          setResolutionNote('');
                          setCloseModalTicket(activeTicket);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 text-emerald-300 hover:text-[#0B0B0E] text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>إغلاق بعد الحل</span>
                      </button>
                    )}

                  {isSuperAdmin && activeTicket.status === 'closed' && (
                    <button
                      type="button"
                      onClick={() => handleReopenTicket(activeTicket)}
                      className="px-3.5 py-2 rounded-xl bg-[#1E1E28] hover:bg-[#2A2A36] text-xs font-semibold text-[#F5F2EB] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Clock className="w-3.5 h-3.5 text-[#D4A853]" />
                      <span>إعادة فتح</span>
                    </button>
                  )}

                  {isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteTicket(activeTicket)}
                      title="حذف التكت نهائياً"
                      className="p-2 rounded-xl bg-[#1E1E26] hover:bg-red-500/20 text-[#9C968B] hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
                      {/* Confidential Messages Stream */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
                {activeTicket.status === 'closed' && activeTicket.resolutionNote && (
                  <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200">
                    <strong>ملخص الإغلاق:</strong> {activeTicket.resolutionNote}
                  </div>
                )}

                {messages.map((m) => {
                  const isOwn = m.senderId === currentUser.uid;
                  const senderProfile = users.find((u) => u.uid === m.senderId);
                  const senderRoles = senderProfile
                    ? getUserRoles(senderProfile)
                    : [m.senderRole];
                  const senderPrimary = senderRoles[0];
                  return (
                    <div
                      key={m.id}
                      className={`flex items-start gap-2.5 ${
                        isOwn ? 'flex-row-reverse' : ''
                      }`}
                    >
                      <Avatar
                        src={senderProfile?.photoURL || m.senderPhoto}
                        name={senderProfile?.displayName || m.senderName}
                        size="xs"
                        role={senderPrimary}
                        roles={senderRoles}
                      />
                      <div className="max-w-[78%] space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-bold ${getRoleNameColor(senderPrimary)}`}>
                            {senderProfile?.displayName || m.senderName}
                          </span>
                          <VipSilverStar roles={senderRoles} size="xs" />
                          <RoleBadgesList roles={senderRoles} size="xs" />
                          {(() => {
                            const senderLive = getEffectiveLiveStatus(
                              senderProfile,
                              isOwn && senderProfile?.liveStatus !== 'offline',
                              nowTick
                            );
                            const msgTime = formatMessageTime(m.createdAt, nowTick);
                            const statusText =
                              senderLive.status === 'offline'
                                ? senderProfile?.lastActiveAt
                                  ? `أوفلاين · آخر ظهور ${formatLastSeen(senderProfile.lastActiveAt, nowTick)}`
                                  : 'أوفلاين'
                                : senderLive.label;
                            return (
                              <>
                                <span
                                  className={`inline-flex items-center gap-1 text-[10px] font-semibold ${senderLive.textClass}`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${senderLive.dotClass}`} />
                                  {statusText}
                                </span>
                                {msgTime && (
                                  <span
                                    title={formatFullDateTime(m.createdAt)}
                                    className="text-[10px] font-mono-num text-[#8B857B]"
                                  >
                                    · {msgTime}
                                  </span>
                                )}
                              </>
                            );
                          })()}
                        </div>
                        <div
                          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed break-words ${
                            isOwn
                              ? 'bg-[#2A2316] border border-[#D4A853]/30 text-[#F5F2EB]'
                              : 'bg-[#1A1A22] border border-[#282832] text-[#E6E1D8]'
                          }`}
                        >
                          {m.text}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {/* Composer or Closed State */}
              {activeTicket.status === 'closed' && !isSuperAdmin ? (
                <div className="p-4 border-t border-[#22222A] bg-[#121217] text-center text-xs text-[#9C968B]">
                  تم إغلاق هذا التكت بعد الحل. يمكنك فتح تكت جديد في أي وقت عند الحاجة.
                </div>
              ) : (
                <div>
                  {ticketError && (
                    <div className="px-4 py-2 border-t border-red-500/30 bg-red-500/10 flex items-center justify-between text-xs text-red-300">
                      <span>{ticketError}</span>
                      <button
                        type="button"
                        onClick={() => setTicketError(null)}
                        className="p-0.5 text-red-300 hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  <form
                    onSubmit={handleSendReply}
                    className="p-3.5 border-t border-[#22222A] bg-[#121217] flex items-center gap-2.5"
                  >
                    <input
                      type="text"
                      maxLength={1200}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="اكتب رداً سرياً ضمن التكت..."
                      className="flex-1 bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-4 py-2.5 text-sm text-[#F5F2EB] outline-none"
                    />
                    <button
                      type="submit"
                      disabled={sendingReply || !replyText.trim()}
                      className="px-4 py-2.5 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <span>إرسال</span>
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* Create Ticket Modal */}
      {createOpen && (
        <div
          onClick={() => setCreateOpen(false)}
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#141419] border border-[#2C2C35] rounded-2xl p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#F5F2EB] flex items-center gap-2">
                <Ticket className="w-5 h-5 text-[#D4A853]" />
                <span>تقديم شكوى / فتح تكت سري</span>
              </h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="p-1.5 rounded-lg text-[#9C968B] hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#C8C2B8]">نوع التكت</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TicketCategory)}
                  className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none"
                >
                  <option value="complaint">{CATEGORY_LABELS.complaint}</option>
                  <option value="report_user">{CATEGORY_LABELS.report_user}</option>
                  <option value="technical">{CATEGORY_LABELS.technical}</option>
                  <option value="inquiry">{CATEGORY_LABELS.inquiry}</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#C8C2B8]">عنوان الشكوى أو التكت</label>
                <input
                  type="text"
                  required
                  maxLength={140}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="مثال: بلاغ عن مخالفة في الدردشة أو مشكلة بحجز"
                  className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-[#C8C2B8]">التفاصيل الكاملة</label>
                <textarea
                  rows={4}
                  required
                  maxLength={1500}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="اشرح المشكلة بوضوح... لن يطلع على هذه الرسالة سوى المؤسس والطاقم الإشرافي المخوّل."
                  className="w-full bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 rounded-xl bg-[#1E1E26] text-xs text-[#F5F2EB] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold cursor-pointer disabled:opacity-60"
                >
                  {creating ? 'جاري الإرسال...' : 'إرسال التكت للمشرفين'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Close Ticket Modal */}
      {closeModalTicket && (
        <div
          onClick={() => setCloseModalTicket(null)}
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-[#141419] border border-[#2C2C35] rounded-2xl p-6 space-y-4"
          >
            <h3 className="text-base font-bold text-[#F5F2EB]">
              إغلاق التكت بعد الحل
            </h3>
            <form onSubmit={handleCloseTicket} className="space-y-4">
              <textarea
                rows={3}
                maxLength={400}
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="ملاحظة الإغلاق أو الحل الذي تم تنفيذه (اختياري)..."
                className="w-full bg-[#1A1A22] border border-[#2C2C35] rounded-xl p-3 text-xs text-[#F5F2EB] outline-none resize-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCloseModalTicket(null)}
                  className="px-4 py-2 rounded-xl bg-[#1E1E26] text-xs text-[#F5F2EB] cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#0B0B0E] text-xs font-bold cursor-pointer"
                >
                  تأكيد الإغلاق
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Ticket Confirmation Modal */}
      <ConfirmModal
        open={Boolean(confirmDeleteTicket)}
        title="هل أنت متأكد من حذف التكت؟"
        message={
          confirmDeleteTicket
            ? `سيتم حذف التكت "${confirmDeleteTicket.subject}" وجميع رسائله نهائياً.`
            : ''
        }
        confirmLabel="نعم، حذف التكت"
        onCancel={() => setConfirmDeleteTicket(null)}
        onConfirm={() => {
          if (confirmDeleteTicket) {
            return handleDeleteTicket(confirmDeleteTicket);
          }
        }}
      />
    </div>
  );
};
                  
