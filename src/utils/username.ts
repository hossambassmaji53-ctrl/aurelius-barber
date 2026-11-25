export function getUserHandle(..._args: unknown[]): string {
  return '';
}

export function isActiveSpecialId(..._args: unknown[]): boolean {
  return false;
}

export function isNumericUserId(value: unknown): boolean {
  return typeof value === 'string' && /^\d+$/.test(value.trim());
}

export function isReservedSpecialNumber(..._args: unknown[]): boolean {
  return false;
}

export function isValidUserId(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function normalizeNumericIdInput(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

export function normalizeUsernameInput(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
