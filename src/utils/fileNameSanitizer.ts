// Utilities for creating Windows-safe file name parts.
// We keep Unicode letters (including Cyrillic), but remove/replace characters
// that are invalid for filenames on common platforms (especially Windows).

// Windows disallows: < > : " / \ | ? * and control chars 0x00-0x1F (and DEL 0x7F)
// Also forbids trailing dots/spaces and reserved device names (CON, PRN, ...).

// NOTE: We intentionally do NOT include control-char ranges in this regex,
// because ESLint `no-control-regex` flags them. We strip control chars via codepoints.
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*]/g;
const WHITESPACE = /\s+/g;
const MULTI_UNDERSCORE = /_+/g;
const TRIM_UNDERSCORES_DOTS_SPACES = /^[_\s.]+|[_\s.]+$/g;

const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9'
]);

export function sanitizeFileNamePart(input: string, fallback: string = '1'): string {
  const raw = String(input ?? '').trim();

  // Replace whitespace with underscores early so names like "My January"
  // become "My_January" even if there are multiple spaces/tabs/newlines.
  let out = raw.replace(WHITESPACE, '_');

  // Strip/replace control characters (0x00-0x1F) and DEL (0x7F)
  // because they can break filenames and are not portable.
  out = Array.from(out, (ch) => {
    const code = ch.codePointAt(0) ?? 0;
    return code < 32 || code === 127 ? '_' : ch;
  }).join('');

  // Replace invalid filename characters with underscore
  out = out.replace(INVALID_FILENAME_CHARS, '_');

  // Collapse repeated underscores and trim common junk
  out = out.replace(MULTI_UNDERSCORE, '_').replace(TRIM_UNDERSCORES_DOTS_SPACES, '');

  // Avoid Windows reserved device names (case-insensitive)
  if (WINDOWS_RESERVED_NAMES.has(out.toUpperCase())) {
    out = `_${out}`;
  }

  // Hard limit to avoid extremely long filenames (keeps UX friendly).
  // Windows typical max path issues can show up with very long names.
  if (out.length > 60) {
    out = out.slice(0, 60).replace(TRIM_UNDERSCORES_DOTS_SPACES, '');
  }

  return out || fallback;
}


