import { redirect } from "next/navigation";

export default function ImportRedirect() {
  redirect("/leads/capture?mode=import");
}
