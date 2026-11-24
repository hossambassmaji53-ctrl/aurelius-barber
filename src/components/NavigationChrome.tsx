import React, { useEffect, useRef, useState } from 'react';
import {
  Ban,
  Bell,
  BookOpen,
  CalendarClock,
  CheckCheck,
  ChevronLeft,
  Coins,
  Film,
  Heart,
  HelpCircle,
  Image as ImageIcon,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  Scissors,
  Shield,
  ShieldCheck,
  ShoppingBag,
  UserCheck,
  UserPlus,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  AppNotification,
  AppView,
  Friendship,
  MemberLiveStatus,
  NotificationType,
  UserProfile,
} from '../types';
import {
  Avatar,
  RoleBadgesList,
  VipSilverStar,
  getEffectiveNameColorClass,
  getPrimaryRole,
  getUserRoles,
  isStaffMember,
} from './Avatar';
const getCommunityLevel = (..._args: unknown[]) => 1; const getEffectiveLiveStatus = (..._args: unknown[]) => 'online';
import { formatFullDateTime, formatMessageTime, useNowTick } from '../utils/time';
import { getUserHandle } from '../utils/userHandle';
import { getCountryByCode } from '../utils/countries';
import { PWAInstallButton } from './PWAInstallButton';
import { CountryFlag } from './CountryPickerModal';

interface NavigationChromeProps {
  currentUser: UserProfile;
  isSuperAdmin: boolean;
  activeView: AppView;
  onChangeView: (view: AppView) => void;
  onGoHome?: () => void;
  onOpenOwnProfile: () => void;
  notifications: AppNotification[];
  onNotificationClick: (notification: AppNotification) => void;
  onMarkAllRead: () => void;
  friendships?: Friendship[];
  onAcceptFriendRequest?: (friendship: Friendship) => Promise<void> | void;
  onRejectFriendRequest?: (friendshipId: string) => Promise<void> | void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onOpenTour: () => void;
  onSignOut: () => void;
  pendingBookingsCount: number;
  pendingVerificationCount: number;
  openTicketsCount: number;
  activeStoriesCount?: number;
  activeCountryCode: string;
  onOpenCountrySwitcher: () => void;
  onChangeLiveStatus?: (status: MemberLiveStatus) => Promise<void> | void;
  onOpenPrivacy?: (tab?: 'privacy' | 'delete') => void;
}

export const NavigationChrome: React.FC<NavigationChromeProps> = ({
  currentUser,
  isSuperAdmin,
  activeView,
  onChangeView,
  onGoHome,
  onOpenOwnProfile,
  notifications,
  onNotificationClick,
  onMarkAllRead,
  friendships = [],
  onAcceptFriendRequest,
  onRejectFriendRequest,
  soundEnabled,
  onToggleSound,
  onOpenTour,
  onSignOut,
  pendingBookingsCount,
  pendingVerificationCount,
  openTicketsCount,
  activeStoriesCount = 0,
  activeCountryCode,
  onOpenCountrySwitcher,
  onChangeLiveStatus,
  onOpenPrivacy,
}) => {
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const bellButtonRef = useRef<HTMLButtonElement | null>(null);
  const notifPanelRef = useRef<HTMLDivElement | null>(null);
  const nowTick = useNowTick(30000);
  const activeCountry = getCountryByCode(activeCountryCode);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const userCoins = currentUser.points || 0;
  const levelInfo = getCommunityLevel(userCoins);
  const userHandle = getUserHandle(currentUser, nowTick);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        notifPanelRef.current &&
        !notifPanelRef.current.contains(target) &&
        bellButtonRef.current &&
        !bellButtonRef.current.contains(target)
      ) {
        setNotifOpen(false);
      }
    };
    if (notifOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [notifOpen]);

  useEffect(() => {
    if (!menuOpen && !notifOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setNotifOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [menuOpen, notifOpen]);

  const getNotificationMeta = (type: NotificationType) => {
    switch (type) {
      case 'friend_request':
        return {
          label: 'طلب صداقة',
          icon: UserPlus,
          iconBoxClass: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400',
          labelClass: 'text-emerald-400',
        };
      case 'friend_accept':
        return {
          label: 'قبول صداقة',
          icon: UserCheck,
          iconBoxClass: 'bg-sky-500/15 border-sky-500/30 text-sky-400',
          labelClass: 'text-sky-400',
        };
      case 'story_reaction':
        return {
          label: 'تفاعل ستوري',
          icon: Heart,
          iconBoxClass: 'bg-rose-500/15 border-rose-500/30 text-rose-400',
          labelClass: 'text-rose-400',
        };
      case 'story_reply':
        return {
          label: 'رد ستوري',
          icon: Film,
          iconBoxClass: 'bg-amber-500/15 border-amber-500/30 text-amber-400',
          labelClass: 'text-amber-400',
        };
      case 'booking_new':
      case 'booking_update':
        return {
          label: type === 'booking_new' ? 'حجز جديد' : 'تحديث موعد',
          icon: CalendarClock,
          iconBoxClass: 'bg-[#D4A853]/15 border-[#D4A853]/30 text-[#D4A853]',
          labelClass: 'text-[#D4A853]',
        };
      case 'message':
        return {
          label: 'رسالة خاصة',
          icon: MessageSquare,
          iconBoxClass: 'bg-sky-500/15 border-sky-500/30 text-sky-400',
          labelClass: 'text-sky-400',
        };
      case 'role_update':
      case 'verification_request':
        return {
          label: type === 'role_update' ? 'الرتب والصلاحيات' : 'توثيق',
          icon: ShieldCheck,
          iconBoxClass: 'bg-[#D4A853]/15 border-[#D4A853]/30 text-[#D4A853]',
          labelClass: 'text-[#D4A853]',
        };
      case 'moderation':
        return {
          label: 'إشراف',
          icon: Shield,
          iconBoxClass: 'bg-red-500/15 border-red-500/30 text-red-400',
          labelClass: 'text-red-400',
        };
      case 'credit_grant':
      case 'store_purchase':
        return {
          label: type === 'credit_grant' ? 'الكريدت' : 'المتجر',
          icon: Coins,
          iconBoxClass: 'bg-[#D4A853]/15 border-[#D4A853]/30 text-[#D4A853]',
          labelClass: 'text-[#D4A853]',
        };
      case 'ticket_new':
      case 'ticket_update':
        return {
          label: 'الدعم الفني',
          icon: HelpCircle,
          iconBoxClass: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300',
          labelClass: 'text-indigo-300',
        };
      case 'announcement':
      default:
        return {
          label: 'تنبيه',
          icon: Bell,
          iconBoxClass: 'bg-[#D4A853]/15 border-[#D4A853]/30 text-[#D4A853]',
          labelClass: 'text-[#D4A853]',
        };
    }
  };

  type NavEntry = {
    key: AppView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  };

  const primaryNavItems: NavEntry[] = [
    { key: 'community', label: 'الدردشة', icon: MessageSquare },
    { key: 'gallery', label: 'المعرض', icon: ImageIcon },
    {
      key: 'stories',
      label: 'الستوريات',
      icon: Film,
      badge: activeStoriesCount > 0 ? activeStoriesCount : undefined,
    },
    {
      key: 'store',
      label: 'المتجر والكريدت',
      icon: ShoppingBag,
    },
    {
      key: 'appointments',
      label: 'المواعيد',
      icon: CalendarClock,
      badge: pendingBookingsCount > 0 ? pendingBookingsCount : undefined,
    },
    { key: 'map', label: 'الخريطة', icon: MapPin },
    {
      key: 'join_team',
      label: 'انضم إلينا',
      icon: UserPlus,
      badge: isSuperAdmin && pendingVerificationCount > 0 ? pendingVerificationCount : undefined,
    },
    { key: 'about', label: 'الرتب والقوانين وعن التطبيق', icon: BookOpen },
  ];

  const isStaff = isStaffMember(currentUser, isSuperAdmin);
  const staffNavItems: NavEntry[] = [];

  if (isStaff) {
    staffNavItems.push({
      key: 'staff_room',
      label: 'الإشراف',
      icon: ShieldCheck,
      badge: openTicketsCount > 0 ? openTicketsCount : undefined,
    });
  }

  if (isSuperAdmin) {
    staffNavItems.push({
      key: 'admin',
      label: 'الإدارة',
      icon: Shield,
      badge: pendingVerificationCount > 0 ? pendingVerificationCount : undefined,
    });
  }

  const navItems: NavEntry[] = [...primaryNavItems, ...staffNavItems];

  const totalMenuAlertCount =
    pendingBookingsCount +
    (isStaff ? openTicketsCount : 0) +
    (isSuperAdmin ? pendingVerificationCount : 0);

  const handleSelectNav = (view: AppView) => {
    setMenuOpen(false);
    onChangeView(view);
  };

  return (
    <>
      {/* Clean Single-Row Top Bar */}
      <header className="shrink-0 sticky top-0 z-40 h-16 w-full max-w-[100vw] overflow-x-clip bg-[#0F0F14]/95 border-b border-[#24242D]">
        <div className="max-w-7xl mx-auto h-full px-2 sm:px-6 flex items-center justify-between gap-1.5 sm:gap-4 min-w-0">
          {/* Start Zone: Hamburger Menu Toggle + Scissors Brand Identity */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 shrink">
            <button
              type="button"
              onClick={() => {
                setNotifOpen(false);
                setMenuOpen((v) => !v);
              }}
              aria-expanded={menuOpen}
              aria-controls="app-navigation-drawer"
              aria-label="فتح قائمة أقسام التطبيق"
              title="القائمة الرئيسية"
              className={`relative min-w-[36px] min-h-[36px] sm:min-w-[40px] sm:min-h-[40px] px-2 sm:px-2.5 rounded-xl border inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                menuOpen
                  ? 'bg-[#D4A853] border-[#D4A853] text-[#0B0B0E]'
                  : 'bg-[#16161D] hover:bg-[#1F1F28] border-[#262630] text-[#F5F2EB]'
              }`}
            >
              {menuOpen ? <X className="w-5 h-5 shrink-0" /> : <Menu className="w-5 h-5 shrink-0" />}
              <span className="hidden md:inline text-xs font-bold">القائمة</span>
              {!menuOpen && totalMenuAlertCount > 0 && (
                <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#D4A853] text-[#0B0B0E] text-[10px] font-bold font-mono-num flex items-center justify-center">
                  {totalMenuAlertCount > 9 ? '9+' : totalMenuAlertCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setNotifOpen(false);
                if (onGoHome) {
                  onGoHome();
                } else {
                  handleSelectNav('community');
                }
              }}
              className="flex items-center gap-1.5 sm:gap-2 min-w-0 cursor-pointer"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#D4A853] text-[#0B0B0E] flex items-center justify-center shadow-sm shrink-0">
                <Scissors className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <span className="text-[13px] sm:text-lg font-extrabold text-[#F5F2EB] tracking-tight truncate">
                أوريليوس باربر
              </span>
            </button>
          </div>
                {/* Center Zone: Quick Desktop Links (xl+) */}
          <nav
            aria-label="التنقل الرئيسي"
            className="hidden xl:flex items-center gap-0.5"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleSelectNav(item.key)}
                  className={`relative px-2 2xl:px-2.5 py-2 rounded-xl text-[11px] 2xl:text-xs font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#D4A853] text-[#0B0B0E]'
                      : 'text-[#B6B0A4] hover:text-[#F5F2EB] hover:bg-[#191922]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{item.label}</span>
                  {item.badge && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono-num leading-none ${
                        isActive
                          ? 'bg-[#0B0B0E] text-[#D4A853]'
                          : 'bg-[#D4A853] text-[#0B0B0E]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* End Zone: Country, Install, Coins, Sound, Tour, Live Notifications, Profile, Sign Out */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setNotifOpen(false);
                onOpenCountrySwitcher();
              }}
              title="تغيير البلد / Change Country"
              aria-label="تغيير البلد"
              className="min-h-[34px] sm:min-h-[36px] inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl bg-[#16161D] hover:bg-[#1F1F28] border border-[#262630] hover:border-[#D4A853]/50 text-xs font-bold text-[#F5F2EB] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <CountryFlag code={activeCountryCode} size="sm" />
              <span className="hidden md:inline text-[11px]">
                {activeCountry?.nameAr || activeCountryCode}
              </span>
            </button>

            <PWAInstallButton />

            <button
              type="button"
              onClick={() => handleSelectNav('store')}
              title={`رصيد الكريدت: ${userCoins} (${levelInfo.title}) — اضغط لفتح المتجر`}
              className={`min-h-[34px] sm:min-h-[36px] inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-xl border text-[11px] sm:text-xs font-bold cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
                activeView === 'store'
                  ? 'bg-[#D4A853] border-[#D4A853] text-[#0B0B0E]'
                  : 'bg-[#16161D] hover:bg-[#1F1F28] border-[#D4A853]/35 text-[#D4A853]'
              }`}
            >
              <Coins className="w-3.5 h-3.5 shrink-0" />
              <span className="font-mono-num tabular-nums">{userCoins}</span>
              <span className="hidden md:inline text-[11px]">كريدت</span>
            </button>

            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? 'كتم صوت الإشعارات' : 'تفعيل صوت الإشعارات'}
              aria-label={soundEnabled ? 'كتم صوت الإشعارات' : 'تفعيل صوت الإشعارات'}
              className="hidden sm:inline-flex p-2 rounded-xl bg-[#16161D] hover:bg-[#1F1F28] border border-[#262630] text-[#B6B0A4] hover:text-[#D4A853] transition-colors cursor-pointer"
            >
              {soundEnabled ? (
                <Volume2 className="w-4 h-4" />
              ) : (
                <VolumeX className="w-4 h-4 text-[#6B665E]" />
              )}
            </button>

            <button
              type="button"
              onClick={onOpenTour}
              title="الجولة التعريفية"
              aria-label="الجولة التعريفية"
              className="hidden sm:inline-flex p-2 rounded-xl bg-[#16161D] hover:bg-[#1F1F28] border border-[#262630] text-[#B6B0A4] hover:text-[#D4A853] transition-colors cursor-pointer"
            >
              <HelpCircle className="w-4 h-4" />
            </button>

            {/* Notification Bell Trigger */}
            <button
              ref={bellButtonRef}
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setNotifOpen((v) => !v);
              }}
              aria-label="الإشعارات"
              aria-expanded={notifOpen}
              aria-controls="app-notifications-panel"
              className={`relative min-w-[34px] min-h-[34px] sm:min-w-[38px] sm:min-h-[38px] p-1.5 sm:p-2 rounded-xl border inline-flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                notifOpen
                  ? 'bg-[#D4A853]/15 border-[#D4A853] text-[#D4A853]'
                  : 'bg-[#16161D] hover:bg-[#1F1F28] border-[#262630] text-[#F5F2EB]'
              }`}
            >
              <Bell className="w-4 h-4 text-[#D4A853]" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -left-1 min-w-[17px] h-[17px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold font-mono-num flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Own Profile Button */}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setNotifOpen(false);
                onOpenOwnProfile();
              }}
              title="ملفي الشخصي"
              className={`min-h-[34px] sm:min-h-[38px] flex items-center gap-2 p-0.5 sm:p-1 2xl:pl-2 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                activeView === 'profile'
                  ? 'bg-[#D4A853]/15 border-[#D4A853]/60'
                  : 'bg-[#16161D] border-[#262630] hover:border-[#3A3A46]'
              }`}
            >
              <Avatar
                src={currentUser.photoURL}
                name={currentUser.displayName}
                size="xs"
                role={getPrimaryRole(currentUser)}
                roles={getUserRoles(currentUser)}
                avatarFrame={currentUser.avatarFrame}
                avatarFrameExpiresAt={currentUser.avatarFrameExpiresAt}
              />
              <span
                className={`hidden 2xl:inline text-xs font-bold max-w-[90px] truncate ${getEffectiveNameColorClass(
                  currentUser
                )}`}
              >
                {currentUser.displayName}
              </span>
              <span className="hidden 2xl:inline-flex">
                <VipSilverStar roles={getUserRoles(currentUser)} size="xs" />
              </span>
            </button>

            <button
              type="button"
              onClick={onSignOut}
              title="تسجيل الخروج"
              aria-label="تسجيل الخروج"
              className="hidden sm:inline-flex p-2 rounded-xl bg-[#16161D] hover:bg-red-500/15 border border-[#262630] text-[#9C968B] hover:text-red-400 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Responsive Notifications Panel (Detached from header overflow clipping) */}
      {notifOpen && (
        <>
          <div
            aria-hidden="true"
            onClick={() => setNotifOpen(false)}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px] sm:bg-black/20"
          />

          <div
            id="app-notifications-panel"
            ref={notifPanelRef}
            role="dialog"
            aria-label="قائمة الإشعارات"
            className="fixed top-[68px] inset-x-3 sm:inset-x-auto sm:left-6 z-50 w-auto sm:w-[410px] max-w-[calc(100vw-24px)] max-h-[min(74dvh,560px)] flex flex-col bg-[#13131A] border border-[#2D2D38] rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.65)] overflow-hidden"
          >
            {/* Panel Header */}
            <div className="shrink-0 px-4 py-3 border-b border-[#23232C] bg-[#16161E] flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-[#D4A853]/15 border border-[#D4A853]/30 text-[#D4A853] flex items-center justify-center shrink-0">
                  <Bell className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-extrabold text-[#F5F2EB] leading-tight truncate">
                    الإشعارات
                  </div>
                  <div className="text-[11px] text-[#9C968B] font-mono-num">
                    {unreadCount > 0 ? `${unreadCount} غير مقروء` : 'جميع الإشعارات مقروءة'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={onMarkAllRead}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1F1F28] hover:bg-[#272733] border border-[#2E2E3B] text-[11px] font-bold text-[#D4A853] whitespace-nowrap transition-colors cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>تحديد الكل كمقروء</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setNotifOpen(false)}
                  aria-label="إغلاق الإشعارات"
                  className="w-8 h-8 rounded-lg bg-[#1C1C24] hover:bg-[#252530] border border-[#2C2C38] text-[#9C968B] hover:text-[#F5F2EB] flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Scrollable Notification Feed */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y divide-[#20202A]">
              {notifications.length === 0 ? (
                <div className="px-6 py-10 text-center space-y-2.5">
                  <div className="w-11 h-11 rounded-2xl bg-[#1A1A22] border border-[#272733] text-[#6B665E] flex items-center justify-center mx-auto">
                    <Bell className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-[#8B857B]">
                    لا توجد إشعارات جديدة حتى الآن.
                  </p>
                </div>
              ) : (
                notifications.map((n) => {
                  const meta = getNotificationMeta(n.type);
                  const TypeIcon = meta.icon;
                  const formattedTime = formatMessageTime(n.createdAt, nowTick);
                  const pendingReq =
                    n.type === 'friend_request'
                      ? friendships.find(
                          (f) =>
                            f.id === n.targetId &&
                            f.recipientId === currentUser.uid &&
                            f.status === 'pending'
                        )
                      : undefined;

                  return (
                    <div
                      key={n.id}
                      className={`p-3.5 sm:p-4 transition-colors ${
                        n.read
                          ? 'hover:bg-[#191922]'
                          : 'bg-[#D4A853]/[0.08] hover:bg-[#D4A853]/[0.13]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setNotifOpen(false);
                          onNotificationClick(n);
                        }}
                        className="w-full text-right flex items-start gap-3 min-w-0 cursor-pointer"
                      >
                        <div
                          className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${meta.iconBoxClass}`}
                        >
                          <TypeIcon className="w-4 h-4" />
                        </div>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-start justify-between gap-2 min-w-0">
                            <p className="text-[13px] font-bold text-[#F5F2EB] leading-relaxed break-words">
                              {n.title}
                            </p>
                            {!n.read && (
                              <span
                                aria-label="غير مقروء"
                                className="w-2 h-2 rounded-full bg-[#D4A853] shrink-0 mt-2"
                              />
                            )}
                          </div>

                          {n.body && (
                            <p className="text-xs text-[#B6B0A4] leading-relaxed break-words line-clamp-3">
                              {n.body}
                            </p>
                          )}

                          <div className="flex items-center justify-between gap-2 pt-1 text-[11px]">
                            <span className={`font-semibold truncate ${meta.labelClass}`}>
                              {meta.label}
                            </span>
                            {formattedTime && (
                              <span
                                title={formatFullDateTime(n.createdAt)}
                                className="font-mono-num text-[#8B857B] whitespace-nowrap shrink-0"
                              >
                                {formattedTime}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      {pendingReq && onAcceptFriendRequest && onRejectFriendRequest && (
                        <div className="mt-3 pr-12 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAcceptFriendRequest(pendingReq);
                              if (!n.read) onNotificationClick(n);
                            }}
                            className="min-h-[34px] px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#0B0B0E] text-xs font-extrabold transition-colors cursor-pointer"
                          >
                            قبول
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRejectFriendRequest(pendingReq.id);
                              if (!n.read) onNotificationClick(n);
                            }}
                            className="min-h-[34px] px-4 py-1.5 rounded-xl bg-[#1E1E26] hover:bg-red-500/20 border border-red-500/35 text-red-300 text-xs font-bold transition-colors cursor-pointer"
                          >
                            رفض
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
                      {/* Slide-Over RTL Navigation Drawer (Replaces Fixed Bottom Bar) */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div
            aria-hidden="true"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 bg-black/65 backdrop-blur-[2px]"
          />

          <aside
            id="app-navigation-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="قائمة أقسام أوريليوس باربر"
            className="relative z-10 w-80 max-w-[85vw] h-full bg-[#111116] border-l border-[#262630] shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Drawer Header */}
            <div className="shrink-0 px-4 py-3.5 border-b border-[#22222A] bg-[#15151C] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#D4A853] text-[#0B0B0E] flex items-center justify-center shrink-0">
                  <Scissors className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold text-[#F5F2EB] truncate">
                    أوريليوس باربر
                  </div>
                  <div className="text-[11px] text-[#9C968B] truncate">
                    أقسام المنصة والمجتمع
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="إغلاق القائمة"
                className="min-w-[38px] min-h-[38px] rounded-xl bg-[#1A1A22] hover:bg-[#24242F] border border-[#2C2C35] text-[#9C968B] hover:text-[#F5F2EB] flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Member Summary Card (Tap to Open Profile) */}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onOpenOwnProfile();
              }}
              className="shrink-0 mx-3 mt-3 p-3 rounded-xl bg-[#17171F] hover:bg-[#1E1E28] border border-[#252530] flex items-center gap-3 text-right transition-colors cursor-pointer"
            >
              <Avatar
                src={currentUser.photoURL}
                name={currentUser.displayName}
                size="sm"
                role={getPrimaryRole(currentUser)}
                roles={getUserRoles(currentUser)}
                avatarFrame={currentUser.avatarFrame}
                avatarFrameExpiresAt={currentUser.avatarFrameExpiresAt}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className={`text-xs font-bold truncate ${getEffectiveNameColorClass(
                      currentUser
                    )}`}
                  >
                    {currentUser.displayName}
                  </span>
                  <VipSilverStar roles={getUserRoles(currentUser)} size="xs" />
                  <RoleBadgesList roles={getUserRoles(currentUser)} size="xs" compact />
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#9C968B]">
                  <span dir="ltr" className="font-mono-num text-[#D4A853]">
                    @{userHandle}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-num tabular-nums text-[#D4A853] font-semibold">
                    {userCoins} كريدت
                  </span>
                </div>
              </div>
              <ChevronLeft className="w-4 h-4 text-[#8B857B] shrink-0" />
            </button>

            {/* Active Country Quick Switcher Row inside Drawer */}
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onOpenCountrySwitcher();
              }}
              className="shrink-0 mx-3 mt-2 px-3.5 py-2.5 rounded-xl bg-[#16161E] hover:bg-[#1E1E28] border border-[#272733] flex items-center justify-between gap-2 text-right transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <CountryFlag code={activeCountryCode} size="sm" />
                <span className="text-xs font-bold text-[#F5F2EB] truncate">
                  مجتمع {activeCountry?.nameAr || activeCountryCode}
                </span>
              </div>
              <span className="text-[11px] font-bold text-[#D4A853] shrink-0">
                تغيير البلد
              </span>
            </button>

            {/* 3-Way Manual Live Presence Switcher */}
            {onChangeLiveStatus && (() => {
              const effectiveStatus = getEffectiveLiveStatus(
                currentUser,
                currentUser.liveStatus !== 'offline',
                nowTick
              ).status;
              return (
                <div className="shrink-0 mx-3 mt-2 p-1 rounded-xl bg-[#16161E] border border-[#272733] grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={() => onChangeLiveStatus('online')}
                    className={`min-h-[36px] px-2 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                      effectiveStatus === 'online'
                        ? 'bg-emerald-500 text-[#0B0B0E]'
                        : 'text-[#9C968B] hover:text-white'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        effectiveStatus === 'online' ? 'bg-[#0B0B0E]' : 'bg-emerald-400'
                      }`}
                    />
                    <span>أونلاين</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeLiveStatus('cutting')}
                    className={`min-h-[36px] px-2 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                      effectiveStatus === 'cutting'
                        ? 'bg-amber-500 text-[#0B0B0E]'
                        : 'text-[#9C968B] hover:text-white'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        effectiveStatus === 'cutting' ? 'bg-[#0B0B0E]' : 'bg-amber-400'
                      }`}
                    />
                    <span>مشغول</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeLiveStatus('offline')}
                    className={`min-h-[36px] px-2 rounded-lg text-[11px] font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap ${
                      effectiveStatus === 'offline'
                        ? 'bg-[#5E5A54] text-white'
                        : 'text-[#9C968B] hover:text-white'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        effectiveStatus === 'offline' ? 'bg-white' : 'bg-[#6E6A63]'
                      }`}
                    />
                    <span>أوفلاين</span>
                  </button>
                </div>
              );
            })()}

            {/* Stacked Vertical Navigation Sections */}
            <nav
              aria-label="أقسام التطبيق"
              className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1"
            >
              {primaryNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleSelectNav(item.key)}
                    className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 text-right transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-[#D4A853] text-[#0B0B0E] font-extrabold'
                        : 'text-[#E4DFD5] hover:bg-[#1A1A22] hover:text-[#F5F2EB] font-semibold'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-[#0B0B0E]' : 'text-[#D4A853]'
                        }`}
                      />
                      <span className="text-sm truncate">{item.label}</span>
                    </span>

                    {item.badge && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-mono-num font-bold leading-none shrink-0 ${
                          isActive
                            ? 'bg-[#0B0B0E] text-[#D4A853]'
                            : 'bg-[#D4A853] text-[#0B0B0E]'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}

              {staffNavItems.length > 0 && (
                <div className="pt-2.5 mt-2.5 border-t border-[#22222A] space-y-1">
                  {staffNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeView === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleSelectNav(item.key)}
                        className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center justify-between gap-3 text-right transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[#D4A853] text-[#0B0B0E] font-extrabold'
                            : 'text-[#E4DFD5] hover:bg-[#1A1A22] hover:text-[#F5F2EB] font-semibold'
                        }`}
                      >
                        <span className="flex items-center gap-3 min-w-0">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? 'text-[#0B0B0E]' : 'text-[#D4A853]'
                            }`}
                          />
                          <span className="text-sm truncate">{item.label}</span>
                        </span>

                        {item.badge && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-mono-num font-bold leading-none shrink-0 ${
                              isActive
                                ? 'bg-[#0B0B0E] text-[#D4A853]'
                                : 'bg-[#D4A853] text-[#0B0B0E]'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </nav>

            {/* Drawer Footer Utilities */}
            <div className="shrink-0 p-3 border-t border-[#22222A] bg-[#0F0F14] flex items-center gap-2">
              <button
                type="button"
                onClick={onToggleSound}
                title={soundEnabled ? 'كتم صوت الإشعارات' : 'تفعيل صوت الإشعارات'}
                aria-label={soundEnabled ? 'كتم صوت الإشعارات' : 'تفعيل صوت الإشعارات'}
                className={`sm:hidden min-w-[42px] min-h-[42px] rounded-xl border flex items-center justify-center cursor-pointer transition-colors ${
                  soundEnabled
                    ? 'bg-[#181820] hover:bg-[#22222D] border-[#282834] text-[#D4A853]'
                    : 'bg-[#181820] hover:bg-[#22222D] border-[#282834] text-[#6B665E]'
                }`}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenTour();
                }}
                className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-[#181820] hover:bg-[#22222D] border border-[#282834] text-xs font-bold text-[#D6D1C7] inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              >
                <HelpCircle className="w-4 h-4 text-[#D4A853]" />
                <span>الجولة التعريفية</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onSignOut();
                }}
                className="min-h-[42px] px-3.5 py-2 rounded-xl bg-[#181820] hover:bg-red-500/15 border border-[#282834] hover:border-red-500/40 text-xs font-bold text-red-400 inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              >
                <LogOut className="w-4 h-4" />
                <span>خروج</span>
              </button>
            </div>
            {onOpenPrivacy && (
              <div className="shrink-0 px-3 pb-3 bg-[#0F0F14] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenPrivacy('privacy');
                  }}
                  className="text-[11px] font-semibold text-[#9C968B] hover:text-[#D4A853] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-[#D4A853]" />
                  <span>سياسة الخصوصية والأمان</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenPrivacy('delete');
                  }}
                  className="text-[11px] font-semibold text-red-400/90 hover:text-red-300 cursor-pointer"
                >
                  حذف الحساب
                </button>
              </div>
            )}
          </aside>
        </div>
      )}
    </>
  );
};

interface BannedScreenProps {
  reason?: string;
  onSignOut: () => void;
}

export const BannedScreen: React.FC<BannedScreenProps> = ({ reason, onSignOut }) => {
  return (
    <div
      dir="rtl"
      className="min-h-[100dvh] w-full max-w-[100vw] overflow-x-hidden bg-[#0B0B0E] text-[#F5F2EB] flex items-center justify-center p-6"
    >
      <div className="max-w-md w-full bg-[#141419] border border-red-500/40 rounded-2xl p-7 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-red-500/15 text-red-400 flex items-center justify-center mx-auto">
          <Ban className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-bold text-[#F5F2EB]">تم حظر الحساب نهائياً</h1>
        <p className="text-sm text-[#B6B0A4] leading-relaxed">
          تم تقييد وصول هذا الحساب إلى المنصة من قبل إدارة التطبيق.
        </p>
        {reason && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-200">
            السبب: {reason}
          </div>
        )}
        <button
          type="button"
          onClick={onSignOut}
          className="w-full py-2.5 px-4 rounded-xl bg-[#1E1E26] hover:bg-[#282832] text-sm font-semibold text-[#F5F2EB] cursor-pointer"
        >
          تسجيل الخروج
        </button>
      </div>
    </div>
  );
};
                        
