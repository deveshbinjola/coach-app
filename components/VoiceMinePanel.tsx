"use client";

// VoiceMinePanel, client component for /voice/mine.
//
// Refactored Session 4 onto the design system. Linear energy: stripped
// ornamentation, calm pacing, primitives over hand-rolled chrome.
//
// Three states:
//   1. Empty, big textarea + "Mine my voice" button.
//   2. Mining, button shows pulsing-dot label per the style guide rule
//                for >5s operations.
//   3. Result, structured voice profile preview + Save / Discard.
//
// On Save: writes a new cp_voice_profiles row with version+1 and active=true,
// deactivates the prior active one. RLS allows the coach to write their own.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { Badge, Button, Card, Textarea } from "@/components/ui";

type MinedVoice = {
  tone?:               string[];
  sentence_rhythm?:    string;
  vocabulary?:         { use?: string[]; avoid?: string[] };
  openers?:            string[];
  closers?:            string[];
  ctas?:               string[];
  emotional_register?: string;
  do_nots?:            string[];
  ig_specific?: {
    hook_pattern?:  string;
    hashtag_style?: string;
    post_length?:   string;
  };
  training_signal?: {
    captions_used?: number;
    posts?: number;
  };
};

type MineResult = {
  voice_json:      MinedVoice;
  sample_messages: string[];
  captions_used:   number;
};

const MIN_CAPTIONS = 5;

export default function VoiceMinePanel() {
  const router   = useRouter();
  const supabase = createClient();

  const [pasted, setPasted]             = useState("");
  const [mining, setMining]             = useState(false);
  const [result, setResult]             = useState<MineResult | null>(null);
  const [saving, setSaving]             = useState(false);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [error, setError]               = useState<string | null>(null);

  // Captions parsed live from the textarea so we can show a count + warn
  // before they hit the button.
  const parsedCaptions = useMemo(
    () =>
      pasted
        .split(/\n\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 10),
    [pasted]
  );

  async function mine() {
    setError(null);
    setResult(null);
    setSavedVersion(null);
    if (parsedCaptions.length < MIN_CAPTIONS) {
      setError(
        `Need at least ${MIN_CAPTIONS} non-trivial captions. Got ${parsedCaptions.length}. Separate captions with a blank line.`
      );
      return;
    }
    setMining(true);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke(
        "voice-mine",
        { body: { captions: parsedCaptions } }
      );
      if (invokeErr) {
        setError(invokeErr.message);
        return;
      }
      const r = data as MineResult & { error?: string };
      if (r.error) {
        setError(r.error);
        return;
      }
      setResult({
        voice_json:      r.voice_json,
        sample_messages: r.sample_messages ?? [],
        captions_used:   r.captions_used ?? parsedCaptions.length,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setMining(false);
    }
  }

  async function save() {
    if (!result) return;
    setError(null);
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Not authenticated. Sign in again.");
        return;
      }

      // Get next version. Voice profile versioning means we never destroy
      // history. The coach can always re-activate an older profile by
      // running a SQL update if they regret the change.
      const { data: latest } = await supabase
        .from("cp_voice_profiles")
        .select("version")
        .eq("coach_id", user.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVersion = (latest?.version ?? 0) + 1;

      // Deactivate prior active row before inserting the new active one.
      // Done as two writes because Supabase JS doesn't expose a cleaner
      // single-transaction primitive. Race risk = vanishingly small here
      // (a coach won't double-mine in the same second).
      await supabase
        .from("cp_voice_profiles")
        .update({ active: false })
        .eq("coach_id", user.id)
        .eq("active", true);

      const { error: insErr } = await supabase
        .from("cp_voice_profiles")
        .insert({
          coach_id:        user.id,
          voice_json:      {
            ...result.voice_json,
            training_signal: {
              ...(result.voice_json.training_signal ?? {}),
              captions_used: result.captions_used,
              posts: result.captions_used,
            },
          },
          sample_messages: result.sample_messages,
          version:         nextVersion,
          active:          true,
        });
      if (insErr) {
        setError(insErr.message);
        return;
      }
      setSavedVersion(nextVersion);
      // Defer navigation so the success state is visible for a beat.
      setTimeout(() => {
        router.push("/voice");
        router.refresh();
      }, 1200);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  // ── render ───────────────────────────────────────────────────────────────

  if (savedVersion !== null) {
    return (
      <Card padding="lg" className="text-center border-2 border-[var(--brand)] bg-[var(--brand-soft)]">
        <div className="text-[length:var(--t-display)] leading-none">✓</div>
        <h2 className="text-[length:var(--t-h2)] font-bold mt-2 text-[color:var(--text)]">
          Voice saved as version {savedVersion}.
        </h2>
        <p className="text-[length:var(--t-caption)] text-[color:var(--text-muted)] mt-2">
          Every AI draft from here on writes in this voice. Redirecting…
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Empty / mining state ────────────────────────────────────── */}
      {!result && (
        <Card padding="md">
          <Textarea
            label="Your captions / posts"
            hint="One per blank line. Pick your best writing, the posts you'd point at and say 'this sounds like me.' More signal = better voice profile."
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={14}
            placeholder={`Your voice isn't loud.
It doesn't perform.
It just keeps choosing the next honest move.

Most people don't have a discipline problem.
They have a clarity problem dressed up as one.

[paste more captions, separated by a blank line]`}
          />

          <div className="flex items-center justify-between mt-3 flex-wrap gap-3">
            <div className="text-[length:var(--t-caption)] text-[color:var(--text-muted)]">
              <strong
                className={
                  parsedCaptions.length >= MIN_CAPTIONS
                    ? "text-[color:var(--success)]"
                    : "text-[color:var(--warning)]"
                }
              >
                {parsedCaptions.length}
              </strong>{" "}
              caption{parsedCaptions.length === 1 ? "" : "s"} detected
              {parsedCaptions.length < MIN_CAPTIONS && (
                <span className="text-[color:var(--warning)]">
                  {" "}
                  · need at least {MIN_CAPTIONS}
                </span>
              )}
            </div>
            <Button
              onClick={mine}
              disabled={mining || parsedCaptions.length < MIN_CAPTIONS}
            >
              {mining ? (
                <>
                  <span
                    className="inline-block w-2 h-2 rounded-full bg-current animate-pulse"
                    aria-hidden
                  />
                  Mining your voice…
                </>
              ) : (
                <>Mine my voice</>
              )}
            </Button>
          </div>
        </Card>
      )}

      {/* ── Result state ────────────────────────────────────────────── */}
      {result && (
        <div className="space-y-4">
          <Card variant="elevated" padding="md" className="border-2 border-[var(--brand)] bg-[var(--brand-soft)]">
            <Badge tone="brand" size="xs" uppercase>
              Voice mined from {result.captions_used} captions
            </Badge>
            <p className="text-[length:var(--t-caption)] text-[color:var(--text)] mt-2 leading-[var(--leading-base)]">
              Review the patterns we found below. If it sounds like you, save
              it. If not, hit Discard and try with different (or more)
              captions.
            </p>
          </Card>

          <VoicePreview v={result.voice_json} samples={result.sample_messages} />

          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "✓ Save as my voice profile"}
            </Button>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setError(null);
              }}
              disabled={saving}
              className="text-[length:var(--t-caption)] font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text)] underline decoration-dotted underline-offset-4 disabled:opacity-50"
            >
              Discard and try again
            </button>
          </div>
        </div>
      )}

      {error && (
        <Card padding="md" className="border-[var(--danger)] bg-[var(--danger-soft)]">
          <p className="text-[length:var(--t-caption)] text-[#B42318]">{error}</p>
        </Card>
      )}
    </div>
  );
}

// ── preview sub-component ──────────────────────────────────────────────────

function VoicePreview({
  v,
  samples,
}: {
  v:       MinedVoice;
  samples: string[];
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field title="Tone">
        {v.tone?.length ? <Chips items={v.tone} /> : <Empty />}
      </Field>
      <Field title="Emotional register">
        {v.emotional_register ? (
          <p className="text-[length:var(--t-body)] text-[color:var(--text)] leading-[var(--leading-relaxed)]">
            {v.emotional_register}
          </p>
        ) : (
          <Empty />
        )}
      </Field>
      <Field title="Sentence rhythm" full>
        {v.sentence_rhythm ? (
          <p className="text-[length:var(--t-body)] text-[color:var(--text)] italic leading-[var(--leading-relaxed)]">
            "{v.sentence_rhythm}"
          </p>
        ) : (
          <Empty />
        )}
      </Field>
      <Field title="Use these words">
        {v.vocabulary?.use?.length ? (
          <Chips items={v.vocabulary.use} />
        ) : (
          <Empty />
        )}
      </Field>
      <Field title="Avoid these words">
        {v.vocabulary?.avoid?.length ? (
          <Chips items={v.vocabulary.avoid} variant="danger" />
        ) : (
          <Empty />
        )}
      </Field>
      <Field title="Openers">
        {v.openers?.length ? <Lines items={v.openers} /> : <Empty />}
      </Field>
      <Field title="Closers">
        {v.closers?.length ? <Lines items={v.closers} /> : <Empty />}
      </Field>
      <Field title="CTAs">
        {v.ctas?.length ? <Lines items={v.ctas} /> : <Empty />}
      </Field>
      <Field title="Do-nots" full>
        {v.do_nots?.length ? (
          <Lines items={v.do_nots} variant="danger" />
        ) : (
          <Empty />
        )}
      </Field>
      {v.ig_specific && (
        <Field title="Instagram-specific" full>
          <div className="space-y-1.5 text-[length:var(--t-body)] text-[color:var(--text)] leading-[var(--leading-base)]">
            {v.ig_specific.hook_pattern && (
              <div>
                <strong className="text-[color:var(--text)]">Hook:</strong>{" "}
                {v.ig_specific.hook_pattern}
              </div>
            )}
            {v.ig_specific.hashtag_style && (
              <div>
                <strong className="text-[color:var(--text)]">Hashtags:</strong>{" "}
                {v.ig_specific.hashtag_style}
              </div>
            )}
            {v.ig_specific.post_length && (
              <div>
                <strong className="text-[color:var(--text)]">Length:</strong>{" "}
                {v.ig_specific.post_length}
              </div>
            )}
          </div>
        </Field>
      )}
      {samples.length > 0 && (
        <Field title={`Sample messages saved (${samples.length})`} full>
          <div className="space-y-2">
            {samples.map((s, i) => (
              <blockquote
                key={i}
                className="text-[length:var(--t-body)] text-[color:var(--text)] border-l-2 border-[var(--brand)] pl-3 py-1 bg-[var(--surface-deep)] rounded-r leading-[var(--leading-relaxed)]"
              >
                {s}
              </blockquote>
            ))}
          </div>
        </Field>
      )}
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────

function Field({
  title,
  children,
  full = false,
}: {
  title:    string;
  children: React.ReactNode;
  full?:    boolean;
}) {
  return (
    <Card padding="md" className={full ? "md:col-span-2" : ""}>
      <div className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] font-bold">
        {title}
      </div>
      <div className="mt-2">{children}</div>
    </Card>
  );
}

function Chips({
  items,
  variant = "default",
}: {
  items:    string[];
  variant?: "default" | "danger";
}) {
  const tone = variant === "danger" ? "danger" : "brand";
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <Badge key={i} tone={tone} size="sm">
          {t}
        </Badge>
      ))}
    </div>
  );
}

function Lines({
  items,
  variant = "default",
}: {
  items:    string[];
  variant?: "default" | "danger";
}) {
  const textCls =
    variant === "danger" ? "text-[#B42318]" : "text-[color:var(--text)]";
  return (
    <ul className="space-y-1">
      {items.map((t, i) => (
        <li
          key={i}
          className={`text-[length:var(--t-body)] ${textCls} leading-[var(--leading-relaxed)] before:content-['·'] before:mr-2 before:text-[color:var(--text-faint)]`}
        >
          {t}
        </li>
      ))}
    </ul>
  );
}

function Empty() {
  return (
    <span className="text-[length:var(--t-caption)] text-[color:var(--text-faint)] italic">
      Not detected
    </span>
  );
}
