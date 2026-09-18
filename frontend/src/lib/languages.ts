export interface RoomLanguage {
  code: string;
  name: string;
  nativeName: string;
  dir: 'ltr' | 'rtl';
}

export const defaultRoomLanguages: RoomLanguage[] = [
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr' },
  { code: 'fa', name: 'Persian', nativeName: 'فارسی', dir: 'rtl' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', dir: 'rtl' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', dir: 'ltr' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', dir: 'ltr' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano', dir: 'ltr' },
];

export const DEFAULT_ROOM_LANGUAGE = 'en';

export function getRoomLanguage(code?: string): RoomLanguage {
  return defaultRoomLanguages.find(language => language.code === code)
    ?? defaultRoomLanguages[0]!;
}
