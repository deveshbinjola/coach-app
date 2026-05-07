// /today is now /command-center.
// Permanent redirect so bookmarks and existing links keep working.
import { redirect } from "next/navigation";

export default function TodayRedirect() {
  redirect("/command-center");
}
