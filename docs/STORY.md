# The Vark Job: design of the story game

This describes `story/`, the game that is live at https://shadyalexi.com/. It is the current
design. `docs/DESIGN.md` describes an earlier, larger engine ("Keystone Deep") that is not
deployed; nothing below depends on it.

## Who it is for, and the goal

One student, a strong reader, heading into Algebra 2. The gaps are in fraction arithmetic,
distributing, linear equations, exponents and radicals, and factoring. Underneath those is one
conceptual gap: not seeing that most rewriting moves are "multiply by a well-chosen 1" or "do
the same thing to both sides".

The goal is mastery of one skill at a time, checked again later, in the way concept-based
grading does: a skill is not "covered", it is either demonstrated or not yet.

## Rules the game is built on

1. **Wrong answers are named.** Every wrong multiple-choice option comes from a specific slip
   (a lost sign, a term that was not multiplied). Choosing it shows the working that probably
   produced it, with the slip marked in red, next to the working done correctly.
2. **The student says what happened.** After every miss the game asks "was that what you
   actually wrote?" (when it guessed) and for one sentence in the student's own words. Both
   are required and both go in the report. The introspection is worth having even when the
   guess was wrong.
3. **Only typed answers count as evidence.** Multiple choice is for teaching. Mastery comes
   from answers typed on a keypad with no choices offered (a "constructed response").
4. **Nothing is first met under test.** Every shape of problem that can be asked for a typed
   answer is taught by a multiple-choice step first. The keypad itself is tried once, with
   nothing at stake, before it counts.
5. **Right value, not finished, is not a miss.** `3 sqrt(8)` for `sqrt(72)`, or `2/4` for
   `1/2`, gets a note and the same problem again. It counts neither way.
6. **Nothing earned is taken away.** A miss costs position in the story (a lockout, a step of
   corridor), never parts, gear or progress.
7. **Learning is never timed.** Time is measured for the report, but nothing rewards speed
   while a skill is being taught or a miss is being explained. There is one deliberate
   exception: episode 3b (below) puts mild time pressure on typed answers, to
   build speed on skills that have already been taught. Not every level works on everything.
8. **"My answer is not here" is sometimes true.** In episode 2, one door per play-through
   leaves the right answer off its list. The button always opens the keypad, so tapping it
   reveals nothing.

## The mastery rule

Kept in `story/mastery.js`, shared by every episode through one log in `localStorage`
(`story:skills:v1`). Each typed answer is a first try on fresh numbers.

| Status     | Meaning                                                                    |
| ---------- | -------------------------------------------------------------------------- |
| none       | No typed answers for this skill on this device.                            |
| practicing | Neither of the two below.                                                  |
| fluent     | The last 3 are right, or 4 of the last 5 are right, all on one day.        |
| mastered   | At least 4 of the last 5 right, and those 5 span at least 2 calendar days. |

The two-day requirement is why each episode has a chapter break with a "stop here for today".

## The episodes

| #   | Title         | Game between problems     | Skills                                                    |
| --- | ------------- | ------------------------- | --------------------------------------------------------- |
| 1   | The Vark Job  | Side-scrolling runs       | A pilot: five hand-written locks, one per gap.            |
| 2   | The Other One | Side-scrolling runs, gear | Distribute a negative; solve; simplify roots; rationalize |
| 3a  | Open House    | Corridor defence, towers  | Re-checks all four; adds fractions. Untimed.              |
| 3b  | Rush Hour     | Real-time tower defence   | The same skills again, for speed.                         |

Episode 1 is hand-written and multiple choice only. From episode 2 on, problems are generated.

### Episode 2: four floors

Each floor is one skill. A floor has a door (multiple choice) for every shape its lock can
ask, then a floor lock (typed, three right in a row; a third miss and the story moves on with
the lock recorded as not opened), then a workbench where parts buy gear for the running
sections. Chapter 2 opens with a typed re-check of chapter 1's skills.

### Episode 3: the corridor

Vark sends drones down the school corridor toward the trophy case. Each carries a brass plate
with a problem; a solved plate folds its drone up. The student's own description of what they
wanted was "that dude's math problems flying at me, and I'm gonna be like 'noo, I'll stop
you'", so the problems are the enemies, not a gate between waves of something else.

**The corridor does not run on a clock.** The drones take one step each time an answer is
entered, right or wrong. This is the whole point of the design: tower defence normally rewards
speed, and the gaps here are conceptual. With one step per answer, working on paper costs
nothing and guessing is what loses ground. The rules are in `story/game/siege.js`:

- A wave starts with a pack of drones already in the corridor, so there is a choice of target.
- A right answer removes the drone aimed at. A wrong answer gives that drone new numbers.
  Either way every other drone steps forward, and one more comes in at the far end.
- With every answer right, the front of the line never gets closer. Each miss lets the line
  take one step for good.
- A drone that reaches the case takes down one fire shutter. With none left, the wave is lost
  and is played again with a longer corridor and new numbers. Parts and towers are kept.
- The last wave ends with "the Chairman": one large drone with three plates, which steps on
  every second answer.

Towers are bought with parts at Wrench's cart and stay for the episode. They buy room to
think; they never answer anything.

| Tower         | Cost | Effect                                                             |
| ------------- | ---- | ------------------------------------------------------------------ |
| Glue mat      | 3    | A drone arriving on that locker is held there for one extra move.  |
| Gym fan       | 5    | When any plate is solved, a drone over the fan is blown back two.  |
| Spare shutter | 4    | One more drone may reach the case before the wave is lost (max 2). |

Each wave has four steps: a story brief, scouts (multiple choice, pinned under a mop bucket,
for teaching), the cart, and the wave itself (typed).

### Episode 3b: real-time tower defence

The corridor above is episode 3a ("turns" mode in the code). It is safe but does not feel like
tower defence. Episode 3b ("live" mode) is the same night with a real-time corridor, and opens
when 3a is finished. The two are one file, `story/ep3.js`, loaded twice by the menu; each has
its own saved game, and 3b carries on down the problem lists from where 3a stopped. Scouts,
wave plans, the mastery log and the report work the same way. The rules are in
`story/game/live.js`:

- Drones fly a winding path through the school in formations of three. Each formation is
  behind one brass plate, and while the plate is up nothing can hurt it.
- Tapping a formation opens its plate on the keypad. A right answer drops the shield, and the
  towers do the rest. A wrong answer makes the formation surge forward with new numbers.
- **While a plate is open the corridor runs at a quarter speed** (`TUNING.live.think`); it is
  stopped while a miss is explained and while the cart is open. So speed is rewarded, but a
  wrong answer always costs more than a slow one. `think: 0` removes the time pressure.
- Parts buy towers on six fixed spots, between waves or during one. A right answer earns a part.
- A lost wave is played again with new numbers and 3 more parts.
- The Chairman has three plates; each solved plate exposes it to a third of its damage.

| Tower         | Cost | Effect                                                             |
| ------------- | ---- | ------------------------------------------------------------------ |
| Ball launcher | 3    | Hits drones in reach whose shield is down. The only damage.        |
| Floor wax     | 3    | Drones near it move at 0.45 of normal speed.                       |
| Gym fan       | 5    | Blows each drone back, once only, so nothing can stall a wave.     |
| Spare shutter | 4    | One more drone may reach the case (max 2).                         |

Simulated share of waves lost (400 waves per cell), for a player who takes the stated time per
plate and buys only launchers. This models pace and accuracy, not a person, and wax and fans
were not simulated.

| Time per plate, share right | 10 s, 90% | 10 s, 70% | 20 s, 90% | 20 s, 70% | 35 s, 90% | 35 s, 70% |
| --------------------------- | --------- | --------- | --------- | --------- | --------- | --------- |
| Waves 1 to 3                | 0%        | 0%        | 0%        | 1 to 3%   | 0 to 2%   | 19 to 27% |
| Wave 4, with the Chairman   | 0%        | 1%        | 0%        | 4%        | 3%        | 31%       |

The report adds the median time on a right answer per skill, first half against second half
of the episode, which is the measure of whether speed is improving.

## How episode 3 adapts, and how to steer it

When a wave is reached, the game reads the status of each of the wave's skills from the log on
that device and decides what to send. This is how results from episode 2 flow into episode 3
without anyone editing anything.

| Status when the wave starts | Typed drones for that skill | Scouts first                    |
| --------------------------- | --------------------------- | ------------------------------- |
| none                        | 3                           | One per shape about to be asked |
| practicing                  | 3                           | One per shape about to be asked |
| fluent                      | 2                           | None                            |
| mastered                    | 1                           | None                            |
| new in this wave            | 4                           | One per shape, always           |

A wave is padded to at least 4 drones. With one drone to send, the game sends the hardest
shape. The last wave reviews the three weakest skills (at most two drones each) and puts one
plate from each on the Chairman.

To steer it by hand after reading a report, edit `story/episodes/siege3.js`. `ep3.js` only
follows that file.

| What the report shows                          | Change                                            |
| ---------------------------------------------- | ------------------------------------------------- |
| A skill needs more practice than it is getting | `TUNING.force = { solve: 4 }`                     |
| A skill is done and should stop coming back    | `TUNING.force = { simplify: 0 }`                  |
| Waves too tense, or not tense enough           | `TUNING.pack`, `TUNING.lane`, `TUNING.shutters`   |
| The numbers in the first table above are off   | `TUNING.review`, `TUNING.reteach`, `TUNING.fresh` |
| A wave should go, or review something else     | the `waves` list                                  |
| A new skill                                    | add a generator, then name it in a wave's `fresh` |

A wave with nothing to send is skipped, and so is a scout step with nothing to teach.

Episode 3 stays locked in the menu until episode 2 is finished on that device (a teacher's test
device is not locked), because it plans from episode 2's results.

### How hard the corridor is

A simulation of 20,000 waves per cell, at the default knobs (corridor of 6, pack of 3,
3 shutters), for a student who answers each plate right with the given probability and always
aims at the front drone. Each cell is the share of waves lost.

| Wave                | Towers       | 50% right | 60% | 70%  | 80%  | 90% |
| ------------------- | ------------ | --------- | --- | ---- | ---- | --- |
| 4 drones            | none         | 6%        | 2%  | 0.3% | 0%   | 0%  |
| 6 drones            | none         | 25%       | 10% | 2%   | 0.4% | 0%  |
| 6 drones            | glue and fan | 14%       | 4%  | 0.7% | 0.1% | 0%  |
| 6 drones + Chairman | none         | 31%       | 12% | 3%   | 0.3% | 0%  |
| 6 drones + Chairman | glue and fan | 17%       | 5%  | 0.9% | 0.1% | 0%  |

So the corridor is gentle on purpose: a student getting 7 in 10 right sees drones get close but
almost never loses a wave, and it only bites below 6 in 10. Towers cut losses about threefold.
A lost wave means redoing its typed problems, which is the right consequence at 5 in 10 and
too much at 8 in 10. If it turns out to feel toothless, `TUNING.pack = 4` or `TUNING.lane = 5`
are the first things to try; neither has been simulated.

## Anatomy of a generated problem

`story/episodes/heist2-skills.js` and `siege3-skills.js`. A skill has a few "forms" (shapes of
problem). Each form has a fixed, shuffled list of number sets, so problem `n` of a form is the
same on every device and the tests can check every one. Episode 2 deals from the front of each
list and episode 3 from the back, so numbers are not repeated between them.

A problem carries: the question; the right answer; wrong options, each with its slip named and
the guessed working that leads to it; the working done correctly; a typed-answer template
(boxes filled from an on-screen keypad); and a `grade` function that returns right, wrong
(with the matching slip if the typed value is a known one), or "right value, not finished".

## Time

`visibleMs()` in `mastery.js` counts only while the page is on screen. The report gives
on-screen time per chapter and per typed answer, and flags any single answer over three
minutes as "probably away". Time is reported, never scored.

## The report

The last screen of an episode shows a plain-text report and sends it to `feedback.php`, which
writes it to a folder beside the web root where the web server cannot serve it. It is also
sent after each miss and each wave or lock, so a play-through that is abandoned still leaves a
record. It contains every typed answer in order, the student's notes, the status of each skill,
and the debrief answers.

Opening `/teacher/` once on a device marks it, so reports from that device are labelled as test
runs by a teacher.

## Saved games

All state is JSON in `localStorage`, one key per episode. Each step of an episode has a name
that does not change when steps are added or moved, and a save stores the name, so a later
version of an episode reopens an old save at the right place. A wave in progress is plain data
and is saved whole.

## Tests, and pictures of every screen

`node --test story/test/` covers: every generated problem against arithmetic done
independently in the test; the corridor rules; the wave plan for different histories; a full
play-through of each episode against a minimal fake page; and saved games.

`story/test/shots.sh` saves a picture of every screen using headless Chrome. The screens are
listed by `previews()` inside each episode file and drawn by the real render code. A test fails
if a kind of screen exists without a preview, or if drawing a preview saves or sends anything,
so the pictures cannot drift from the game.

## Known limits

- **One solution route.** The guessed wrong working assumes one way of doing each problem. A
  student who took another route will answer "No, I did something else"; that answer is the
  data that would justify adding routes.
- **Episode 3's balance is untested on a person**, in both modes. See the simulation tables.
- **Episode 3b asks the same kind of problems as 3a.** They are paper-and-pencil sized. Speed
  drills would be better served by one-step problems (`-(2x - 5)`, `sqrt(72)`), which do not
  exist yet as their own forms.
- **Episode 1 has no screen previews.**
- **Shared code is partly duplicated.** `ep2.js` and `ep3.js` each carry their own copy of the
  save, timing and report plumbing.
- **"Not here" and the literature.** Studies of "none of the above" as a correct option find
  it removes the learning benefit of a quiz item. Those studies end the item at the button;
  this game asks for the answer and then shows the working. That the difference avoids the
  harm is an inference, not something those studies tested.

## Not built yet

- Exponents and factoring, the two listed gaps no episode covers.
- Episode 4. The story points at a public Math Bowl against Vark's team.
