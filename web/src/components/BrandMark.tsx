/** Inline analytics / inspect mark — no public-path dependency (GitHub Pages base-safe). */
export function BrandMark() {
  return (
    <svg
      className="brand-logo"
      viewBox="0 0 48 48"
      width={36}
      height={36}
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id="brandBar" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="1" />
        </linearGradient>
      </defs>
      {/* Chart baseline */}
      <path
        d="M8 38.5h32"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* Ascending bars */}
      <rect x="11" y="29" width="4.2" height="9.5" rx="1.2" fill="url(#brandBar)" />
      <rect x="17.5" y="24" width="4.2" height="14.5" rx="1.2" fill="url(#brandBar)" />
      <rect x="24" y="18.5" width="4.2" height="20" rx="1.2" fill="url(#brandBar)" />
      <rect x="30.5" y="13" width="4.2" height="25.5" rx="1.2" fill="url(#brandBar)" />
      <rect x="37" y="9" width="4.2" height="29.5" rx="1.2" fill="url(#brandBar)" />
      {/* Magnifier */}
      <circle
        cx="20.5"
        cy="20.5"
        r="9.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.1"
      />
      <path
        d="M27.2 27.2 35.8 35.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      {/* Lens highlight */}
      <path
        d="M15.2 17.2c1.4-2.2 3.8-3.4 6.2-3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}
