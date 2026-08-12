# Coach scenario media

Production playbooks (`content/coach-scenarios/*_production.json`) reference paths under `/coach/<topic>/`.

## Standards

See `components/diy-visuals/STANDARDS.md` and attribution in [`SOURCES.md`](./SOURCES.md).

Rules:

- Prefer **photoreal identification** stills (Class B / location) over decorative GIFs
- Always ship accurate `alt` + `shot_description` in JSON
- Mark AI / generic stills as **illustrative** in `alt` when misrecognition is possible
- Never invent torque, PSI, or mileage on the image — those stay in playbook text
- If a file is missing or `src` is empty (`type: "none"`), `CoachStepVisual` shows an honest empty frame

## Current ship set (2026-08)

Battery · Oil · Tires · Brakes identification stills (`*-ai.jpg`). Action-heavy or safety-critical steps intentionally use empty frames.
