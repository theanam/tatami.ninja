const files = import.meta.glob('../assets/icons/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** Inner markup of each design icon, keyed by file name. */
const ICONS: Record<string, string> = {};
for (const [path, raw] of Object.entries(files)) {
  const name = path.split('/').pop()!.replace('.svg', '');
  ICONS[name] = raw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
}

// Extra icons in the same 24×24 / 1.7 stroke style.
const EXTRA: Record<string, string> = {
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-1 .6-1.5 1.2-1.5 2.5M12 17h.01"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  folder: '<path d="M4 6h6l2 2h8v11H4z"/>',
  usb: '<rect x="8" y="9" width="8" height="12" rx="1.5"/><path d="M10 9V4h4v5M11 6h.01M13 6h.01"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  // Pencil: the standard "edit" glyph (distinct from the Pen drawing tool's nib).
  edit: '<path d="M16.5 3.5a2.1 2.1 0 013 3L8 18l-4 1 1-4z"/><path d="M14.5 5.5l3 3"/>',
  'image-add': '<path d="M14 4H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2v-6"/><circle cx="8.5" cy="9.5" r="1.6"/><path d="M21 16l-5-5-9 9"/><path d="M19 2v6M16 5h6"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
  check: '<path d="M5 12l4 4 10-10"/>',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'arrow-left': '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  machine: '<path d="M3 19h18M5 19V8a2 2 0 012-2h10a3 3 0 013 3v2h-6v8M14 11v3"/>',
  commercial: '<rect x="3" y="5" width="18" height="10" rx="2"/><path d="M7 15v4M17 15v4M3 19h18M8 10h4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
  'circle-empty': '<circle cx="12" cy="12" r="5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  rotate: '<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>',
  union: '<rect x="3" y="3" width="12" height="12" rx="1"/><rect x="9" y="9" width="12" height="12" rx="1"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  grid: '<path d="M4 4h16v16H4zM4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16"/>',
  magnet: '<path d="M6 3v8a6 6 0 0012 0V3h-4v8a2 2 0 01-4 0V3zM6 7h4M14 7h4"/>',
  guides: '<path d="M12 2v20M2 12h20" stroke-dasharray="2 2"/><rect x="6" y="6" width="6" height="6" rx="1"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
};

export type IconName = string;

export function Icon({ name, small, className = '', label }: { name: IconName; small?: boolean; className?: string; label?: string }) {
  const inner = ICONS[name] ?? EXTRA[name] ?? '';
  return (
    <svg
      className={`i${small ? ' s' : ''} ${className}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

export function hasIcon(name: string): boolean {
  return name in ICONS || name in EXTRA;
}

/** tatami.ninja mark. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#3B6CF0" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="#fff" strokeWidth="1.6" />
      <path d="M4.5 17.5C9 13 12.5 19 19.5 6.5" fill="none" stroke="#FFD27A" strokeWidth="1.6" strokeDasharray="2 1.6" strokeLinecap="round" />
    </svg>
  );
}

/** GitHub mark (filled). */
export function GithubMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
