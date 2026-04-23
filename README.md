# Diagnostic Teammate

A reference implementation of a **genuinely independent clinician–AI diagnostic collaboration workflow**, built in response to *Everett et al., npj Digital Medicine, 2026* — "From tool to teammate in a randomized controlled trial of clinician-AI collaborative workflows for diagnosis."

The original study found that even when the custom GPT was instructed to reason independently *before* seeing clinician input, the model anchored on that input in 48% of second-opinion cases. That's a prompt-level fix attempted for an architectural problem.

This app takes a different approach: **two separate API calls with separate contexts**, so the independent analysis is structurally independent — not asked to be.

## The design

1. **Call 1 — Independent AI analysis.** The model sees only the vignette. No clinician input can leak in because none is in context.
2. **Call 2 — Synthesis.** Both analyses are passed in as labelled blocks. The model produces a merged table with origin attribution (AI / Clinician / Both) and a critique of each entry.
3. **Call 3 (optional) — Patient-facing synthesis.** Plain English version of the same content — the "third voice" in a triadic care model.

All three calls use strict JSON schemas, not prose output.

## Running locally

```bash
npm install
cp .env.example .env   # add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:8888.

## Deployment

Designed for Netlify. Set `ANTHROPIC_API_KEY` as an environment variable in the Netlify dashboard, then:

```bash
netlify deploy --prod
```

## Testing

```bash
npm test
```

Runs schema-validation tests on mocked model responses plus one live integration test (requires `ANTHROPIC_API_KEY`, skipped if absent).

## Architecture notes

- `netlify/functions/independent.js` — Call 1, vignette only.
- `netlify/functions/synthesis.js` — Call 2, both analyses.
- `netlify/functions/patient.js` — Call 3, patient-friendly.
- `public/index.html` — single-page UI.
- `prompts/` — prompt text, version-controlled separately so it's easy to inspect and iterate.
- `tests/` — schema validation + live smoke test.

## Licence

MIT. Prompts are CC-BY.

## Author

Built with David Lloyd (Ridgeway Surgery, Harrow) as a reference implementation for the triadic care model.
