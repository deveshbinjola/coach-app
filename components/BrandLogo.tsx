type BrandLogoProps = {
  showWordmark?: boolean;
  productLabel?: string;
  iconSize?: number;
  className?: string;
};

export default function BrandLogo({
  showWordmark = true,
  productLabel,
  iconSize = 32,
  className = "",
}: BrandLogoProps) {
  if (showWordmark) {
    const width = Math.round(iconSize * (312 / 88));
    return (
      <span className={`inline-flex items-center gap-2.5 shrink-0 ${className}`}>
        <img
          src="/logo.svg"
          alt="ElevateAI"
          width={width}
          height={iconSize}
          className="block h-auto shrink-0"
        />
        {productLabel ? (
          <span
            className="shrink-0 border-l border-[var(--border-strong)] pl-2.5 font-semibold tracking-normal text-[color:var(--text-muted)]"
            style={{ fontSize: Math.max(13, Math.round(iconSize * 0.38)) }}
            aria-hidden
          >
            {productLabel}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandIcon size={iconSize} />
    </span>
  );
}

export function BrandIcon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
      className="shrink-0 drop-shadow-sm"
    >
      <rect x="3" y="4" width="39" height="39" rx="9.8" fill="#00F33D" />
      <path
        d="M14.2 30.5C13.6 24 15.2 18.8 19.9 15.6C23.5 13.2 27.7 13.4 32.1 10.2C33.9 18.5 31.6 25.6 25.7 28.8C21.9 30.9 18 30.7 15.4 29.6L14.2 30.5Z"
        fill="#071126"
      />
      <path
        d="M13.4 32.1C15.8 26.9 19.8 22.9 25.3 20.1"
        stroke="#071126"
        strokeWidth="2.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
