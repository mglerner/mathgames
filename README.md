# The Vark Job

A choose-your-own-adventure math game for a student getting ready for Algebra 2. You are part
of a small crew breaking into Vark Tower, and every lock in the building is a math problem.
Between locks there are short side-scrolling running sections.

It is live at https://shadyalexi.com/ and runs in a phone browser. Plain JavaScript modules,
no build step, no dependencies.

## What it teaches, and how

The skills are the ones that tend to be shaky going into Algebra 2: distributing a negative,
solving linear equations with negatives, simplifying square roots, and rationalizing a
denominator. The design rests on a few rules.

- **Wrong answers are named, not just marked.** Every wrong choice comes from a specific slip
  (a lost sign, a term that was not multiplied). Picking it shows the working that probably
  produced it, in red, next to the working done correctly.
- **The student says what happened.** After every miss the game asks "was that what you
  actually wrote?" and for one sentence in the student's own words. Both go in the report.
- **Only typed answers count as mastery.** Doors are multiple choice and are for teaching.
  Each floor ends in a lock where answers are typed on a keypad, three right in a row.
  A skill counts as mastered at 4 of the last 5 typed answers right, across at least 2 days.
- **Nothing is first met under test.** Every problem shape a lock can ask has a door that
  teaches it first.
- **"My answer is not here" is sometimes true.** One door per play-through leaves the right
  answer off its list. The button always asks for the answer, so tapping it gives nothing away.
- **The teacher gets a plain-text report**: every answer, the time on each problem (counted
  only while the page is visible), and the student's own notes.

## Layout

| Path                                 | What it is                                                           |
| ------------------------------------ | -------------------------------------------------------------------- |
| `story/`                             | The game that is live. Everything below is about this folder.        |
| `story/app.js`                       | Episode menu.                                                        |
| `story/ep1.js`, `story/ep2.js`       | The two episode players.                                             |
| `story/episodes/`                    | Story text, and the problem generators for episode 2.                |
| `story/game/`                        | The running sections: simulation, drawing, levels.                   |
| `story/mastery.js`                   | The mastery rule and the on-screen timer.                            |
| `story/feedback.php`                 | Receives the report. Write-only; stores it outside the web root.     |
| `story/teacher/`                     | Open once on a device to label its reports as test runs.             |
| `story/test/`                        | Tests, and a tool that takes pictures of every screen.               |
| `src/`, `api/`, `scripts/`, `proto/` | An earlier, larger engine ("Keystone Deep") and its first prototype. |
| `test/`                              | Tests for that earlier engine.                                       |
| `docs/DESIGN.md`                     | The earlier engine's design document. It does not describe `story/`. |

The earlier engine is kept because its problem generators, answer parser and catalogue of
common slips ("mal-rules") are reusable. It is not what is deployed.

## Run it

```
cd story
python3 -m http.server 8000
```

Then open http://localhost:8000/. Progress is kept in the browser's `localStorage`. On a
static server like this one there is no PHP, so the report is not sent; the last screen
offers a Copy button instead.

## Test it

Needs Node.js 22 or newer (developed on 26). There is nothing to install.

```
node --test story/test/                    # the story game
npm test                                   # the earlier engine
(cd proto && node --test test/)            # the prototype
```

`story/test/shots.sh` serves the game locally and uses headless Chrome to save a picture of
every screen into `story/test/shots/`. The screens come from the real game code, and a test
fails if a screen exists without a picture, so the pictures cannot drift from the game.

## Deploy it

`story/` is the whole site. Copy it to any web host; leave out `test/`.

```
rsync -a --exclude 'test/' story/ HOST:WEBROOT/
```

With PHP on the host, `feedback.php` writes each report to a `story-feedback/` folder beside
the web root, where the web server cannot serve it.

## How it was made

Written by Michael G. Lerner with Claude Code, Anthropic's coding agent. The public history
starts from a single commit; earlier history is kept privately.

## Licence

MIT. See `LICENSE`.
