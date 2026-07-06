"use client";

import { create } from "zustand";
import type { PainMarker, RecordedFrame } from "@/lib/pose/types";

type Mode = "live" | "review";

interface SessionState {
  mode: Mode;
  frames: RecordedFrame[];
  primaryJoint: string | null;
  /** Unique id per finalized recording — used to save one history entry. */
  recordingId: string | null;
  selectedIndex: number;
  isPlaying: boolean;

  painMarkers: PainMarker[];
  selectedPainId: string | null;

  /** Finalize a capture and switch to review. */
  loadRecording: (frames: RecordedFrame[], primaryJoint: string) => void;
  /** Discard the recording and go back to live capture. */
  reset: () => void;
  setSelectedIndex: (i: number) => void;
  setPlaying: (playing: boolean) => void;
  setPrimaryJoint: (jointId: string) => void;

  addPainMarker: (marker: Omit<PainMarker, "id">) => string;
  updatePainMarker: (id: string, patch: Partial<PainMarker>) => void;
  removePainMarker: (id: string) => void;
  setSelectedPain: (id: string | null) => void;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `p_${Math.floor(performance.now())}_${Math.round(performance.now() % 1000)}`;
}

export const useSession = create<SessionState>((set) => ({
  mode: "live",
  frames: [],
  primaryJoint: null,
  recordingId: null,
  selectedIndex: 0,
  isPlaying: false,
  painMarkers: [],
  selectedPainId: null,

  loadRecording: (frames, primaryJoint) =>
    set({
      mode: "review",
      frames,
      primaryJoint,
      recordingId: newId(),
      selectedIndex: 0,
      isPlaying: false,
      painMarkers: [],
      selectedPainId: null,
    }),

  reset: () =>
    set({
      mode: "live",
      frames: [],
      primaryJoint: null,
      recordingId: null,
      selectedIndex: 0,
      isPlaying: false,
      painMarkers: [],
      selectedPainId: null,
    }),

  setSelectedIndex: (i) => set({ selectedIndex: i }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setPrimaryJoint: (jointId) => set({ primaryJoint: jointId }),

  addPainMarker: (marker) => {
    const id = newId();
    set((s) => ({
      painMarkers: [...s.painMarkers, { ...marker, id }],
      selectedPainId: id,
    }));
    return id;
  },
  updatePainMarker: (id, patch) =>
    set((s) => ({
      painMarkers: s.painMarkers.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    })),
  removePainMarker: (id) =>
    set((s) => ({
      painMarkers: s.painMarkers.filter((m) => m.id !== id),
      selectedPainId: s.selectedPainId === id ? null : s.selectedPainId,
    })),
  setSelectedPain: (id) => set({ selectedPainId: id }),
}));

// Dev-only handle so recordings can be injected for testing without a webcam.
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  (window as unknown as { __session?: typeof useSession }).__session = useSession;
}
