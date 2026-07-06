"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSession } from "@/lib/store/session";

const PoseStudio = dynamic(() => import("@/components/live/PoseStudio"), {
  ssr: false,
  loading: () => (
    <div className="flex aspect-video w-full items-center justify-center card-soft text-sm text-stone-400">
      Preparing studio…
    </div>
  ),
});

export default function LivePage() {
  const mode = useSession((s) => s.mode);

  return (
    <main className="mx-auto min-h-dvh max-w-6xl px-5 py-8">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="group inline-flex items-baseline gap-1.5">
          <span className="font-display text-xl lowercase leading-none text-stone-900">threedpt</span>
          <span className="h-1.5 w-1.5 rounded-full bg-teal-500 transition-transform group-hover:scale-150" />
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-stone-500 shadow-[0_1px_2px_rgba(74,56,30,0.05)]">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
          on-device · private
        </span>
      </header>

      {mode === "live" && (
        <div className="mb-7">
          <h1 className="text-[2.1rem] leading-[1.05] text-stone-900 sm:text-[2.6rem]">
            Movement studio
          </h1>
          <p className="mt-2.5 max-w-xl text-[15px] leading-relaxed text-stone-500">
            Record a few reps through your webcam and get an instant read on your
            form — reps, range, symmetry, joint load, and the anatomy underneath.
            Your camera feed never leaves your device.
          </p>
        </div>
      )}

      <PoseStudio />
    </main>
  );
}
