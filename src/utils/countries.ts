import { GeoLocation } from '../types';

export type CountryRegion = 'arab' | 'europe' | 'other';

export interface CountryMeta {
  code: string;
  nameAr: string;
  nameEn: string;
  flag: string;
  region: CountryRegion;
  center: GeoLocation;
  zoom: number;
}

export const COUNTRY_STORAGE_KEY = 'aurelius_selected_country_v1';

export const COUNTRIES: CountryMeta[] = [
  {
    code: 'LB',
    nameAr: 'لبنان',
    nameEn: 'Lebanon',
    flag: '🇱🇧',
    region: 'arab',
    center: { lat: 33.8938, lng: 35.5018 },
    zoom: 11,
  },
  {
    code: 'DE',
    nameAr: 'ألمانيا',
    nameEn: 'Germany',
    flag: '🇩🇪',
    region: 'europe',
    center: { lat: 52.52, lng: 13.405 },
    zoom: 7,
  },
  {
    code: 'FR',
    nameAr: 'فرنسا',
    nameEn: 'France',
    flag: '🇫🇷',
    region: 'europe',
    center: { lat: 48.8566, lng: 2.3522 },
    zoom: 7,
  },
  {
    code: 'SE',
    nameAr: 'السويد',
    nameEn: 'Sweden',
    flag: '🇸🇪',
    region: 'europe',
    center: { lat: 59.3293, lng: 18.0686 },
    zoom: 6,
  },
  {
    code: 'SA',
    nameAr: 'السعودية',
    nameEn: 'Saudi Arabia',
    flag: '🇸🇦',
    region: 'arab',
    center: { lat: 24.7136, lng: 46.6753 },
    zoom: 7,
  },
  {
    code: 'AE',
    nameAr: 'الإمارات',
    nameEn: 'UAE',
    flag: '🇦🇪',
    region: 'arab',
    center: { lat: 25.2048, lng: 55.2708 },
    zoom: 9,
  },
  {
    code: 'EG',
    nameAr: 'مصر',
    nameEn: 'Egypt',
    flag: '🇪🇬',
    region: 'arab',
    center: { lat: 30.0444, lng: 31.2357 },
    zoom: 8,
  },
  {
    code: 'JO',
    nameAr: 'الأردن',
    nameEn: 'Jordan',
    flag: '🇯🇴',
    region: 'arab',
    center: { lat: 31.9454, lng: 35.9284 },
    zoom: 9,
  },
  {
    code: 'IQ',
    nameAr: 'العراق',
    nameEn: 'Iraq',
    flag: '🇮🇶',
    region: 'arab',
    center: { lat: 33.3152, lng: 44.3661 },
    zoom: 7,
  },
  {
    code: 'KW',
    nameAr: 'الكويت',
    nameEn: 'Kuwait',
    flag: '🇰🇼',
    region: 'arab',
    center: { lat: 29.3759, lng: 47.9774 },
    zoom: 11,
  },
  {
    code: 'QA',
    nameAr: 'قطر',
    nameEn: 'Qatar',
    flag: '🇶🇦',
    region: 'arab',
    center: { lat: 25.2854, lng: 51.531 },
    zoom: 11,
  },
  {
    code: 'BH',
    nameAr: 'البحرين',
    nameEn: 'Bahrain',
    flag: '🇧🇭',
    region: 'arab',
    center: { lat: 26.2285, lng: 50.586 },
    zoom: 11,
  },
  {
    code: 'OM',
    nameAr: 'عُمان',
    nameEn: 'Oman',
    flag: '🇴🇲',
    region: 'arab',
    center: { lat: 23.588, lng: 58.3829 },
    zoom: 8,
  },
  {
    code: 'SY',
    nameAr: 'سوريا',
    nameEn: 'Syria',
    flag: '🇸🇾',
    region: 'arab',
    center: { lat: 33.5138, lng: 36.2765 },
    zoom: 8,
  },
  {
    code: 'PS',
    nameAr: 'فلسطين',
    nameEn: 'Palestine',
    flag: '🇵🇸',
    region: 'arab',
    center: { lat: 31.9038, lng: 35.2034 },
    zoom: 9,
  },
  {
    code: 'MA',
    nameAr: 'المغرب',
    nameEn: 'Morocco',
    flag: '🇲🇦',
    region: 'arab',
    center: { lat: 33.5731, lng: -7.5898 },
    zoom: 7,
  },
  {
    code: 'TN',
    nameAr: 'تونس',
    nameEn: 'Tunisia',
    flag: '🇹🇳',
    region: 'arab',
    center: { lat: 36.8065, lng: 10.1815 },
    zoom: 8,
  },
  {
    code: 'DZ',
    nameAr: 'الجزائر',
    nameEn: 'Algeria',
    flag: '🇩🇿',
    region: 'arab',
    center: { lat: 36.7538, lng: 3.0588 },
    zoom: 7,
  },
  {
    code: 'TR',
    nameAr: 'تركيا',
    nameEn: 'Turkey',
    flag: '🇹🇷',
    region: 'europe',
    center: { lat: 41.0082, lng: 28.9784 },
    zoom: 7,
  },
  {
    code: 'GB',
    nameAr: 'المملكة المتحدة',
    nameEn: 'United Kingdom',
    flag: '🇬🇧',
    region: 'europe',
    center: { lat: 51.5072, lng: -0.1276 },
    zoom: 7,
  },
  {
    code: 'NL',
    nameAr: 'هولندا',
    nameEn: 'Netherlands',
    flag: '🇳🇱',
    region: 'europe',
    center: { lat: 52.3676, lng: 4.9041 },
    zoom: 8,
  },
  {
    code: 'BE',
    nameAr: 'بلجيكا',
    nameEn: 'Belgium',
    flag: '🇧🇪',
    region: 'europe',
    center: { lat: 50.8503, lng: 4.3517 },
    zoom: 9,
  },
  {
    code: 'CH',
    nameAr: 'سويسرا',
    nameEn: 'Switzerland',
    flag: '🇨🇭',
    region: 'europe',
    center: { lat: 47.3769, lng: 8.5417 },
    zoom: 8,
  },
  {
    code: 'US',
    nameAr: 'الولايات المتحدة',
    nameEn: 'United States',
    flag: '🇺🇸',
    region: 'other',
    center: { lat: 40.7128, lng: -74.006 },
    zoom: 5,
  },
  {
    code: 'CA',
    nameAr: 'كندا',
    nameEn: 'Canada',
    flag: '🇨🇦',
    region: 'other',
    center: { lat: 43.6532, lng: -79.3832 },
    zoom: 5,
  },
  {
    code: 'AU',
    nameAr: 'أستراليا',
    nameEn: 'Australia',
    flag: '🇦🇺',
    region: 'other',
    center: { lat: -33.8688, lng: 151.2093 },
    zoom: 6,
  },
];

const COUNTRY_BY_CODE = new Map<string, CountryMeta>(
  COUNTRIES.map((c) => [c.code, c])
);

const TIMEZONE_TO_COUNTRY: Record<string, string> = {
  'Asia/Beirut': 'LB',
  'Europe/Berlin': 'DE',
  'Europe/Busingen': 'DE',
  'Europe/Paris': 'FR',
  'Europe/Stockholm': 'SE',
  'Asia/Riyadh': 'SA',
  'Asia/Dubai': 'AE',
  'Africa/Cairo': 'EG',
  'Asia/Amman': 'JO',
  'Asia/Baghdad': 'IQ',
  'Asia/Kuwait': 'KW',
  'Asia/Qatar': 'QA',
  'Asia/Bahrain': 'BH',
  'Asia/Muscat': 'OM',
  'Asia/Damascus': 'SY',
  'Asia/Gaza': 'PS',
  'Asia/Hebron': 'PS',
  'Africa/Casablanca': 'MA',
  'Africa/Tunis': 'TN',
  'Africa/Algiers': 'DZ',
  'Europe/Istanbul': 'TR',
  'Asia/Istanbul': 'TR',
  'Europe/London': 'GB',
  'Europe/Amsterdam': 'NL',
  'Europe/Brussels': 'BE',
  'Europe/Zurich': 'CH',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
};

export function isValidCountryCode(code?: string | null): code is string {
  if (!code) return false;
  return COUNTRY_BY_CODE.has(code.trim().toUpperCase());
}

export function normalizeCountryCode(code?: string | null): string | null {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  return COUNTRY_BY_CODE.has(upper) ? upper : null;
}

export function getCountryByCode(code?: string | null): CountryMeta | null {
  const normalized = normalizeCountryCode(code);
  return normalized ? COUNTRY_BY_CODE.get(normalized) || null : null;
}

export function detectSuggestedCountryCode(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TIMEZONE_TO_COUNTRY[tz]) {
      return TIMEZONE_TO_COUNTRY[tz];
    }

    const langs =
      typeof navigator !== 'undefined'
        ? [...(navigator.languages || []), navigator.language].filter(Boolean)
        : [];

    for (const lang of langs) {
      const parts = lang.split(/[-_]/);
      if (parts.length >= 2) {
        const region = parts[parts.length - 1].toUpperCase();
        if (COUNTRY_BY_CODE.has(region)) {
          return region;
        }
      }
      const base = parts[0].toLowerCase();
      if (base === 'de') return 'DE';
      if (base === 'fr') return 'FR';
      if (base === 'sv') return 'SE';
      if (base === 'tr') return 'TR';
      if (base === 'nl') return 'NL';
    }
  } catch {
    // Fallback below if browser blocks Intl/navigator
  }
  return 'LB';
}

export function getSavedCountryCode(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(COUNTRY_STORAGE_KEY);
    return normalizeCountryCode(raw);
  } catch {
    return null;
  }
}

export function saveCountryCodeLocal(code: string): void {
  if (typeof window === 'undefined') return;
  const normalized = normalizeCountryCode(code);
  if (!normalized) return;
  try {
    window.localStorage.setItem(COUNTRY_STORAGE_KEY, normalized);
  } catch {
    // Ignore storage quota restrictions
  }
}

export function clearCountryScopedCaches(): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith('aurelius_country_cache_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => window.localStorage.removeItem(k));
    if (typeof window.sessionStorage !== 'undefined') {
      const sKeys: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const key = window.sessionStorage.key(i);
        if (key && key.startsWith('aurelius_country_cache_')) {
          sKeys.push(key);
        }
      }
      sKeys.forEach((k) => window.sessionStorage.removeItem(k));
    }
  } catch {
    // Ignore storage errors
  }
}
export function matchesActiveCountry(
  itemCountryCode: string | undefined,
  authorCountryCode: string | undefined,
  
  activeCountryCode: string
): boolean {
  const normalizedActive = normalizeCountryCode(activeCountryCode);
  if (!normalizedActive) return true;

  const normalizedItem = normalizeCountryCode(itemCountryCode);
  if (normalizedItem) {
    return normalizedItem === normalizedActive;
  }

  const normalizedAuthor = normalizeCountryCode(authorCountryCode);
  if (normalizedAuthor) {
    return normalizedAuthor === normalizedActive;
  }

  return true;
}
