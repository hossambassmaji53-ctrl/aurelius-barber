import React, { useMemo, useState } from 'react';
import {
  Award,
  CalendarClock,
  Coins,
  Crown,
  Flame,
  Heart,
  Scissors,
  Star,
  Trophy,
  User as UserIcon,
} from 'lucide-react';
import {
  BarberStory,
  GalleryItem,
  LikeRecord,
  Review,
  UserProfile,
} from '../types';
import {
  getCommunityLevel,
  getEffectiveLiveStatus,
  tsToMillis,
} from '../utils/gamification';
import {
  Avatar,
  RoleBadgesList,
  VipSilverStar,
  getRoleNameColor,
  getUserRoles,
  isBarberMember,
} from './Avatar';

interface LeaderboardViewProps {
  currentUser: UserProfile;
  users: UserProfile[];
  gallery: GalleryItem[];
  likes: LikeRecord[];
  reviews: Review[];
  stories: BarberStory[];
  onOpenProfile: (uid: string) => void;
  onBookBarber: (barber: UserProfile) => void;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  currentUser,
  users,
  gallery,
  likes,
  reviews,
  stories,
  onOpenProfile,
  onBookBarber,
}) => {
  const [tab, setTab] = useState<'barbers' | 'coins'>('barbers');
  const weekCutoff = Date.now() - SEVEN_DAYS_MS;

  const barberRankings = useMemo(() => {
    const barbers = users.filter((u) => !u.isBanned && isBarberMember(u));

    return barbers
      .map((barber) => {
        const barberGalleryIds = new Set(
          gallery.filter((g) => g.barberId === barber.uid).map((g) => g.id)
        );

        const weeklyLikes = likes.filter((l) => {
          const isTarget =
            (l.targetType === 'profile' && l.targetId === barber.uid) ||
            (l.targetType === 'gallery' && barberGalleryIds.has(l.targetId));
          return isTarget && tsToMillis(l.createdAt) >= weekCutoff;
        }).length;

        const allBarberReviews = reviews.filter((r) => r.barberId === barber.uid);
        const weeklyReviews = allBarberReviews.filter(
          (r) => tsToMillis(r.createdAt) >= weekCutoff
        ).length;
        const avgRating =
          allBarberReviews.length > 0
            ? allBarberReviews.reduce((s, r) => s + r.rating, 0) / allBarberReviews.length
            : 0;

        const weeklyStories = stories.filter(
          (s) => s.barberId === barber.uid && tsToMillis(s.createdAt) >= weekCutoff
        ).length;

        const completedCount = barber.completedBookingsCount || 0;
        const coins = barber.points || 0;

        const weeklyScore =
          weeklyLikes * 4 +
          weeklyReviews * 18 +
          weeklyStories * 6 +
          completedCount * 15 +
          Math.round(avgRating * 5) +
          Math.round(coins / 15);

        return {
          barber,
          weeklyLikes,
          weeklyReviews,
          avgRating,
          reviewCount: allBarberReviews.length,
          weeklyStories,
          completedCount,
          coins,
          weeklyScore,
        };
      })
      .sort((a, b) => {
        if (b.weeklyScore !== a.weeklyScore) return b.weeklyScore - a.weeklyScore;
        if (b.coins !== a.coins) return b.coins - a.coins;
        return b.avgRating - a.avgRating;
      });
  }, [users, gallery, likes, reviews, stories, weekCutoff]);

  const communityCoinsRankings = useMemo(() => {
    return users
      .filter((u) => !u.isBanned)
      .map((member) => ({
        member,
        coins: member.points || 0,
        levelInfo: getCommunityLevel(member.points || 0),
      }))
      .sort((a, b) => {
        if (b.coins !== a.coins) return b.coins - a.coins;
        return a.member.displayName.localeCompare(b.member.displayName, 'ar');
      });
  }, [users]);

  const topThreeBarbers = barberRankings.slice(0, 3);

  return (
    <div className="space-y-7">
      {/* Header + Segmented Tabs */}
      <section className="bg-[#141419] border border-[#27272F] rounded-3xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-[#D4A853]">
            <Flame className="w-4 h-4" />
            <span>لوحة الشرف الأسبوعية · Aurelius Leaderboard</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F5F2EB] [text-wrap:balance]">
            أبرز الحلاقين والصالونات تفاعلاً وطلباً خلال الأسبوع
          </h1>
          <p className="text-xs sm:text-sm text-[#A6A196] max-w-2xl leading-relaxed">
            تصنيف مباشر لأكثر الحلاقين والصالونات إقبالاً وتقييماً وتفاعلاً، إضافةً إلى قائمة متصدري كريدت أوريليوس في المجتمع.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#1A1A22] border border-[#2A2A35] rounded-xl shrink-0 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setTab('barbers')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              tab === 'barbers'
                ? 'bg-[#D4A853] text-[#0B0B0E]'
                : 'text-[#A6A196] hover:text-[#F5F2EB]'
            }`}
          >
            نخبة الحلاقين والصالونات
          </button>
          <button
            type="button"
            onClick={() => setTab('coins')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              tab === 'coins'
                ? 'bg-[#D4A853] text-[#0B0B0E]'
                : 'text-[#A6A196] hover:text-[#F5F2EB]'
            }`}
          >
            متصدرو الكريدت والمستويات
          </button>
        </div>
      </section>

      {tab === 'barbers' ? (
        barberRankings.length === 0 ? (
          <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-12 text-center space-y-2">
            <Award className="w-8 h-8 text-[#D4A853] mx-auto opacity-60" />
            <div className="text-sm font-bold text-[#F5F2EB]">لا يوجد حلاقون موثقون بعد</div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Top 3 Podium Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {topThreeBarbers.map((entry, idx) => {
                const roles = getUserRoles(entry.barber);
                const primaryRole = roles[0];
                const liveMeta = getEffectiveLiveStatus(
                  entry.barber,
                  entry.barber.uid === currentUser.uid
                );
                const rankBorder =
                  idx === 0
                    ? 'border-[#D4A853] bg-gradient-to-b from-[#231D11] to-[#141419]'
                    : idx === 1
                      ? 'border-slate-300/60 bg-gradient-to-b from-[#1D2028] to-[#141419]'
                      : 'border-amber-700/60 bg-gradient-to-b from-[#1E1712] to-[#141419]';
                const rankColor =
                  idx === 0
                    ? 'text-[#F5D67B]'
                    : idx === 1
                      ? 'text-slate-200'
                      : 'text-amber-500';

                return (
                  <div
                    key={entry.barber.uid}
                    className={`border rounded-2xl p-5 flex flex-col justify-between gap-4 ${rankBorder}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`inline-flex items-center gap-1.5 text-sm font-extrabold font-mono-num ${rankColor}`}>
                        {idx === 0 ? <Crown className="w-4 h-4" /> : <Trophy className="w-4 h-4" />}
                        <span>المركز #{idx + 1}</span>
                      </span>
                      <span className="text-xs font-mono-num font-bold text-[#D4A853]">
                        {entry.weeklyScore} نقطة تميّز
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <Avatar
                        src={entry.barber.photoURL}
                        name={entry.barber.displayName}
                        size="lg"
                        role={primaryRole}
                        roles={roles}
                      />
                      <div className="min-w-0 space-y-1">
                        <button
                          type="button"
                          onClick={() => onOpenProfile(entry.barber.uid)}
                          className={`text-base font-extrabold truncate hover:underline block text-right cursor-pointer ${getRoleNameColor(
                            primaryRole
                          )}`}
                        >
                          {entry.barber.displayName}
                        </button>
                        {entry.barber.salonName && (
                          <div className="text-xs text-[#D6D1C7] font-semibold truncate">
                            {entry.barber.salonName}
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <VipSilverStar roles={roles} size="xs" />
                          <RoleBadgesList roles={roles} size="xs" compact />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#24242F] text-center">
                      <div>
                        <div className="text-xs font-mono-num font-bold text-[#F5F2EB]">
                          {entry.reviewCount > 0 ? entry.avgRating.toFixed(1) : 'جديد'}
                        </div>
                        <div className="text-[10px] text-[#9C968B]">التقييم</div>
                      </div>
                      <div>
                        <div className="text-xs font-mono-num font-bold text-emerald-400">
                          {entry.weeklyLikes + entry.weeklyStories}
                        </div>
                        <div className="text-[10px] text-[#9C968B]">تفاعل الأسبوع</div>
                      </div>
                      <div>
                        <div className="text-xs font-mono-num font-bold text-[#D4A853]">
                          {entry.completedCount}
                        </div>
                        <div className="text-[10px] text-[#9C968B]">موعد مكتمل</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[11px] font-semibold ${liveMeta.textClass}`}>
                        {liveMeta.label}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenProfile(entry.barber.uid)}
                          className="px-3 py-1.5 rounded-lg bg-[#1D1D26] hover:bg-[#272732] text-[11px] font-semibold text-[#F5F2EB] cursor-pointer"
                        >
                          الملف
                        </button>
                        {entry.barber.uid !== currentUser.uid && (
                          <button
                            type="button"
                            onClick={() => onBookBarber(entry.barber)}
                            className="px-3 py-1.5 rounded-lg bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                          >
                            <CalendarClock className="w-3 h-3" />
                            <span>حجز</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
                        {/* Full Leaderboard List */}
            <div className="bg-[#141419] border border-[#27272F] rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#22222A] flex items-center justify-between">
                <span className="text-sm font-bold text-[#F5F2EB]">الترتيب العام للحلاقين والصالونات</span>
                <span className="text-xs font-mono-num text-[#9C968B]">
                  {barberRankings.length} حلاق موثق
                </span>
              </div>

              <div className="divide-y divide-[#22222A]">
                {barberRankings.map((entry, idx) => {
                  const roles = getUserRoles(entry.barber);
                  const primaryRole = roles[0];
                  const liveMeta = getEffectiveLiveStatus(
                    entry.barber,
                    entry.barber.uid === currentUser.uid
                  );

                  return (
                    <div
                      key={entry.barber.uid}
                      className="px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 hover:bg-[#191921] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 text-center font-mono-num text-sm font-extrabold text-[#D4A853]">
                          #{idx + 1}
                        </span>
                        <Avatar
                          src={entry.barber.photoURL}
                          name={entry.barber.displayName}
                          size="sm"
                          role={primaryRole}
                          roles={roles}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => onOpenProfile(entry.barber.uid)}
                              className={`text-sm font-bold hover:underline cursor-pointer ${getRoleNameColor(
                                primaryRole
                              )}`}
                            >
                              {entry.barber.displayName}
                            </button>
                            <VipSilverStar roles={roles} size="xs" />
                            <RoleBadgesList roles={roles} size="xs" compact />
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-[#9C968B]">
                            {entry.barber.salonName && (
                              <>
                                <span>{entry.barber.salonName}</span>
                                <span>·</span>
                              </>
                            )}
                            <span className={liveMeta.textClass}>{liveMeta.label}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs font-mono-num">
                        <span className="inline-flex items-center gap-1 text-[#D4A853]">
                          <Star className="w-3.5 h-3.5 fill-[#D4A853]" />
                          {entry.reviewCount > 0 ? entry.avgRating.toFixed(1) : 'جديد'}
                        </span>
                        <span className="inline-flex items-center gap-1 text-rose-400">
                          <Heart className="w-3.5 h-3.5" />
                          {entry.weeklyLikes}
                        </span>
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-bold">
                          <Scissors className="w-3.5 h-3.5" />
                          {entry.weeklyScore}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-5">
          {/* Earn Coins Summary */}
          <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <div className="text-xs font-bold text-[#D4A853]">+2 كريدت</div>
              <div className="text-xs text-[#B6B0A4] mt-0.5">لكل رسالة في الدردشة</div>
            </div>
            <div>
              <div className="text-xs font-bold text-[#D4A853]">+25 كريدت</div>
              <div className="text-xs text-[#B6B0A4] mt-0.5">عند حجز موعد جديد</div>
            </div>
            <div>
              <div className="text-xs font-bold text-[#D4A853]">+40 كريدت</div>
              <div className="text-xs text-[#B6B0A4] mt-0.5">للحلاق عند إتمام الحجز</div>
            </div>
            <div>
              <div className="text-xs font-bold text-[#D4A853]">+3 إلى +25</div>
              <div className="text-xs text-[#B6B0A4] mt-0.5">الدخول اليومي / الإعجاب / التقييم</div>
            </div>
          </div>

          {/* Community Credits Leaderboard */}
          <div className="bg-[#141419] border border-[#27272F] rounded-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#22222A] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-[#D4A853]" />
                <span className="text-sm font-bold text-[#F5F2EB]">ترتيب الأعضاء حسب كريدت أوريليوس</span>
              </div>
              <span className="text-xs font-mono-num text-[#9C968B]">
                رصيدك: {currentUser.points || 0} كريدت
              </span>
            </div>

            <div className="divide-y divide-[#22222A]">
              {communityCoinsRankings.map(({ member, coins, levelInfo }, idx) => {
                const roles = getUserRoles(member);
                const primaryRole = roles[0];
                const isMe = member.uid === currentUser.uid;
                return (
                  <div
                    key={member.uid}
                    className={`px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 ${
                      isMe ? 'bg-[#D4A853]/[0.06]' : 'hover:bg-[#191921]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-7 text-center font-mono-num text-sm font-extrabold text-[#D4A853]">
                        #{idx + 1}
                      </span>
                      <Avatar
                        src={member.photoURL}
                        name={member.displayName}
                        size="sm"
                        role={primaryRole}
                        roles={roles}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => onOpenProfile(member.uid)}
                            className={`text-sm font-bold hover:underline cursor-pointer ${getRoleNameColor(
                              primaryRole
                            )}`}
                          >
                            {member.displayName}
                          </button>
                          <VipSilverStar roles={roles} size="xs" />
                          <RoleBadgesList roles={roles} size="xs" compact />
                        </div>
                        <div className={`text-[11px] font-semibold ${levelInfo.textColorClass}`}>
                          المستوى {levelInfo.level} · {levelInfo.title}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 text-sm font-mono-num font-extrabold text-[#D4A853]">
                        <Coins className="w-4 h-4" />
                        {coins}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenProfile(member.uid)}
                        className="p-2 rounded-lg bg-[#1D1D26] hover:bg-[#272732] text-[#A6A196] hover:text-white cursor-pointer"
                        title="عرض الملف"
                      >
                        <UserIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
            
