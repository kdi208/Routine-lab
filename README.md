# Routine Lab

A public, account-free version of the routine tracker's recommendation engine.
You can edit your training routine, log body measurements, and see what each change
is predicted to do to each tape site (chest, shoulders, arms, forearms, neck, waist, hips, thighs, calves).

- **Routine**: a repeating cycle of days. Each exercise shows the body parts it credits.
- **Impact**: the draft routine compared with the routine in force today. It shows a body map,
  one row per tape, a breakdown of each change on its own, goals per body part, and suggested next changes.
- **Body**: dated tape measurements and bodyweight.

**Live:** https://kdi208.github.io/routine-lab/

The engine (`src/lib/response-model.ts`, `exercise-sites.ts`, `sites.ts`) came from a private
tracker, with the per-person goals replaced by goals the visitor sets. `src/lib/planner.ts` turns saved routine
versions into the sets the visitor would have logged by following them. Those sets feed the same
interval/fit code, so the model personalises once two measurements bracket a followed routine.

All data stays in the visitor's browser (localStorage). Export/Import moves it between devices.
There is no backend and no Supabase.

## Develop

```bash
npm install
npm run dev     # http://localhost:3000
npm test
npm run build   # static site in out/
```

## Deploy

Every push to `main` runs `.github/workflows/pages.yml`: tests, lint, a static build, then a GitHub Pages deploy.
The repository's Pages source must be set to **GitHub Actions** (Settings → Pages).

## License

MIT, see [LICENSE](LICENSE).
