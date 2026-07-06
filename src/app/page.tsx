import Link from "next/link";

const STEPS = [
  {
    n: "01",
    title: "Record",
    body: "A few reps in front of an ordinary webcam. The footage never leaves your device.",
  },
  {
    n: "02",
    title: "Read",
    body: "An instant read on your form — reps, range, left/right symmetry, tempo, and where it hurts.",
  },
  {
    n: "03",
    title: "See inside",
    body: "Your body, reconstructed in 3D, with the anatomy revealed beneath the joint that hurts.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-20 sm:py-28">
      {/* Hero */}
      <div className="max-w-3xl">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-stone-500 shadow-[0_1px_2px_rgba(74,56,30,0.06)]">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
          markerless movement analysis · on-device
        </div>
        <h1 className="text-[2.6rem] leading-[1.02] text-stone-900 sm:text-6xl">
          See how you move —{" "}
          <span className="italic text-teal-700">and where it hurts.</span>
        </h1>
        <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-stone-600">
          threedpt watches your movement through a webcam, reconstructs your body
          in 3D, and reads your form like a clinician would — then shows you the
          anatomy underneath the joint that hurts.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-4">
          <Link
            href="/live"
            className="group inline-flex items-center gap-2 rounded-full bg-stone-900 px-7 py-3.5 text-[15px] font-medium text-white shadow-[0_8px_24px_-8px_rgba(74,56,30,0.5)] transition hover:bg-stone-800"
          >
            Open the studio
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
          <span className="text-sm text-stone-400">No footage uploaded, ever</span>
        </div>
      </div>

      {/* How it works */}
      <section className="mt-24">
        <div className="grid gap-5 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="card-soft p-6">
              <div className="font-display text-2xl text-teal-600">{s.n}</div>
              <div className="mt-3 font-display text-xl text-stone-900">{s.title}</div>
              <p className="mt-2 text-[14px] leading-relaxed text-stone-500">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-16 max-w-2xl text-[13px] leading-relaxed text-stone-400">
        Movement, range, and joint load are estimated from a single camera and are
        always labeled — an aid to understand how you move, never a diagnosis or a
        substitute for professional care.
      </p>
    </main>
  );
}
