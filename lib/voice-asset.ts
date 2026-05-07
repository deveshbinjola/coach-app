import { voiceMemoryRules } from "@/lib/voice-trust";
import type { Content, Lead, LeadMessage, VoiceProfile } from "@/lib/types";

type VoiceAssetSignal = {
  posts?: number;
  posts_count?: number;
  captions_used?: number;
  interview_answers?: number;
  audio_hours?: number;
  audio_minutes?: number;
  sales_calls?: number;
  calls?: number;
};

type VoiceJsonWithSignal = Record<string, unknown> & {
  training_signal?: VoiceAssetSignal;
  source_counts?: VoiceAssetSignal;
};

export type VoiceAssetStats = {
  posts: number;
  audioHours: number;
  salesCalls: number;
  approvedRules: number;
  editedDrafts: number;
  sampleMessages: number;
  totalSignals: number;
  confidence: "New" | "Compounding" | "Locked in";
};

export function getVoiceAssetStats({
  profile,
  messages = [],
  content = [],
  leads = [],
}: {
  profile: VoiceProfile | null;
  messages?: LeadMessage[];
  content?: Content[];
  leads?: Lead[];
}): VoiceAssetStats {
  const voiceJson = (profile?.voice_json ?? {}) as VoiceJsonWithSignal;
  const training = {
    ...(voiceJson.source_counts ?? {}),
    ...(voiceJson.training_signal ?? {}),
  };
  const sampleMessages = profile?.sample_messages?.length ?? 0;
  const posts =
    numberValue(training.posts) ??
    numberValue(training.posts_count) ??
    numberValue(training.captions_used) ??
    Math.max(content.length, sampleMessages);
  const audioHours =
    numberValue(training.audio_hours) ??
    minutesToHours(numberValue(training.audio_minutes)) ??
    0;
  const salesCalls =
    numberValue(training.sales_calls) ??
    numberValue(training.calls) ??
    leads.filter((lead) => lead.discovery_call_completed).length;
  const approvedRules = voiceMemoryRules(profile).length;
  const editedDrafts = messages.filter(
    (message) => message.ai_drafted && message.was_edited === true
  ).length;
  const interviewAnswers = numberValue(training.interview_answers) ?? 0;
  const totalSignals =
    posts + approvedRules + editedDrafts + sampleMessages + salesCalls + interviewAnswers + Math.round(audioHours);

  return {
    posts,
    audioHours,
    salesCalls,
    approvedRules,
    editedDrafts,
    sampleMessages,
    totalSignals,
    confidence:
      totalSignals >= 50
        ? "Locked in"
        : totalSignals >= 15
          ? "Compounding"
          : "New",
  };
}

function numberValue(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

function minutesToHours(minutes: number | null): number | null {
  if (minutes === null) return null;
  return Math.round((minutes / 60) * 10) / 10;
}
