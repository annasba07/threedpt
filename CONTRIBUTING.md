# Contributing to threedpt

Thanks for your interest! threedpt is an experiment in browser-based, on-device movement analysis, and contributions are welcome.

## Ground rules

- **It is not a medical device.** Any feature that produces a number or a statement about a person's body must stay honest: label estimates as estimates, keep clinical framing as reference (not diagnosis), and never let AI-generated content masquerade as measured fact. The "coach" is intentionally deterministic for this reason — see `src/lib/analysis/`.
- **On-device by default.** The camera feed and pose data should not leave the browser without an explicit, opt-in reason.

## Getting set up

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # type-check + production build
npm run lint
```

No webcam? Use **▶ Try a sample clip** — it feeds the bundled video through the exact same pose pipeline as a live camera. There's also a dev-only `window.__session` handle for injecting recordings without a camera (see `src/lib/store/session.ts`).

## Project layout

| Path | What lives there |
|------|------------------|
| `src/lib/pose/` | landmarks, angle math, smoothing, rep detection, joint-load estimate |
| `src/lib/analysis/` | deterministic metrics + the coaching "read" |
| `src/lib/anatomy/` | curated per-joint structure atlas |
| `src/components/live/` | capture, 3D body, review UI (The Read / The Lab) |
| `src/app/` | routes, layout, design system |

## Pull requests

- Keep commits small and focused, with a clear conventional-style summary (`feat(pose): …`, `fix(review): …`).
- Run `npm run build` and `npm run lint` before pushing.
- If you touch the analysis math, add or update a quick check — the pose/analysis libs are plain functions and easy to test in isolation.
- For UI changes, a before/after screenshot in the PR is hugely appreciated.

## Assets

Don't commit non-redistributable assets. The default avatar is a Quaternius **CC0** model; anatomy art and the sample clip are AI-generated and labeled illustrative. If you add an asset, note its license in the PR.
