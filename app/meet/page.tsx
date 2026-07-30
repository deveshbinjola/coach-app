// /meet — public "assistant interview" teaser quiz. No auth required.
//
// Top-of-funnel companion to /login: three playful questions, an assistant
// archetype result, then signup. Answers persist client-side (localStorage)
// and are imported by the /welcome interview step after account creation.

import type { Metadata } from "next";
import MeetQuiz from "@/components/meet/MeetQuiz";
import "./meet.css";

export const runtime = "edge";

export const metadata: Metadata = {
  title: "Meet your assistant · Coach Assistant",
  description:
    "Three questions. 60 seconds. Find out what kind of assistant your coaching business actually needs.",
};

export default function MeetPage() {
  return <MeetQuiz />;
}
