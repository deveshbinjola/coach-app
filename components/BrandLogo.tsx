/** The leaf itself, as data. The mark appears in two treatments across the
 *  product: on a rounded square in the lockup, and on a circle as the
 *  assistant's avatar in chat and quiz reactions. Both draw from these two
 *  paths so the shape can never drift between them. */
export const LEAF_PATH =
  "M14.2 30.5C13.6 24 15.2 18.8 19.9 15.6C23.5 13.2 27.7 13.4 32.1 10.2C33.9 18.5 31.6 25.6 25.7 28.8C21.9 30.9 18 30.7 15.4 29.6L14.2 30.5Z";
export const LEAF_STEM_PATH =
  "M13.4 32.1C15.8 26.9 19.8 22.9 25.3 20.1";

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
  // One product, one name. The ElevateAI wordmark used to sit here with
  // "Coach Assistant" hung off a divider, which read as two brands stacked
  // in the corner. The product is the brand now: leaf plus the name.
  if (showWordmark) {
    const [first, ...rest] = (productLabel ?? "Coach Assistant").split(" ");
    return (
      <span className={`inline-flex items-center gap-2.5 shrink-0 ${className}`}>
        <BrandIcon size={iconSize} />
        <span
          className="shrink-0 font-display font-extrabold tracking-tight text-[color:var(--text)]"
          // Fraunces ships optical-size and SOFT axes. /meet was setting these
          // by hand in its own CSS and every other surface was not, so the same
          // wordmark rendered with different letterforms per page. Set once,
          // here, for all of them.
          style={{
            fontSize: Math.max(15, Math.round(iconSize * 0.55)),
            fontVariationSettings: '"SOFT" 30, "opsz" 144',
          }}
        >
          {first}
          {rest.length ? (
            <span className="text-[color:var(--brand)]">{` ${rest.join(" ")}`}</span>
          ) : null}
        </span>
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
      <rect x="3" y="4" width="39" height="39" rx="9.8" fill="#0B6E23" />
      <path
        d={LEAF_PATH}
        fill="#FAF8F3"
      />
      <path
        d={LEAF_STEM_PATH}
        stroke="#FAF8F3"
        strokeWidth="2.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The assistant's face. Same leaf, on a circle instead of a rounded square,
 *  which is what distinguishes "the product" from "the assistant speaking". */
export function AssistantAvatarIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden className="shrink-0">
      <circle cx="24" cy="24" r="22" fill="#0B6E23" />
      <path d={LEAF_PATH} fill="#FAF8F3" />
      <path d={LEAF_STEM_PATH} stroke="#FAF8F3" strokeWidth="2.7" strokeLinecap="round" />
    </svg>
  );
}
