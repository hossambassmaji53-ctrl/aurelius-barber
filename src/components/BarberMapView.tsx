import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  useMap,
  MapMouseEvent,
} from '@vis.gl/react-google-maps';
import {
  MapPin,
  Navigation,
  Star,
  CalendarClock,
  User as UserIcon,
  Scissors,
  Crosshair,
  AlertCircle,
  MessageCircle,
  LocateFixed,
  X,
  Loader2,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { GeoLocation, Review, UserProfile } from '../types';
const getEffectiveLiveStatus = (..._args: unknown[]) => 'online';
import { getCountryByCode, normalizeCountryCode } from '../utils/countries';
import { getRoleHierarchyOrder } from '../utils/roles';
import { CountryFlag } from './CountryPickerModal';
import {
  Avatar,
  RoleBadgesList,
  VipSilverStar,
  getPrimaryRole,
  getRoleNameColor,
  getUserRoles,
  hasRole,
  isBarberMember,
} from './Avatar';

const DEFAULT_CENTER: GeoLocation = { lat: 33.8938, lng: 35.5018 };

function getMapsApiKey(): string {
  return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';
}

function getBarberCountryCode(user: UserProfile): string | null {
  const raw =
    user.countryCode ||
    (user as UserProfile & { country_code?: string }).country_code;
  return normalizeCountryCode(raw);
}

/**
 * Determines whether a verified barber/salon is currently open and accepting clients.
 * Supports both `availability` ('available' | 'busy'), `liveStatus`, and optional `is_available`.
 */
export function isBarberCurrentlyAvailable(user: UserProfile): boolean {
  const legacyFlag = (user as UserProfile & { is_available?: boolean }).is_available;
  if (legacyFlag === false) return false;
  if (user.availability === 'busy') return false;
  if (user.liveStatus === 'offline' || user.liveStatus === 'cutting') return false;
  if (legacyFlag === true) return true;
  return user.availability === 'available';
}

function calculateDistanceKm(a: GeoLocation, b: GeoLocation): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function formatDistanceAr(km: number): string {
  if (km < 1) {
    return `${Math.max(50, Math.round(km * 1000))} م`;
  }
  return `${km.toFixed(km < 10 ? 1 : 0)} كم`;
}

interface CameraTarget {
  center: GeoLocation;
  zoom: number;
  nonce: number;
}

const MapCameraController: React.FC<{ target: CameraTarget | null }> = ({ target }) => {
  const map = useMap();

  useEffect(() => {
    if (!map || !target) return;
    map.panTo(target.center);
    map.setZoom(target.zoom);
  }, [map, target]);

  return null;
};

interface BarberMarkerProps {
  barber: UserProfile;
  isSelected: boolean;
  onSelect: (barber: UserProfile) => void;
}

const BarberMarkerItem: React.FC<BarberMarkerProps> = ({
  barber,
  isSelected,
  onSelect,
}) => {
  if (!barber.location) return null;

  const isAvailable = isBarberCurrentlyAvailable(barber);
  const isVip = hasRole(barber, 'vip_barber');

  return (
    <AdvancedMarker
      position={barber.location}
      title={barber.salonName || barber.displayName}
      zIndex={isSelected ? 50 : isVip ? 20 : 10}
      onClick={() => onSelect(barber)}
    >
      <Pin
        background={
          isSelected
            ? '#D4A853'
            : isVip
              ? isAvailable
                ? '#E2E8F0'
                : '#94A3B8'
              : isAvailable
                ? '#10B981'
                : '#D97706'
        }
        borderColor={isSelected ? '#FFFFFF' : '#0B0B0E'}
        glyphColor="#0B0B0E"
        scale={isSelected ? 1.35 : isVip ? 1.2 : 1.1}
      />
    </AdvancedMarker>
  );
};

interface BarberMapViewProps {
  users: UserProfile[];
  reviews: Review[];
  activeCountryCode: string;
  currentUser?: UserProfile | null;
  onOpenProfile: (uid: string) => void;
  onBookBarber: (barber: UserProfile) => void;
  onStartPrivateChat?: (barber: UserProfile) => void;
}

export const BarberMapView: React.FC<BarberMapViewProps> = ({
  users,
  reviews,
  activeCountryCode,
  currentUser,
  onOpenProfile,
  onBookBarber,
  onStartPrivateChat,
}) => {
  const apiKey = getMapsApiKey();
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available'>('all');
  const [selectedBarberId, setSelectedBarberId] = useState<string | null>(null);

  // Real-time Geolocation (GPS) state
  const [userLocation, setUserLocation] = useState<GeoLocation | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'locating' | 'granted' | 'denied' | 'unsupported'>('idle');
  const [geoNotice, setGeoNotice] = useState<string | null>(null);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget | null>(null);

  const selectedBarberIdRef = useRef<string | null>(null);
  selectedBarberIdRef.current = selectedBarberId;
  const prevCountryRef = useRef<string>(activeCountryCode);

  const countryMeta = useMemo(
    () => getCountryByCode(activeCountryCode),
    [activeCountryCode]
  );

  // 1. Strict Country Filter: Only barbers matching activeCountryCode
  const countryBarbersAll = useMemo(() => {
    return users.filter(
      (u) =>
        !u.isBanned &&
        isBarberMember(u) &&
        getBarberCountryCode(u) === activeCountryCode
    );
  }, [users, activeCountryCode]);

  const availableBarbersCount = useMemo(
    () => countryBarbersAll.filter((u) => isBarberCurrentlyAvailable(u)).length,
    [countryBarbersAll]
  );

  // 2. Availability Filter ('all' vs 'available') + Nearest Distance / VIP Sorting
  const verifiedBarbers = useMemo(() => {
    return countryBarbersAll
      .filter((u) => availabilityFilter === 'all' || isBarberCurrentlyAvailable(u))
      .sort((a, b) => {
        if (userLocation) {
          const distA = a.location
            ? calculateDistanceKm(userLocation, a.location)
            : Number.POSITIVE_INFINITY;
          const distB = b.location
            ? calculateDistanceKm(userLocation, b.location)
            : Number.POSITIVE_INFINITY;
          if (Math.abs(distA - distB) > 0.25) {
            return distA - distB;
          }
        }
        const aAvail = isBarberCurrentlyAvailable(a);
        const bAvail = isBarberCurrentlyAvailable(b);
        if (aAvail !== bAvail) return aAvail ? -1 : 1;
        const aVip = hasRole(a, 'vip_barber');
        const bVip = hasRole(b, 'vip_barber');
        if (aVip !== bVip) return aVip ? -1 : 1;
        const rankDiff =
          getRoleHierarchyOrder(getPrimaryRole(a)) - getRoleHierarchyOrder(getPrimaryRole(b));
        if (rankDiff !== 0) return rankDiff;
        return a.displayName.localeCompare(b.displayName, 'ar');
      });
  }, [countryBarbersAll, availabilityFilter, userLocation]);

  const barbersWithLocation = useMemo(
    () => verifiedBarbers.filter((b) => b.location && typeof b.location.lat === 'number'),
    [verifiedBarbers]
  );

  const requestUserGeolocation = useCallback((forcePan: boolean) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoStatus('unsupported');
      setGeoNotice('المتصفح الحالي لا يدعم خدمة تحديد الموقع الجغرافي (GPS).');
      return;
    }

    setGeoStatus('locating');
    setGeoNotice(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: GeoLocation = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        };
        setUserLocation(coords);
        setGeoStatus('granted');
        setGeoNotice(null);

        if (forcePan || !selectedBarberIdRef.current) {
          setCameraTarget({
            center: coords,
            zoom: 13,
            nonce: Date.now(),
          });
        }
      },
      (err) => {
        setGeoStatus('denied');
        if (err.code === err.PERMISSION_DENIED) {
          setGeoNotice('تم رفض صلاحية الوصول للموقع؛ يمكنك تفعيلها من إعدادات المتصفح لتحديد موقعك تلقائياً.');
        } else {
          setGeoNotice('تعذر التقاط إشارة GPS حالياً، تم عرض نطاق البلد المختار.');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 8500,
        maximumAge: 60000,
      }
    );
  }, []);

  // Automatically locate user on initial map open
  useEffect(() => {
    requestUserGeolocation(true);
  }, [requestUserGeolocation]);

  // Clear selection if selected barber is filtered out (by country or availability filter)
  useEffect(() => {
    if (selectedBarberId && !verifiedBarbers.some((b) => b.uid === selectedBarberId)) {
      setSelectedBarberId(null);
    }
  }, [verifiedBarbers, selectedBarberId]);

  // Recenter when user explicitly switches countries
  useEffect(() => {
    if (prevCountryRef.current === activeCountryCode) return;
    prevCountryRef.current = activeCountryCode;
    setSelectedBarberId(null);

    const firstInCountry = users.find(
      (u) =>
        !u.isBanned &&
        isBarberMember(u) &&
        getBarberCountryCode(u) === activeCountryCode &&
        u.location &&
        typeof u.location.lat === 'number'
    );

    const fallbackCenter =
      firstInCountry?.location || countryMeta?.center || DEFAULT_CENTER;
    const fallbackZoom = firstInCountry ? 11 : countryMeta?.zoom || 7;
    setCameraTarget({
      center: fallbackCenter,
      zoom: fallbackZoom,
      nonce: Date.now(),
    });
  }, [activeCountryCode, countryMeta, users]);

  const getBarberStats = useCallback(
    (barberId: string) => {
      const list = reviews.filter((r) => r.barberId === barberId);
      if (list.length === 0) return { avg: 0, count: 0 };
      const sum = list.reduce((acc, r) => acc + r.rating, 0);
      return { avg: sum / list.length, count: list.length };
    },
    [reviews]
  );

  const handleSelectBarber = useCallback((barber: UserProfile) => {
    setSelectedBarberId(barber.uid);
    if (barber.location) {
      setCameraTarget({
        center: barber.location,
        zoom: 15,
        nonce: Date.now(),
      });
    }
  }, []);

  const selectedBarber = useMemo(
    () => verifiedBarbers.find((b) => b.uid === selectedBarberId) || null,
    [verifiedBarbers, selectedBarberId]
  );

  const initialCenter =
    userLocation ||
    barbersWithLocation[0]?.location ||
    countryMeta?.center ||
    DEFAULT_CENTER;
  const initialZoom = userLocation
    ? 13
    : barbersWithLocation.length > 0
      ? 11
      : countryMeta?.zoom || 7;
    return (
    <div className="space-y-5">
      {/* Header & Top Filter Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-bold text-[#F5F2EB]">خريطة الحلاقين الموثقين</h1>
            <CountryFlag
              code={activeCountryCode}
              showName
              size="xs"
              className="px-2.5 py-1 rounded-xl bg-[#181822] border border-[#D4A853]/30 text-xs font-bold text-[#F5F2EB]"
            />
          </div>
          <p className="text-xs sm:text-sm text-[#9C968B]">
            تُظهر الخريطة الحلاقين الموثقين داخل {countryMeta?.nameAr || 'البلد المختار'} فقط مع التمركز التلقائي على موقعك الحالي.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <div className="flex items-center gap-1 p-1 bg-[#14141A] border border-[#262630] rounded-xl">
            <button
              type="button"
              onClick={() => setAvailabilityFilter('all')}
              className={`min-h-[38px] px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                availabilityFilter === 'all'
                  ? 'bg-[#D4A853] text-[#0B0B0E]'
                  : 'text-[#A6A196] hover:text-[#F5F2EB]'
              }`}
            >
              جميع الحلاقين ({countryBarbersAll.length})
            </button>
            <button
              type="button"
              onClick={() => setAvailabilityFilter('available')}
              className={`min-h-[38px] px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap inline-flex items-center gap-1.5 cursor-pointer ${
                availabilityFilter === 'available'
                  ? 'bg-emerald-500 text-[#0B0B0E] font-bold'
                  : 'text-[#A6A196] hover:text-[#F5F2EB]'
              }`}
            >
              <span>متوفر حالياً</span>
              <span className="font-mono-num">({availableBarbersCount})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => requestUserGeolocation(true)}
            className="min-h-[40px] px-3.5 py-2 rounded-xl bg-[#14141A] hover:bg-[#1E1E28] border border-[#2B2B36] hover:border-[#D4A853]/60 text-xs font-semibold text-[#F5F2EB] inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            {geoStatus === 'locating' ? (
              <Loader2 className="w-3.5 h-3.5 text-[#D4A853] animate-spin" />
            ) : (
              <LocateFixed className="w-3.5 h-3.5 text-sky-400" />
            )}
            <span>موقعي الحالي (GPS)</span>
          </button>
        </div>
      </div>

      {/* Geolocation Feedback Notice */}
      {geoNotice && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{geoNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => requestUserGeolocation(true)}
            className="font-bold text-[#D4A853] hover:underline cursor-pointer"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Map Column + Bottom Marker Quick Preview Card */}
        <div className="lg:col-span-8 space-y-4">
          <div className="relative bg-[#141419] border border-[#27272F] rounded-2xl overflow-hidden">
            {apiKey ? (
              <div className="w-full h-[420px] sm:h-[490px] lg:h-[530px] relative">
                <APIProvider
                  apiKey={apiKey}
                  libraries={['marker']}
                  language="ar"
                  region={activeCountryCode}
                >
                  <GoogleMap
                    mapId="DEMO_MAP_ID"
                    defaultCenter={initialCenter}
                    defaultZoom={initialZoom}
                    gestureHandling="greedy"
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                    style={{ width: '100%', height: '100%' }}
                    onClick={() => setSelectedBarberId(null)}
                  >
                    <MapCameraController target={cameraTarget} />

                    {/* Current User GPS Position Marker */}
                    {userLocation && (
                      <AdvancedMarker
                        position={userLocation}
                        title="موقعك الحالي (GPS)"
                        zIndex={60}
                      >
                        <div className="relative flex items-center justify-center">
                          <span className="w-7 h-7 rounded-full bg-sky-400/25 border border-sky-400/60 flex items-center justify-center">
                            <span className="w-3.5 h-3.5 rounded-full bg-sky-400 border-2 border-white shadow-md" />
                          </span>
                        </div>
                      </AdvancedMarker>
                    )}

                    {/* Country-Scoped & Availability-Filtered Barber Markers */}
                    {barbersWithLocation.map((barber) => (
                      <BarberMarkerItem
                        key={barber.uid}
                        barber={barber}
                        isSelected={selectedBarberId === barber.uid}
                        onSelect={handleSelectBarber}
                      />
                    ))}
                  </GoogleMap>
                </APIProvider>

                {/* Compact Map Legend Overlay */}
                <div className="absolute top-3 right-3 z-10 flex flex-wrap items-center gap-3 px-3 py-1.5 rounded-xl bg-[#0B0B0E]/85 backdrop-blur-md border border-white/10 text-[11px] text-[#E6E1D6]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span>متوفر</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />
                    <span>مشغول / مغلق</span>
                  </span>
                  {userLocation && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-400 border border-white" />
                      <span>موقعك</span>
                    </span>
                  )}
                </div>

                {/* Quick Re-Center Floating GPS Button on Map */}
                <button
                  type="button"
                  onClick={() => requestUserGeolocation(true)}
                  title="التركيز على موقعي الحالي"
                  className="absolute bottom-4 left-4 z-10 w-11 h-11 rounded-xl bg-[#0B0B0E]/90 hover:bg-[#181820] border border-[#D4A853]/45 text-[#D4A853] shadow-lg flex items-center justify-center cursor-pointer transition-colors"
                >
                  {geoStatus === 'locating' ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Crosshair className="w-5 h-5" />
                  )}
                </button>
              </div>
            ) : (
              <div className="p-8 text-center space-y-3 h-[420px] flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-[#D4A853]">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-[#F5F2EB]">
                  مفتاح خرائط Google غير مفعّل في البيئة الحالية
                </h3>
                <p className="text-xs text-[#9C968B] max-w-md leading-relaxed">
                  بإمكانك تصفح قائمة الحلاقين وإحداثياتهم الجغرافية، والنقر على أي صالون لعرض بطاقة المعاينة والحجز المباشر.
                </p>
              </div>
            )}
          </div>

          {/* Marker Quick Preview Card (بطاقة المعاينة السريعة أسفل الخريطة) */}
          {selectedBarber ? (
            (() => {
              const stats = getBarberStats(selectedBarber.uid);
              const isOpenNow = isBarberCurrentlyAvailable(selectedBarber);
              const liveMeta = getEffectiveLiveStatus(selectedBarber);
              const barberRoles = getUserRoles(selectedBarber);
              const barberPrimary = barberRoles[0];
              const salonImage = selectedBarber.coverURL || selectedBarber.photoURL;
              const distKm =
                userLocation && selectedBarber.location
                  ? calculateDistanceKm(userLocation, selectedBarber.location)
                  : null;
              const isSelf = currentUser?.uid === selectedBarber.uid;

              return (
                <section
                  aria-label="معاينة الصالون المختار"
                  className="bg-[#141419] border border-[#D4A853]/50 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4"
                >
                  <div className="flex items-start gap-4">
                    {/* Salon / Barber Photo */}
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-[#1D1D26] border border-[#2C2C38] shrink-0 relative flex items-center justify-center">
                      {salonImage ? (
                        <img
                          src={salonImage}
                          alt={selectedBarber.salonName || selectedBarber.displayName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Scissors className="w-7 h-7 text-[#D4A853]" />
                      )}
                    </div>

                    {/* Core Info */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-base sm:text-lg font-extrabold text-[#F5F2EB] truncate">
                              {selectedBarber.salonName || selectedBarber.displayName}
                            </h2>
                            <CountryFlag
                              code={selectedBarber.countryCode || activeCountryCode}
                              size="xs"
                            />
                            <VipSilverStar roles={barberRoles} size="xs" />
                          </div>
                          <div className="flex items-center gap-2 flex-wrap text-xs text-[#A6A196] mt-0.5">
                            <span className={`font-semibold ${getRoleNameColor(barberPrimary)}`}>
                              الحلاق: {selectedBarber.displayName}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span
                              className={`inline-flex items-center gap-1 font-bold ${
                                isOpenNow ? 'text-emerald-400' : 'text-amber-400'
                              }`}
                            >
                              {isOpenNow ? (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              ) : (
                                <Clock className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {isOpenNow
                                  ? 'متوفر الآن ويستقبل زبائن'
                                  : liveMeta.status === 'offline'
                                    ? 'مغلق / غير متصل حالياً'
                                    : 'مشغول حالياً'}
                              </span>
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedBarberId(null)}
                          title="إغلاق المعاينة"
                          className="p-1.5 rounded-lg text-[#8B857B] hover:text-[#F5F2EB] hover:bg-[#1E1E26] cursor-pointer shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Rating, Distance & Address */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#B8B2A6]">
                        <span className="inline-flex items-center gap-1 font-mono-num font-bold text-[#D4A853]">
                          <Star className="w-3.5 h-3.5 fill-[#D4A853]" />
                          {stats.count > 0
                            ? `${stats.avg.toFixed(1)} (${stats.count} تقييم)`
                            : 'حلاق جديد'}
                        </span>

                        {distKm !== null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 text-sky-300 font-semibold font-mono-num">
                              <LocateFixed className="w-3.5 h-3.5" />
                              يبعد {formatDistanceAr(distKm)} عنك
                            </span>
                          </>
                        )}

                        {selectedBarber.addressLabel && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-1 truncate max-w-xs">
                              <MapPin className="w-3.5 h-3.5 text-[#D4A853] shrink-0" />
                              <span className="truncate">{selectedBarber.addressLabel}</span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Direct Action Buttons: Book, Contact/Message, Profile, Directions */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#23232D]">
                    {!isSelf && (
                      <button
                        type="button"
                        onClick={() => onBookBarber(selectedBarber)}
                        className="flex-1 min-w-[130px] min-h-[42px] py-2 px-4 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <CalendarClock className="w-4 h-4" />
                        <span>حجز موعد مباشر</span>
                      </button>
                    )}

                    {!isSelf && onStartPrivateChat && (
                      <button
                        type="button"
                        onClick={() => onStartPrivateChat(selectedBarber)}
                        className="flex-1 min-w-[130px] min-h-[42px] py-2 px-4 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4" />
                        <span>اتصال ومراسلة</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onOpenProfile(selectedBarber.uid)}
                      className="min-h-[42px] py-2 px-4 rounded-xl bg-[#1C1C24] hover:bg-[#252530] border border-[#2D2D38] text-xs font-semibold text-[#F5F2EB] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <UserIcon className="w-3.5 h-3.5" />
                      <span>الملف الشخصي</span>
                    </button>

                    {selectedBarber.location && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${selectedBarber.location.lat},${selectedBarber.location.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[42px] py-2 px-3.5 rounded-xl bg-[#1C1C24] hover:bg-[#252530] border border-[#2D2D38] text-xs font-semibold text-[#D4A853] inline-flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        <span>الاتجاهات</span>
                      </a>
                    )}
                  </div>
                </section>
              );
            })()
          ) : (
            <div className="bg-[#141419]/80 border border-dashed border-[#2B2B36] rounded-2xl px-4 py-3.5 flex items-center justify-between gap-3 text-xs text-[#9C968B]">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#D4A853] shrink-0" />
                <span>
                  اضغط على أي علامة صالون أو حلاق على الخريطة لعرض بطاقة المعاينة السريعة والحجز المباشر هنا.
                </span>
              </div>
              <span className="font-mono-num text-[#D4A853] shrink-0">
                {barbersWithLocation.length} على الخريطة
              </span>
            </div>
          )}
        </div>
                          {/* Verified Barbers Directory Sidebar */}
        <div className="lg:col-span-4 space-y-3 max-h-[680px] overflow-y-auto pr-1">
          {verifiedBarbers.length === 0 ? (
            <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-6 text-center space-y-2">
              <Scissors className="w-6 h-6 text-[#D4A853] mx-auto opacity-80" />
              <div className="text-sm font-bold text-[#F5F2EB]">
                {availabilityFilter === 'available'
                  ? `لا يوجد حلاقون متاحون حالياً في ${countryMeta?.nameAr || 'هذا البلد'}`
                  : `لا يوجد حلاقون موثقون في ${countryMeta?.nameAr || 'هذا البلد'} بعد`}
              </div>
              <p className="text-xs text-[#8B857B]">
                {availabilityFilter === 'available'
                  ? 'يمكنك التبديل إلى "جميع الحلاقين" لمشاهدة كافة الصالونات المسجلة.'
                  : 'سيظهر الحلاقون هنا فور توثيق حساباتهم وتحديد مواقعهم.'}
              </p>
            </div>
          ) : (
            verifiedBarbers.map((barber) => {
              const stats = getBarberStats(barber.uid);
              const isOpenNow = isBarberCurrentlyAvailable(barber);
              const liveMeta = getEffectiveLiveStatus(barber);
              const isSelected = selectedBarberId === barber.uid;
              const barberRoles = getUserRoles(barber);
              const barberPrimary = barberRoles[0];
              const distKm =
                userLocation && barber.location
                  ? calculateDistanceKm(userLocation, barber.location)
                  : null;
              const isSelf = currentUser?.uid === barber.uid;

              return (
                <div
                  key={barber.uid}
                  onClick={() => handleSelectBarber(barber)}
                  className={`bg-[#141419] border rounded-2xl p-4 space-y-3 transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-[#D4A853] bg-[#181822]'
                      : 'border-[#27272F] hover:border-[#3A3A46]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        src={barber.photoURL}
                        name={barber.displayName}
                        size="md"
                        role={barberPrimary}
                        roles={barberRoles}
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-[#F5F2EB] truncate">
                          {barber.salonName || barber.displayName}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap text-xs text-[#9C968B] mt-0.5">
                          <span className={`truncate font-semibold ${getRoleNameColor(barberPrimary)}`}>
                            {barber.displayName}
                          </span>
                          <CountryFlag code={barber.countryCode || activeCountryCode} size="xs" />
                          <VipSilverStar roles={barberRoles} size="xs" />
                          <RoleBadgesList roles={barberRoles} size="xs" compact />
                          <span aria-hidden="true">·</span>
                          <span
                            className={`font-semibold ${
                              isOpenNow
                                ? 'text-emerald-400'
                                : liveMeta.status === 'offline'
                                  ? 'text-[#8B857B]'
                                  : 'text-amber-400'
                            }`}
                          >
                            {isOpenNow ? 'متوفر حالياً' : liveMeta.status === 'offline' ? 'مغلق' : 'مشغول'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="inline-flex items-center gap-1 text-xs font-mono-num text-[#D4A853] shrink-0">
                      <Star className="w-3.5 h-3.5 fill-[#D4A853]" />
                      <span>{stats.count > 0 ? stats.avg.toFixed(1) : 'جديد'}</span>
                    </div>
                  </div>

                  <div className="text-xs text-[#A6A196] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <MapPin className="w-3.5 h-3.5 text-[#D4A853] shrink-0" />
                      <span className="truncate">
                        {barber.addressLabel ||
                          (barber.location
                            ? `${barber.location.lat.toFixed(4)}, ${barber.location.lng.toFixed(4)}`
                            : 'لم يتم تحديد الموقع على الخريطة بعد')}
                      </span>
                    </div>
                    {distKm !== null && (
                      <span className="text-[11px] font-mono-num text-sky-300 font-semibold shrink-0">
                        {formatDistanceAr(distKm)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenProfile(barber.uid);
                      }}
                      className="flex-1 py-2 px-3 rounded-xl bg-[#1C1C24] hover:bg-[#252530] border border-[#2D2D38] text-xs font-semibold text-[#F5F2EB] inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <UserIcon className="w-3.5 h-3.5" />
                      <span>البروفايل</span>
                    </button>

                    {!isSelf && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onBookBarber(barber);
                        }}
                        className="flex-1 py-2 px-3 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <CalendarClock className="w-3.5 h-3.5" />
                        <span>حجز موعد</span>
                      </button>
                    )}

                    {barber.location && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${barber.location.lat},${barber.location.lng}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="فتح في خرائط Google"
                        className="p-2 rounded-xl bg-[#1C1C24] hover:bg-[#252530] border border-[#2D2D38] text-[#D4A853] transition-colors"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

interface LocationPickerMapProps {
  location?: GeoLocation;
  addressLabel?: string;
  editable?: boolean;
  onSaveLocation?: (loc: GeoLocation, address: string) => Promise<void>;
}

export const LocationPickerMap: React.FC<LocationPickerMapProps> = ({
  location,
  addressLabel = '',
  editable = false,
  onSaveLocation,
}) => {
  const apiKey = getMapsApiKey();
  const [draftLoc, setDraftLoc] = useState<GeoLocation>(location || DEFAULT_CENTER);
  const [draftAddress, setDraftAddress] = useState(addressLabel);
  const [saving, setSaving] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [pickerCameraTarget, setPickerCameraTarget] = useState<CameraTarget | null>(null);

  const handleMapClick = (e: MapMouseEvent) => {
    if (!editable || !e.detail.latLng) return;
    setDraftLoc({ lat: e.detail.latLng.lat, lng: e.detail.latLng.lng });
  };

  const handleUseMyLocation = () => {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError('المتصفح لا يدعم تحديد الموقع الجغرافي.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextLoc = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        };
        setDraftLoc(nextLoc);
        setPickerCameraTarget({ center: nextLoc, zoom: 15, nonce: Date.now() });
      },
      () => {
        setGeoError('تعذر الوصول إلى موقعك الحالي. يرجى السماح بصلاحية الموقع أو النقر على الخريطة.');
      },
      { enableHighAccuracy: true, timeout: 8500 }
    );
  };

  const handleSave = async () => {
    if (!onSaveLocation) return;
    setSaving(true);
    try {
      await onSaveLocation(draftLoc, draftAddress.trim());
    } finally {
      setSaving(false);
    }
  };

  const activePoint = editable ? draftLoc : location;

  return (
    <div className="bg-[#141419] border border-[#27272F] rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#D4A853]" />
          <h3 className="text-base font-bold text-[#F5F2EB]">موقع الصالون على الخريطة</h3>
        </div>
        {activePoint && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${activePoint.lat},${activePoint.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-semibold text-[#D4A853] hover:underline inline-flex items-center gap-1"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>فتح الاتجاهات</span>
          </a>
        )}
      </div>

      {apiKey && activePoint ? (
        <div className="w-full h-64 rounded-xl overflow-hidden border border-[#262630]">
          <APIProvider apiKey={apiKey} libraries={['marker']} language="ar">
            <GoogleMap
              mapId="DEMO_MAP_ID"
              defaultZoom={14}
              defaultCenter={activePoint}
              onClick={handleMapClick}
              gestureHandling="greedy"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
            >
              <MapCameraController target={pickerCameraTarget} />
              <AdvancedMarker position={activePoint} title="موقع الصالون">
                <Pin background="#D4A853" borderColor="#0B0B0E" glyphColor="#0B0B0E" />
              </AdvancedMarker>
            </GoogleMap>
          </APIProvider>
        </div>
      ) : (
        <div className="rounded-xl bg-[#1A1A22] border border-[#262630] p-4 text-xs text-[#9C968B] flex items-center justify-between">
          <span>
            {activePoint
              ? `الإحداثيات المحفوظة: ${activePoint.lat.toFixed(5)}, ${activePoint.lng.toFixed(5)}`
              : 'لم يتم تحديد إحداثيات الصالون بعد.'}
          </span>
          <Scissors className="w-4 h-4 text-[#D4A853]" />
        </div>
      )}

      {editable && (
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              maxLength={160}
              value={draftAddress}
              onChange={(e) => setDraftAddress(e.target.value)}
              placeholder="وصف العنوان (مثال: شارع التحلية، بجوار برج النخبة)"
              className="bg-[#1A1A22] border border-[#2C2C35] focus:border-[#D4A853] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F2EB] outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleUseMyLocation}
                className="flex-1 py-2.5 px-3 rounded-xl bg-[#1C1C24] hover:bg-[#252530] border border-[#2E2E3A] text-xs font-semibold text-[#F5F2EB] inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Crosshair className="w-3.5 h-3.5 text-[#D4A853]" />
                <span>موقعي الحالي (GPS)</span>
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="flex-1 py-2.5 px-3 rounded-xl bg-[#D4A853] hover:bg-[#E0B96B] text-[#0B0B0E] text-xs font-bold cursor-pointer disabled:opacity-60"
              >
                {saving ? 'جاري الحفظ...' : 'حفظ الموقع'}
              </button>
            </div>
          </div>
          {geoError && <p className="text-xs text-red-400">{geoError}</p>}
          <p className="text-[11px] text-[#8B857B]">
            يمكنك النقر مباشرة على الخريطة أو استخدام زر GPS لتحديث موقع صالونك بدقة.
          </p>
        </div>
      )}
    </div>
  );
};
                    
