"use client";

import { useSession } from "@/lib/store/session";
import LiveCapture from "./LiveCapture";
import ReviewStudio from "./ReviewStudio";

export default function PoseStudio() {
  const mode = useSession((s) => s.mode);
  return mode === "review" ? <ReviewStudio /> : <LiveCapture />;
}
