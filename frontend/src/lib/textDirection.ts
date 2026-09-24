const RTL_CHAR = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/g;
const LTR_CHAR = /[A-Za-z\u00C0-\u02AF\u0370-\u052F]/g;

export function isPredominantlyRtl(value: string): boolean {
  const rtlCount = value.match(RTL_CHAR)?.length ?? 0;
  if (rtlCount === 0) return false;
  const ltrCount = value.match(LTR_CHAR)?.length ?? 0;
  return rtlCount > ltrCount;
}

export function textDirection(value: string): 'rtl' | 'ltr' {
  return isPredominantlyRtl(value) ? 'rtl' : 'ltr';
}
