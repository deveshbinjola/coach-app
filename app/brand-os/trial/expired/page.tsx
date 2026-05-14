// /brand-os/trial/expired
//
// Landing for buyers whose trial token is invalid or expired. They can
// always email support to get a fresh link generated against their
// purchase row.

export const runtime = "edge";

const REASONS: Record<string, string> = {
  malformed:        "The link is malformed — likely truncated by an email client.",
  bad_signature:    "The link's signature doesn't validate. It may have been edited.",
  expired:          "Your trial link expired (links are good for 60 days).",
  no_master_key:    "The server can't verify the link right now.",
  run_create_failed: "Couldn't create a Brand OS run on the server.",
};

export default function ExpiredPage({ searchParams }: { searchParams: { reason?: string } }) {
  const reason = (searchParams.reason ?? "").trim();
  const reasonText = REASONS[reason] ?? "We couldn't validate your access link.";
  return (
    <div className="min-h-screen bg-[var(--surface)] flex items-center justify-center px-4 py-12">
      <div className="max-w-lg w-full space-y-6 text-center">
        <h1 className="font-display text-4xl font-extrabold tracking-tight leading-tight text-[color:var(--text)]">
          Link doesn't work.
        </h1>
        <p className="text-[color:var(--text-muted)] leading-relaxed">
          {reasonText} Don't worry — your purchase is safe. Email Sunny and we'll send a fresh link to the email tied to your original $7 purchase.
        </p>
        <a
          href="mailto:sunny.binjola@gmail.com?subject=Brand%20OS%20trial%20link"
          className="inline-flex items-center justify-center h-11 px-6 rounded-[var(--r-md)] bg-[var(--brand-strong)] text-[color:var(--surface)] text-[length:var(--t-body)] font-bold hover:bg-[color-mix(in_srgb,var(--brand)_85%,black)] transition"
        >
          Email Sunny for a fresh link
        </a>
        {reason && (
          <p className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] font-mono">
            ref: {reason}
          </p>
        )}
      </div>
    </div>
  );
}
