// lib/voice/apify-status.ts
//
// Pure mapping from Apify actor-run status to our import status. Unknown or
// missing statuses map to "processing" so a transient/unexpected value never
// prematurely reports failure or success to the client.

export type ImportStatus = "processing" | "complete" | "failed";

export function mapApifyStatus(apifyStatus: string | null | undefined): ImportStatus {
  switch (apifyStatus) {
    case "SUCCEEDED":
      return "complete";
    case "FAILED":
    case "TIMED-OUT":
    case "ABORTED":
      return "failed";
    default:
      return "processing";
  }
}
