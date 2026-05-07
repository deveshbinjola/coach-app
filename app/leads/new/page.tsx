import { redirect } from "next/navigation";

export default function NewLeadRedirect() {
  redirect("/leads/capture?mode=manual");
}
