# Keystone Deep -- proto slice (M0.5)

A self-contained first playable: one encounter screen, a start screen ("Descend") and an
end-of-run screen ("Haul"). Four skills, three interactions, seven mal-rules. Static files, ES
modules, no build step, no dependencies. Nothing here imports from `src/`.

## Serve it

From the repo root:

```
python3 -m http.server 8000
```

Then open `http://<your-mac's-LAN-IP>:8000/proto/` on the iPhone (same Wi-Fi), or
`http://localhost:8000/proto/` on the Mac. ES modules do not load from `file://`.

On a laptop the physical keyboard works on Strike items (digits, `+ - / ^ ( ) = x`, `s` for
sqrt, Backspace, Enter, Esc to clear).

## URL parameters

- `?seed=ABC` -- fixed run seed (the 10-Knot rotation is seeded per run; default is random).
- `?item=GEN:SEED:INTERACTION,...` -- play exactly these items instead of the rotation.
  GEN is `ftw`, `sqrtsq`, `rat` or `quad`; INTERACTION is `forge`, `nextline` or `strike`.

## The teacher's examples, by seed

| Example           | Generator | Seed         | Interactions            |
| ----------------- | --------- | ------------ | ----------------------- |
| 4 x 1/3           | `ftw`     | `parent-85`  | forge, nextline, strike |
| sqrt(3) x sqrt(3) | `sqrtsq`  | `parent-5`   | strike                  |
| 6/sqrt(3)         | `rat`     | `parent-15`  | forge, strike           |
| 6 + 4x = 2x^2     | `quad`    | `parent-998` | nextline, strike        |

All four in one run:

```
/proto/?item=ftw:parent-85:nextline,sqrtsq:parent-5:strike,rat:parent-15:forge,quad:parent-998:strike
```

The seeds are pinned in `js/examples.js` and checked by `test/run.test.js`.

## Tests

```
node --test proto/test/
```

(or `npm test` from `proto/`, or `npm --prefix proto test` from the repo root).

All math, generation, judging, feedback content, run logic and event logging are DOM-free
modules. `test/smoke.test.js` drives the real `js/app.js` through a minimal fake document
(`test/fakedom.js`) for a full run: Descend -> 10 Knots + Echoes -> Haul -> export.

## Layout of the code

- `js/rational.js`, `js/surd.js`, `js/poly.js` -- exact BigInt rationals, q x sqrt(n) surds,
  polynomials in x with surd coefficients. No floats in any check; floats are display only.
- `js/parse.js`, `js/print.js`, `js/evaluate.js`, `js/forms.js` -- keypad parser, printer,
  exact evaluation, "finished form" predicates.
- `js/gens/*.js` -- one generator per skill; `js/malrules.js` -- mal-rules 3, 4, 5, 8, 11, 18, 19.
- `js/judge.js` -- exact judging per DESIGN.md section 3; `js/feedback.js` -- the four beats.
- `js/run.js`, `js/events.js`, `js/vocab.js` -- rotation and Echoes, the event log, names.
- `js/mathview.js`, `js/visuals.js`, `js/vnode.js` -- math renderer and SVG, as vnodes.
- `js/app.js` (DOM layer), `js/main.js` (browser boot), `index.html`, `style.css`.

## Judging decisions (where the spec left a choice)

- Strike answers for 4 x 1/3 must be one fraction in lowest terms: `8/6` is "same value, not
  finished" (not a miss). Improper fractions are finished; mixed numbers cannot be typed.
- Juxtaposition is multiplication and `/` binds tighter: `1/2x` is (1/2)x, `3sqrt2/2` is
  3 x (sqrt2/2). The live preview shows the reading before commit.
- `6/sqrt3` retyped, `6sqrt3/3`, `sqrt12` are "same value, not finished" for 6/sqrt(3).
- Rewrite as ... = 0: any nonzero rational multiple, either side the zero side, descending
  powers. A line whose L - R is not a multiple is wrong (section 3, I8), even when both true
  roots check (e.g. a cubic with an extra root). When the student's line has an extra rational root, the
  feedback names it and the Scale is read at that root.
- A leading `+` is dropped (`+4/3` reads as `4/3`).
- While a Knot is still open ("not finished", "Legal. Not closer."), the Lantern prints the
  prompt and their own response, never the finished answer.
- Typed `2x^2 + 4x + 6 = 0` matches both the Carrier (8) and the Copyist (11): logged as
  ambiguous with both ids, never shown as one Haunt.

## Export

The Haul and Descend screens have "Export log (JSON)": it tries a file download and always also
shows the JSON in a text box to copy (a home-screen web app may not download).
