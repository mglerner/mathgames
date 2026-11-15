# KEYSTONE DEEP -- design spec v2 (build document, revised after referee report)

Working title only; run a trademark / app-store search before shipping. All in-game names below are original to this project.

Items I have NOT verified:
- The standard codes' sub-letters.
- The iOS behaviours this revision relies on, all taken from the referee report or the inputs and not tested on a device: the home-screen PWA (Progressive Web App) storage exemption and eviction behaviour, `registration.update()` on resume, `fetch` with `keepalive`, the ring switch silencing WebAudio, and the separate storage container for home-screen apps.
- Whether Dreamhost shared hosting honours `Header set Cache-Control` in `.htaccess` (mod_headers). M3 must test it on staging.
- Whether the repo has a GitHub remote. The working directory is not a git repo, so M0 starts with `git init`.
- The success-probability priors in section 6 are guesses to be tuned from the student's data.
- The revised schedule (section 6) was checked by hand arithmetic only. Best case, a skill is mastered 7 days after it is introduced, and the deepest prerequisite chain is 11 levels. Whether an 80%-accurate student reaches the Gate by day 65 is NOT established; the M2 planner simulation is the test. If it fails, the parameters change, not the test.

## 1. Pitch and pillars

You are a Keeper descending the Deep, a vault where everything is made of expressions and equations ("Knots"). You carry two instruments: the Lantern, which reads the true value of any form (a substitution check), and the Scale, which shows whether two sides still balance. Swords do nothing. The only thing that works is a legal move: one that changes a Knot's form without changing its value (expressions) or its solution set (equations). An illegal move does not hurt you; the Knot mutates into a different creature, and the Lantern shows, with real numbers, that it is no longer the one you were fighting. A run is 10 Knots (about 8 minutes), untimed, one thumb.

Base and grafts:
- The pedagogy core is story-and-mastery: the visible invariant, the form of 1 they choose, the Truth Trace, representation fading.
- The interaction frame is moves-as-verbs: tap-only cards and a keypad Predict.
- Agency comes from run-and-build: door forks and a small charm layer. Grading is per interaction (section 3): move-choosing accepts any legal move; a stated move has exactly one correct result.

Pillars:
1. The legal move is the verb. No damage without a math action; no math-as-toll-gate.
2. Equivalence is visible. Same value (expressions) and same solution set (equations) are named as two different invariants, and each is shown with exact numbers after every commit.
3. They choose the 1 and the 0. The clever choice is theirs, never handed to them.
4. Wrong answers are data, not damage. A miss names a specific bug, shows a counterexample, and hands them a fresh sibling item. Nothing they have banked (shards, trophies, mastery marks, lit map tiles) is ever taken away. Scheduling state (boxes, fade levels) is internal, moves both ways, and is never shown to them.
5. Every item is generated, exactly checked, and diagnosable, or it does not ship.
6. Classroom vocabulary rides along. Every in-world name is shown with its standard term beside it (section 9), because in January they need the words their teacher uses.

## 2. Core loop and session structure

Portrait, `100dvh`. The Knot and its math fill the top 45%, the instrument (Scale or Lantern) has the middle 15%, and all input is in the bottom 40%, padded by `env(safe-area-inset-bottom)`. Nothing is timed. Enemies never act while they think.

A run ends by item count, never by the clock: 10 planned Knots plus at most 3 Echoes, which is 14-18 math actions and typically 6-9 minutes. If their median run exceeds 10 minutes over 3 sessions, the planner drops to 9 Knots, then 8.

1. Camp. Shows the map, today's Haunt bounty if any, "backed up N min ago", the build hash, and one "Descend" button.
2. Warm-up: 1 Knot, the most winnable due item (section 6 gives the cold-start fallback).
3. Door fork 1, then Room A: 2 Knots. Two doors with room-type icons, one tap. The planner has already assigned skills to both doors; they choose the room TYPE, never the skill.
4. Room B: 2 Knots.
5. Door fork 2, then Room C: 2 Knots.
6. Room D: 1 Knot.
7. Boss or Vault: 1 multi-step Knot. A Boss appears only when a cluster is eligible (section 8); otherwise the Vault.
8. Closer: 1 Knot, the highest predicted success available. If they miss it, an easier one is served until one is won.
9. Haul. Shows shards, map tiles lit, Haunt progress, and a Codex card if earned.

Room contents come from due skills and queued repairs. Each Knot takes 1-4 actions.

Training Room: when a skill unlocks, one 2-Knot room is replaced by a worked example with its last step blanked, then a blocked burst of 2-4 items that ends on a constructed response.

Charting (replaces the separate diagnostic sessions): for the first sessions after each content drop, up to 2 Knots per run are Charting probes, drawn as fogged Knots. They are ordinary items with real feedback, on skills they have not unlocked yet. Section 6 gives the placement rules. There is no feedback-free test anywhere in the game.

Non-math screens are capped at 15% of session time; math-actions-per-minute is logged and shown in the teacher view.

Live controller, on the session's first-try rate (Charting probes excluded):
- Below 65% after 6 or more items: the next room becomes a higher-box review and the fade level drops one step.
- Above 90% over 6 items: one room is swapped for a harder variant.
- Three wrong taps under 2 seconds each: the next room is a scaffolded Training Room. No penalty is shown.

## 3. Interaction types (final list: 8)

Rules that apply to all eight:
- Judging is exact (section 11), and the rule differs by interaction:
  - I1 and I8 judge against the invariant: any legal move, or any complete and correctly formed final answer, is accepted. An intended path is never matched.
  - I2 and I3 judge against the stated move: the response must be the result of THAT move. Retyping the original line fails, and so does jumping ahead to x = 3.
- "Constructed response" means they produced the answer rather than picked it: I3, I8, typed I4, and an I6 repair. Only constructed responses move boxes or count as mastery evidence (section 6).
- The Lantern or Scale reading appears only AFTER commit, never live.
- Probe values come from {2, 3, -1, 5, -2}, never 0 or 1, except the scripted beat in I5. Items with a declared x >= 0 use {2, 3, 5}, or {4, 9} where a clean root helps.
- Feedback has four beats:
  1. Name the move they made, in 15 words or fewer.
  2. Lantern or Scale numbers.
  3. A "why?" expander: one sentence plus the representation.
  4. An Echo: a fresh sibling item (new seed, same generator) within 2 rooms. The same item is never repeated.
- Card text is a short chip in uniform grammar. No chip, option or evidence line names a bug.

**I1 Cast (choose a move).** Never promotes a box; it is a choice.
- Shown: an equation on the Scale and 4 chips, all of the form "[op] [operand] to both sides" (e.g. "- (6 + 4x)", "- 2x^2", "/ 2", "/ x"). Chips are drawn from the generator's finite chip alphabet (below).
- Does: taps one chip.
- Four verdicts:
  - Progress: legal, and the distance to solved form drops.
  - Legal, no progress: the solution set is unchanged but nothing is gained. The Scale stays level, and the caption reads "Legal. Not closer." Pays no shards.
  - Risky: any multiply or divide by an expression containing a variable that is not declared nonzero. The caption is always "Risky: only safe if x is not 0" (with the actual expression named). The move is refused and the Knot does not change. This verdict does not depend on the roots of the particular equation: "/ x" on 6 + 4x = 2x^2 is Risky even though 0 happens not to be a root, because they cannot know that in advance. In generators built for one-way moves ("/ x" on x^2 = 3x loses 0; "x x" on x = 2 adds 0), the Scale also runs the lost or added root through both lines, and the attempt is a tagged miss (mal-rule 12). Elsewhere Risky is a caution, not a miss.
  - Illegal: the solution set changed for a reason other than a possibly-zero factor ("x 0"). The Knot mutates and glows red.
- Legality tests, both exact:
  - L1 - R1 = m x (L0 - R0), where m is a nonzero rational times integer powers of declared-nonzero symbols. This is checked as a polynomial identity after cross-multiplying. It is sufficient for Legal.
  - A root-set comparison in Q(sqrt n) for the one-way generators.
- Chip alphabet and distance: every multi-step generator declares a finite `alphabet(state)` of at most 12 moves per state. Distance to solved form is found by breadth-first search (BFS) over canonicalized states to depth 6, with a node cap. The generator rejects any seed with no path within 6. Every displayed chip's verdict and distance come from this search.
- Consequence of Progress: the Knot sheds a layer and the new line appears.
- Teaches "many moves are legal; some are useful; multiplying or dividing by something that might be 0 is never free".
- Skills: balance-moves, solve-linear, clear-fractions, literal-equations, quadratic-to-standard, zero-product.
- v1 restrictions: clear-fractions uses numeric LCDs (least common denominators) only. literal-equations divides only by symbols the item declares nonzero, and the declaration is printed on the item ("l is not 0").

**I2 Next Line (choose the result).** Never promotes a box.
- Shown: a stated move ("Subtract 5 from both sides of 3x + 5 = 11") and 3-4 candidate resulting lines.
- The wrong candidates are mal-rule outputs, checked pairwise non-equivalent. (A mal-rule is an executable model of one specific wrong procedure; section 5.)
- Judged side-wise: a candidate L = R is correct when L equals op(L0) and R equals op(R0) as expressions, or the same with the sides swapped. So 0 = 2x^2 - 4x - 6 and 2x^2 - 4x - 6 = 0 are both correct results of "subtract 6 + 4x from both sides" of 6 + 4x = 2x^2. A wrong pick maps to its mal-rule tag.
- For expression moves ("Multiply: 4 x 1/3", "Distribute"), the candidate must equal the true result in value and satisfy the move's form predicate.
- Because candidates are lines, not descriptions, wording cannot leak the answer.
- This is where one-sided and transposition bugs are detected.
- Skills: frac-times-whole, distribute, combine-like-terms, balance-moves, solve-linear, quadratic-to-standard, poly-add-sub, exponent rules.

**I3 Predict (keypad result).** A constructed response.
- Follows about 1 in 3 Casts and all Forge moves at fade level 2+.
- Shown: the move just chosen. Does: types the resulting line or expression.
- Judged: parsed, then:
  - Equations: side-wise, exactly as I2 (side swap allowed).
  - Expressions: value equivalence to the move's result, then the move's form predicate ("the move has been applied").
- Verdicts: correct / "same value, not finished" (not a miss; names what is left, e.g. "8 still hides a square" or "the move has not been applied yet") / wrong (mal-rule match or unclassified) / unparsed (not an attempt).
- Skills: all.

**I4 Forge (choose the 1 or the 0).** Tap-only, no drag. The typed form is a constructed response; the offered-faces form is not.
- Shown: an expression, a goal ("no root in the denominator", "denominator 21", "make a perfect square"), and 3-4 options. Options are forms of 1 (sqrt(3)/sqrt(3), sqrt(3)/1, 1/sqrt(3), 3/3) or forms of 0, called zero-pairs (+9 - 9, +9, +3 - 3, +36 - 36).
- Does: taps an option, then commits.
- Judged:
  - The option must equal 1 (or 0), exactly. Otherwise it is illegal, and the Lantern reading jumps (6/sqrt(3) x sqrt(3)/1: 3.46 -> 6).
  - An option that equals 1 but does not reach the goal (3/3) gets "Legal. Not closer."
- Fade:
  - Options offered.
  - They type the form into "x [ ]/[ ]" or "+ [ ] - [ ]" outlines labelled "x 1" and "+ 0".
  - Symbols only, via I3.
- Named variants:
  - frac-times-whole: "Write 4 as a fraction with the same value" (4/1, 4/4, 1/4), then multiply across.
  - rational-exponents: "Which power makes (9^?)^2 = 9^1?" with options 1/2, 2, 1, -1. The Lantern shows (9^p)^2 against 9: 9, 6561, 81, 1/81.
  - sqrt-squared: "sqrt(?) x sqrt(?) = 5".
- Skills: frac-equivalence, frac-times-whole, identity-moves, frac-add-sub, sqrt-squared, rationalize-denominator, rational-exponents, complete-square.

**I5 Twin Check (same value, different form?).** Never promotes a box.
- Shown: two forms. Does: taps Same or Different.
- If they tap Different: a +/- stepper picks a witness x, and they commit. (Numeric pairs have no stepper; they type both values.)
  - A real witness: the Lantern shows two different numbers and the false twin shatters.
  - x = 0 on (x+3)^2 vs x^2 + 9: "9 and 9. One agreement proves nothing. Try another." This is not a miss.
- If they tap Same, they must then connect the forms, and "Same" is not correct until they do:
  - Where a form of 1 or 0 connects them (3/4 and 15/20; x^2 + 6x and x^2 + 6x + 9 - 9), they pick it at fade 0-1 and type it at fade 2+.
  - Where no single 1 or 0 does (2(x + 3) and 2x + 6; sqrt(4 x 9) and sqrt(4) x sqrt(9)), they type the common value at a probe the game picks, or the value itself for numeric pairs.
- If they tap Same on a non-equivalent pair: the Lantern picks the witness.
- If they tap Different on an equivalent pair: after 3 steppers with no split, "No witness exists. Same value, different form." That tags form-change-changes-value.
- The pool is about 50% equivalent pairs.
- Named radical pairs, numeric, shipped in the slice:
  - sqrt(4 x 9) vs sqrt(4) x sqrt(9): 6 and 6, same.
  - sqrt(9 + 16) vs sqrt(9) + sqrt(16): 5 and 7, different (mal-rule 15).
- Judged by `equiv()` (section 11): polynomials and rational functions by exact polynomial identity; radicals and rational powers by normal form.
- Skills: equivalent-expressions and every expression skill. Equation pairs ("same solutions?") are used from balance-moves onward.

**I6 Trace (find the bad line).** The find step never promotes; the repair step is a constructed response.
- Shown: a 3-5 line worked solution. About 1 in 3 are fully correct, and "No bad line" is a choice.
- Does: taps a line, then backs it with numbers only. The game gives the true root; the student supplies the left and right values of the tapped line at that root (picked from number chips at fade 0-1, typed at fade 2+). Unequal values confirm the bad line. There are no reason chips.
- If they are wrong or unsure, the Truth Trace runs: each true root goes down the lines, each line lights if it balances, and the first dark line is the bad move.
- Generators rejection-sample the bad line so that it really changes the solution set. A wrong step that happens to keep the full root set is never used, because the Truth Trace could not expose it. With several roots, every root is traced, so a lost root shows up.
- Each step's legality is machine-verified by the generator.
- Skills: solve-linear, distribute, clear-fractions, quadratic-to-standard, later all.

**I7 Why.** Follows about 1 in 4 actions, weighted to new and recently missed skills. Three forms, no bare 4-option menu:
- "Tap the hidden 1 / hidden 0" in a rendered worked step. Tap targets are engine-chosen sub-expressions, 48px minimum. Counts toward mastery.
- Repair a bad line from I6 via the keypad. Counts toward mastery.
- "Which invariant?": value or solution set, plus the move chip that was used. This is a reflection prompt only. It is binary and guessable, so it counts for nothing and pays nothing.

A wrong Why costs nothing and shows the answer. One correct counting Why per skill is required for mastery. `audit.js` fails any skill that has no counting Why form.

**I8 Strike (plain compute, keypad).** A constructed response.
- Shown: "Solve", "Simplify", "Evaluate", "Rewrite as ... = 0", or "Fill the blank". Does: types the answer.
- Judged against the invariant plus form predicates:
  - Solution sets must be complete: a missing root tags lost-root, and extra roots are wrong.
  - Rewriting tasks: L - R must be a nonzero rational multiple of L0 - R0, and the form predicate must hold (one side is 0, the other in descending order). Either side may be the zero side.
- Variants:
  - Fill the blank: "3 + 4 = [ ] + 2". This is the detector for equals-as-operator.
  - Read a, b, c: "0 = 2x^2 - 4x - 6: type a, b, c". Any (ka, kb, kc) with k a nonzero rational is accepted; if k is not 1, the note reads "that is a, b, c of an equivalent equation".
- Used for boss finishers, mastery evidence and fluency.
- Skills: all.

Quick-cast: once a skill is mastered, its routine steps inside longer chains (e.g. "subtract 5 from both sides") auto-fire with a flash. This makes fading read as power. It never applies to items scheduled as evidence for that skill.

## 4. Skill graph v1 (40 skills + 1 stretch = 41 entries)

This is the one count used everywhere in this document: 40 A-priority skills, 1 B-priority stretch skill, 12 of them in the first slice.

Cut from the 48-skill map:
- sci-notation, rational-irrational, graph-families, exponential-basics, linear-inequalities, write-equation, expression-structure.
- linear-special-cases, which is folded into solve-linear difficulty 4.

Added since v1: sqrt-squared.

Honest limit: 40 skills at 3 evidence days each is still a ceiling for about 46 sessions. Charting should place several at box 3, the Gate needs 100 of the 120 possible evidence points rather than all of them (section 8), and the readiness metric (section 10) reports where the student really is.

Format: number. id -- description (pre: prerequisites) priority. [S] = ships in the first slice.

Zone 1, the Mint (value and its forms; number line first, fraction bars as a secondary view):
1. frac-equivalence [S] -- a/b = ka/kb because k/k = 1 (pre: none) A
2. frac-times-whole [S] -- n x a/b = na/b; n is n/1 (pre: 1) A
3. identity-moves [S] -- x 1 and + 0 change form, not value (pre: 1) A
4. frac-add-sub -- common denominator via chosen 1s (pre: 1, 3) A
5. frac-mult-div -- multiply; divide = times reciprocal (pre: 2) A
6. signed-arith -- signed rationals (pre: 4) A
7. order-of-ops -- precedence; exponent binds to base only (pre: 6) A

Zone 2, the Scales (expressions and linear equations; balance, area strip):
8. equivalent-expressions [S] -- equal for every x; one witness disproves (pre: 3) A
9. distribute [S] -- a(b+c), including negative and fractional a (pre: 8) A
10. combine-like-terms (pre: 9) A
11. factor-gcf -- distribution backward; GCF = greatest common factor (pre: 9) A
12. solution-meaning [S] -- a solution makes both sides equal; = is a balance; check by substitution (pre: none) A
13. balance-moves [S] -- same invertible operation on both sides keeps solutions; one-way moves do not (pre: 12, 3) A
14. solve-linear [S] -- variables on both sides; at d4, no-solution and all-reals cases (pre: 13, 9) A
15. clear-fractions -- multiply both sides by a numeric LCD (pre: 14, 4) A
16. literal-equations -- solve a formula for a named variable; divisors declared nonzero (pre: 14) A

Zone 3, Stacks and Roots (block towers; a square plot whose side is sqrt(area)):
17. exp-meaning (pre: 7) A
18. exp-product-quotient (pre: 17) A
19. exp-power-rules -- includes (a+b)^n is not a^n + b^n (pre: 18) A
20. exp-zero-negative (pre: 18) A
21. sqrt-squared [S] -- sqrt(n) is the number whose square is n; sqrt(n) x sqrt(n) = n (pre: 3) A
22. square-roots -- sqrt is the nonnegative root; x^2 = p gives two (pre: 17) A
23. sqrt-product-rule [S at d1] -- sqrt(ab) = sqrt(a) x sqrt(b) for a, b >= 0; no such rule for sums (pre: 22, 19) A
24. simplify-radicals (pre: 23) A
25. rationalize-denominator [S at d1] (pre: 24, 3, 21) A
26. rational-exponents -- a^(1/2) is the number whose square is a (pre: 18, 22) A

Zone 4, the Arch (polynomials and quadratics; area tiles, balance, zero-pair):
27. poly-add-sub (pre: 10) A
28. poly-multiply (pre: 9, 18) A
29. factor-monic (pre: 28, 11) A
30. factor-special (pre: 29) A
31. factor-nonmonic (pre: 29) A
32. quadratic-to-standard [S at d1-2] -- either side may be the zero side (pre: 13, 27) A
33. zero-product (pre: 29, 32) A
34. sqrt-method (pre: 22, 24) A
35. complete-square (pre: 34, 30, 3) A
36. quadratic-formula -- includes reading a, b, c from the "0 =" form (pre: 32, 24) A

Zone 5, the Ridge (slope triangles on a grid):
37. function-notation (pre: 7, 9) A
38. slope-meaning (pre: 6, 5) A
39. linear-forms (pre: 38, 16) A
40. graph-is-solutions (pre: 12, 37) A
41. systems-linear -- STRETCH (pre: 14, 13) B

Slice deviations from the graph, all deliberate. The full prerequisites apply above the stated difficulty.
- rationalize-denominator d1 is k/sqrt(n) with n squarefree, gated on identity-moves and sqrt-squared. It no longer silently assumes sqrt(3) x sqrt(3) = 3; that fact is skill 21, taught first.
- sqrt-product-rule d1 is numeric with perfect-square factors only (the two named Twin pairs in I5 and their siblings), gated on sqrt-squared.
- quadratic-to-standard d1-2 moves terms only (no products to expand), gated on balance-moves. d1-2 uses integer-root equations only, so the Scale can show a clean root: 6 + 4x = 2x^2 has roots 3 and -1. The teacher's 4 + 4x = 2x^2 has roots 1 +- sqrt(3) and appears from d3, where the Scale shows the gap L - R at a probe value instead (section 7).

This puts all three of the teacher's examples, plus sqrt(a x b), in the first two weeks.

Implementation order:
1. Proto slice (M0.5): 2, 21, 25(d1), 32(d1).
2. Remaining slice skills: 1, 3, 8, 9, 12, 13, 14, 23(d1), 32(d2).
3. The rest of the Mint and Scales (4-7, 10, 11, 15, 16) and Stacks and Roots (17-20, 22-26), built in parallel. Radicals and exponents are not behind the linear material.
4. The Arch: 27-36.
5. The Ridge: 37-40, then 41.

Zones are palettes and motifs, not walls. The Scale, the Lantern and the form of 1 appear in every zone.

## 5. Misconception list v1 (19 mal-rules)

Each entry is an executable mal-rule in its own file, `src/misc/malrules/<id>.js`, which also carries its Haunt name, standard term and script. There is no shared catalogue file.

Status rules:
- 1 hit: "suspected".
- 2 hits on separating items, on 2 different items: "active", and it spawns a Haunt.
- 2 or more mal-rules matching one answer: `ambiguous`, never tagged to one.
- No match: "unclassified", logged raw.

Format: id (Haunt name = the standard term shown beside it). The script is the 15-word line; the numbers follow.

1. equals-as-operator (the Announcer = "reads = as 'the answer comes next'")
   - Detect: on the I8 fill-the-blank a + b = [ ] + c, the answer is a + b.
   - Script: "The = is a balance, not 'answer next'." 3 + 4 = 7 + 2? 7 vs 9.
2. form-change-changes-value (the Stranger = "thinks a new form is a new value")
   - Detect: "Different" on an equivalent Twin pair, 2 times.
   - Script: "No witness exists. Two forms, one value." Both dots land on the same point (6/9 and 2/3 at 0.667).
3. one-sided-operation (the Lopsider = "operated on one side only")
   - Detect: the answer solves the equation with the operation applied to one side only (x/3 = 5 -> 5).
   - Script: "You changed one side only." 5/3 vs 5.
4. one-part-coin (the Half-Coin = "multiplied only one part of the fraction")
   - Detect: the form of 1 was applied to the numerator only or the denominator only (6/sqrt(3) -> 6, or -> 2).
   - Script: "That multiplier was not worth 1." 3.46 vs 2.00.
5. scalar-times-both-parts (the Stacker = "multiplied numerator and denominator by the whole number")
   - Detect: the answer to n x a/b has the value a/b.
   - Script: "4/12 is still 1/3. You multiplied by 4/4. Nothing moved." Then the number line: four jumps of 1/3 land on 4/3.
6. partial-distribution (the Half-Hand = "distributed to the first term only")
   - Detect: ax + c for a(x + c).
   - Script: "The 3 reached x, not the 4." 3(x + 4) at x = 2: 18 vs 10. An area strip draws both pieces.
7. neg-distribution (the Sign-Thief = "dropped the negative on a later term")
   - Detect: the sign of the second term is unchanged.
   - Script: "The minus reached the first term only." -3(2x - 5) at x = 2: 3 vs -27.
8. transpose-no-sign-change (the Carrier = "moved a term across without changing its sign")
   - Detect: the solution, or the rearranged line, with the moved term's sign kept (x + 5 = 12 -> 17).
   - Script: "You carried 5 across. Subtract it from both sides." 22 vs 12.
9. transpose-coefficient-as-subtract (the Peeler = "subtracted a coefficient instead of dividing")
   - Detect: c - a for ax = c.
   - Script: "3 multiplies x. Undo with division." 3x = 12 at x = 9: 27 vs 12.
10. divide-one-term (the Slicer = "divided only one term of a side")
    - Detect: the solution of x + c = d/a.
    - Script: "Divide the whole side, every term." 2x + 6 = 10 -> x + 6 = 5; at the root x = 2: 8 vs 5.
11. copy-coefficients (the Copyist = "read a, b, c before one side was 0")
    - Detect: the answer is not a nonzero multiple of the true standard form, and it matches the coefficients read straight off the unrearranged equation, with or without sign flips.
    - Script: "You copied coefficients. Subtract a whole side instead." 6 + 4x = 2x^2 at the root x = 3: 18 = 18; their 2x^2 + 4x + 6 gives 36, not 0.
    - This is NOT triggered by keeping x^2 on the right. 0 = 2x^2 - 4x - 6 is correct and is accepted everywhere. The Training Room says so in words: "Either side may be the zero side."
12. divide-by-variable-loses-root (the Lost Root = "divided by an expression that could be 0")
    - Detect: a "/ x" cast in a one-way generator, or a root set missing 0, on x^2 = kx.
    - Script: "Dividing by x deleted x = 0." 0 = 0 in the original.
13. freshmans-dream-square (the Spreader = "squared a sum term by term")
    - Detect: a^2 + b^2 for (a + b)^2, or "Same" on that Twin pair.
    - Script: "A square of side x+3 has four pieces." x = 2: 25 vs 13.
14. cancel-across-sum (the Crosser = "cancelled a term instead of a factor")
    - Detect: the cancelled-term form.
    - Script: "Cancel factors, not terms." (x+6)/3 vs x+2 at x = 3: 3 vs 5.
15. sqrt-splits-sum (the Splitter = "took the square root of a sum term by term")
    - Detect: sqrt(a) + sqrt(b) for sqrt(a + b), or "Same" on that Twin pair.
    - Script: "Roots split products, not sums." sqrt(9 + 16): 5 vs 7. Check by squaring: 7 x 7 = 49, not 25.
16. half-power-is-half (the Halver = "read the 1/2 power, or the square root, as 'half of'")
    - Detect: a/2 for a^(1/2) or for sqrt(a).
    - Script: "The 1/2 power is the number whose square is 9." 4.5 x 4.5 = 20.25, not 9; 3 x 3 = 9.
17. sqrt-product-misapplied (the Smuggler = "moved a factor across the radical without rooting or squaring it")
    - Detect: sqrt(12) -> 4 sqrt(3) (the factor left un-rooted), or 2 sqrt(3) -> sqrt(6) (the factor entered un-squared).
    - Script: "A 4 inside leaves as sqrt(4) = 2." Check by squaring: (4 sqrt(3))^2 = 48, not 12. About 6.93 vs 3.46.
18. root-square-overshoot (the Overshoot = "squared the radicand instead of undoing the root")
    - Detect: n^2 for sqrt(n) x sqrt(n) or (sqrt(n))^2.
    - Script: "sqrt(3) is the number whose square is 3." 3 vs 9; a square plot of area 3 has side sqrt(3).
19. scalar-into-denominator (the Sinker = "multiplied the denominator by the whole number")
    - Detect: a/(nb) for n x a/b (4 x 1/3 -> 1/12).
    - Script: "4 is 4/1. It multiplies the numerator." Four jumps of 1/3 land on 4/3; 1/12 is less than one jump.

Mal-rules 15-19 are new in this revision. I recomputed their numbers by hand; nothing has been machine-checked yet.

`audit.js` fails if any of these 19 lacks a generator that separates it from every other mal-rule on that generator.

## 6. Learner model

State is derived by replaying the event log through one pure reducer (`learner/model.js`). The same code runs in the game and in the teacher view.

Scheduler:
- Leitner boxes 0-4 per skill (a Leitner box is a spaced-repetition level: a higher box means a longer wait before the next review), with intervals of 0/1/2/4/8 days.
- Boxes move only on constructed responses (I3, I8, typed I4, I6 repair).
  - The first constructed response on a skill in a session, if fresh, hint-free and first-try, moves it up one box. It moves at most one box per session.
  - The first missed constructed response in a session drops it one box (floor 0). Further misses that session do not drop it again.
- A miss on a choice item (I1, I2, I5, offered-face I4, I6 find) moves no box. It queues an Echo, queues the repair generator if tagged, and drops the fade level one step.
- Boxes and fade levels are never displayed to them.

Fade level per skill (0-3): box 0 -> 0, box 1 -> 1, box 2 -> 2, box 3+ -> 3. It drops one on a miss or on a controller trigger.

Evidence, decoupled from the box:
- An evidence item is a fresh item served symbol-only (fade level 3 is forced whatever the skill's current fade level), as a constructed response, to a skill at box 2 or higher.
- An evidence day is a day with a first-try, hint-free correct evidence item on that skill. Each one is an evidence point (EP), at most 3 per skill.
- Evidence days for one skill must be at least 2 days apart.
- The planner serves an evidence item when the skill is due, and also ahead of the due date when the run has room and the 2-day gap has passed.
- "3 in a row in one session" counts as one day.

Mastery (a separate flag; the mark is never removed, but the state shown can become "decaying"):
- 3 evidence days.
- At least one of them in a mixed room or a boss.
- At least one of them an I8 Strike on a whole problem.
- One correct counting Why (hidden 1/0 tap, or a repair).

Best-case timeline for one skill: day 0 introduced, box 1; day 1 box 2; evidence on days 3, 5 and 7. This trades some spacing rigor for reachability. The backstops are the 8-day reviews at box 4, the decay watch, and the Gate itself.

Skill states:
- unseen
- learning
- due
- mastered
- decaying (mastered and overdue by more than 2 intervals, or missed since mastery). Shown to them as "due for a check", never as a loss.

Session planner:
- Predicted first-try success for an item is base[box] + fade adjustment + difficulty adjustment, clamped to 0.30-0.97. All guesses, replaced by the student's observed rates after 30 attempts per cell:
  - base by box 0-4, for a symbol-only d2 item: 0.50, 0.60, 0.70, 0.80, 0.88
  - fade level 0 / 1 / 2 / 3: +0.25, +0.15, +0.07, 0
  - difficulty d1 / d2 / d3 / d4: +0.05, 0, -0.07, -0.14
- So a box 0 item at d1 with full visuals predicts 0.80, and a first-ever run can average 0.80.
- Fill the run to a mean predicted first-try rate of 0.80, Charting probes excluded. If no fill reaches 0.78, take the best available and log "below band".
- Order of precedence: warm-up; queued repairs; one reserved Training Room for the run's first new skill; focus-cluster skills short of 2 evidence days (the focus cluster is the first cluster in section 8 order whose Warden is not yet eligible); due skills, most overdue first relative to their interval; early evidence items; a second new skill if room; the closer. (Revised 2026-11-13: the original order starved new skills for about 30 days and left the Warden waiting on a random straggler; see the header of `src/session/planner.js`.)
- Warm-up and closer: the item with the highest predicted success among box 3+ skills. Cold-start fallback when there is none: the highest box that exists, at its lowest difficulty, one fade step easier than the skill's current level. On the very first run that is a d1 item of a skill with no prerequisites, with full visuals. Warm-up and closer items are never evidence items.
- New skills: at most 1 per run, and only if the first-try rate over the last 2 sessions was 70% or higher. This rises to 2 per run when that rate is 80% or higher and no more than 6 skills sit at box 0-1.
- A new skill unlocks when its prerequisites are at box 1 or higher.
- Interleave: no two consecutive rooms share a skill, outside Training Rooms. Each run draws from at least 2 zones once 2 exist.
- Interaction choice per item:
  - Box 0-1: I4, I2, I5 with visuals, and the session's first item on the skill (or the last item of a Training Room burst) is a constructed response with visuals present: typed I4 or I3.
  - Box 2: adds I3, I6 and evidence items.
  - Box 3+: I8 and I3 dominate.
  - Choice items never exceed 50% of a run.

Charting (placement, folded into normal play):
- Up to 2 fogged Knots per run, until every shipped skill is either placed or unlocked. It restarts for new skills after each content drop. There is no separate diagnostic session.
- A probe is a symbol-only I8 on a skill they have not unlocked. It starts at solve-linear and distribute; when the zones exist, also exp-product-quotient and sqrt-product-rule.
- There is no score, no percent and no timer. Feedback is real: beats 1 and 2 always, and on a miss the line "This room opens later." No Haunt spawns from a probe.
- Correct, first try: the skill goes to box 3 with one evidence day. Its untested prerequisites go to box 2 "inferred", with no evidence. Their first item is then an evidence item; a miss sends that skill to box 1 and normal teaching.
- Miss: the skill stays unseen, and the next probe goes one prerequisite down. A branch closes after 2 misses.
- Two probes are pairs (an I8 compute plus an I5 Twin): frac-times-whole and rationalize-denominator. Each pair reports "procedure / why / both / neither".
- Every wrong answer is run through the mal-rules and logged as "suspected (charting)".
- Output: a box per skill, suspected bugs, and a starting fade level.

Season logic (tiers, EP totals, Warden and Gate eligibility; section 8) lives in `learner/season.js` and is derived by the same reducer.

## 7. Feedback and teaching the WHY

The game says two sentences constantly, and the code enforces them:
- "Expressions: a legal move keeps the VALUE."
- "Equations: a legal move keeps the SOLUTIONS."

The Lantern checks the first by putting a number into both forms. The Scale checks the second by putting a root into both lines. When the roots are not rational (4 + 4x = 2x^2), the Scale instead shows the gap L - R at a probe value: an add-or-subtract-both-sides move leaves that gap unchanged at every probe, up to sign if the sides swap. Example at x = 2: the original has a gap of 4; the correct 0 = 2x^2 - 4x - 4 has a gap of 4; the copied 2x^2 + 4x + 4 = 0 has a gap of 20. The gap display is used only for add/subtract steps, because a multiply or divide scales the gap.

Teaching devices:
- Form of 1: a coin whose face they pick, then types. The check is always "did the Lantern reading stay put?" They meet the same coin in fractions (3/4 = 15/20), in common denominators, in rationalizing (sqrt(2)/sqrt(2)) and in clearing fractions. One object across four topics is the point.
- Form of 0: a zero-pair (+9 - 9) that appears and annihilates. It is used for subtraction-as-adding-the-opposite, for completing the square, and for "moving a term". Moving a term IS adding a zero-pair split across both sides; the game never says "move it over".
- Either side may be the zero side. Taught explicitly in the quadratic-to-standard Training Room, with both 0 = 2x^2 - 4x - 6 and 2x^2 - 4x - 6 = 0 shown as correct, and followed up by reading a, b, c from the "0 =" form.
- Multiplying or dividing by something that might be 0 is never free: the Risky verdict (I1) says it the same way every time.
- Substitution check: they are taught to do it themself (I5 stepper, I6 number evidence, Truth Trace) as a method that carries over to paper. The Codex opens with it: "When in doubt, plug in 2."
- What a root is: sqrt(n) is "the number whose square is n". This is skill 21, taught on the square plot (area n, side sqrt(n)) before any rationalizing. The same sentence is reused for a^(1/2): "(9^(1/2))^2 = 9^1, so 9^(1/2) is the number whose square is 9". The standing check for any radical claim is "square it and see": 7 x 7 = 49, not 25.
- Representations (tap-driven SVG): the number line by default, with fraction bars as a secondary view inside the "why?" expander; the balance; the square plot; area tiles, which arrive with the Arch. The balance fades from full scale -> icon -> a glowing "=". Stacks and Roots otherwise use expansion text (xx . xxx), not new interactive systems.
- Worked examples: every new skill opens with one. Backward fading is adaptive: one more step is blanked per correct item, and a step is restored on a miss.
- Derivations over rules: exponent and radical rules arrive as Training Rooms that force the rule. The derivation they completed becomes their Law card, titled with the classroom name ("Product rule for radicals, for a, b >= 0").
- "Legal, not useful" and "same value, not finished" are first-class verdicts, so convention is never confused with truth.
- Productive-failure teasers: one optional "try it" line before a worked example, never scored.
- Weekly paper bridge: each Sunday the Haul shows one generated problem to do by hand and one talking point. The teacher marks it done in the teacher view. The goal is for them to say the why aloud in their own words.

## 8. Game systems

- Season. "The Descent" is a 10-tier track ending at the Gate, a readiness gauntlet. Tiers advance only by mastery evidence, never by time played: tier t is reached at 10t EP on A-priority skills (maximum 120). The Gate opens at tier 10 (100 EP). If tier 10 is not reached by day 65, the Gate opens anyway, and its report marks unreached skills as "not tested".
- Map. The skill graph drawn as a vault. A room lights when its skill reaches the learning state, and stays lit.
- Bosses ("Wardens"). One per cluster, eligible when every skill in the cluster has 2 of 3 evidence days. Seven clusters:
  - Balance Warden (the slice boss): 8, 9, 12, 13, 14.
  - Mint Warden: 1-7.
  - Stack Warden: 17-20, 26.
  - Root Warden: 21-25.
  - Factor Warden: 10, 11, 27-31.
  - Quadratic Warden: 32-36.
  - Ridge Warden: 15, 16, 37-40.
  - Earliest the Balance Warden can appear, by hand arithmetic: about day 11-12, sooner if Charting places skills.
  - Symbol-only, multi-step, mixed.
  - HP (hit points) is the BFS distance from the start state to solved form over the generator's chip alphabet (I1). Damage is the reduction in remaining distance, so a shortcut does more and a legal detour does 0. Nothing is punished.
  - If the boss is not cleared, it "retreats" and returns in 2 days.
- Haunts. An active misconception appears as a named mini-boss, with a bounty at Camp. Clearing its separating items first-try on 3 separate days banishes it; a trophy goes on the wall and stays there. Its Codex card shows the standard term, their own wrong answer and the counterexample ("The Spreader believes in a fair world. The world disagrees at x = 2."). A banished Haunt returns if re-hit twice.
- Currency. There is exactly one, shards, paid for progress only: 2 for a first-try Progress cast or correct answer, 1 for a corrected one, 0 for "Legal. Not closer.", Risky, and the non-counting Why. Never negative. Shards buy procedural cosmetics only: cloak and lantern palettes, trails, Scale skins. "A value has many skins."
- Fracture doors. One fork per run may show a Fracture door, built from mastered skills only, with messier arrangements. A first-try answer there pays double; a miss pays the normal corrected rate. Nothing banked is at risk.
- Charms (from M9, 5 total, one equipped): Foresight (see both door contents by type and zone), Second Door (reroll a fork), Echo Purse (an Echo cleared first-try pays +2), Long Fuse (one extra Fracture door), Cartographer (Haul previews tomorrow's due rooms). None touches the math.
- There are no hit points for the Keeper, no crits, multipliers, daily-streak guilt or leaderboards. A weekly rhythm marker (4+ sessions) carries 2 freeze tokens.
- Failure. A run cannot be lost.
- Tone. Terse, dry, competent: "Clean cast." "Legal. Not closer." There is no mascot, no confetti, and no narrated lore.
- Sound. Procedural WebAudio (cast, shatter, tip, level) ships in the slice, with a mute toggle. Nothing is conveyed by sound alone, since the iPhone ring switch silences it. No haptics; iOS Safari lacks the Vibration API.
- Weekly "what is boring?" check. One tap at Sunday's Haul lists the room types, and they can put up to 2 on a kill list, which the planner honors where another interaction type can serve the skill.
- A "Report this item" button on every item logs the generator, version, seed and build hash.

## 9. Visual and UX spec

- Style. Dark slate background, glowing line art, system font, math at 22px or larger. SVG for instruments and the user interface; one canvas layer for particles. No emoji and no external assets. The look is angular and geometric, pitched at a 15-year-old.
- Layout. 45% Knot and math / 15% instrument / 40% input, on a `100dvh` root. `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`. `env(safe-area-inset-*)` padding on all four edges, with the bottom inset under the keypad. In landscape, a "rotate to portrait" notice covers the app.
- Vocabulary. Every in-world name is shown with its standard term beside or beneath it, on first sight in a session and always in the Codex and feedback:
  - Knot = expression or equation
  - Lantern = substitution check
  - Scale = both sides of the equation
  - coin = form of 1; zero-pair = form of 0
  - Cast = the same operation on both sides
  - Law card = the rule under its classroom name
  - each Haunt = its standard term from section 5
  - Feedback and goals use classroom words: numerator, denominator, coefficient, term, factor, radicand, both sides. Never "upstairs/downstairs".
  - A lint test fails any in-world name constant that has no `standardTerm`.
- Math. A custom AST-to-DOM renderer (`render/mathdom.js`; AST = abstract syntax tree, the parsed structure of an expression); every node is a span with `data-path`. It uses flex-column fractions, `<sup>` exponents and an SVG radical hook. Lines wrap at "=". Generators enforce a display-width cap.
- Knots. A faceted, angular polygon cluster built from straight-edged shards, seeded by the problem id. No eyes, no face. Its size scales with the term count and it loses a shell layer per legal move. The math floats in front of it as DOM. There is no token-morph animation.
- The Keeper. A hooded figure built from triangles, shown at Camp and Haul only.
- Lantern overlay. A number line with two dots and their exact values printed beneath, with decimals to 2 places labelled "about". All checks are exact; decimals are display only.
- Scale. An SVG beam and two pans; it tips with an eased rotation according to the sign of the difference.
- Touch. Tap only, on `pointerdown` rather than `click`. Targets are 48px or larger. On the app root: `touch-action: manipulation`, `overscroll-behavior: none`, `user-select: none`, `-webkit-user-select: none`, `-webkit-touch-callout: none`. `gesturestart` is cancelled with `preventDefault`. There are no swipes, no drag, and no system keyboard.
- Keypad. Keys are 0-9, /, -, +, ^, sqrt, (, ), =, +-, ",", "no solution", "all reals" and backspace, plus up to 4 variable keys declared by the item (x by default; l, w, A and so on for literal-equations). A live rendered preview shows how the input was read (sqrt3 shows as sqrt(3)), fully parenthesized wherever the reading could surprise (1/2x shows as (1/2)x). The plus-minus key (labelled "+-" above) emits the single character U+00B1, never the two characters "+-"; typed "+-" always means plus-negative.
- Icons. `manifest.webmanifest` icons and a 180px PNG `apple-touch-icon`, drawn by `scripts/gen-icons.js` with a small pure-Node PNG encoder.

Key screens:
1. Camp / Map, with the build hash and backup status.
2. Encounter: the Knot, the instrument, and chips or keypad.
3. Lantern/Scale feedback overlay with the "why?" expander and an "Echo queued" marker.
4. Door fork.
5. Haul.
6. Codex: Laws, Haunts and trophies.
7. Pairing: an 8-digit code typed on the in-game keypad.

## 10. Teacher view

`teacher.html`, opened with the teacher token, running the same reducer. The student can open the same page.

It shows:
- The skill map with states. "Inferred from Charting" is marked.
- Algebra 2 readiness: A-priority skills mastered out of 40, EP out of 120, the tier, and the 10 highest-leverage skills listed separately: identity-moves, equivalent-expressions, balance-moves, literal-equations, exp-power-rules, exp-zero-negative, sqrt-product-rule, rational-exponents, quadratic-to-standard, complete-square.
- Haunts: suspected / active / banished, each with its standard term, raw wrong answers beside the diagnosis, and a hit trend. Ambiguous and unclassified answers are listed as such.
- Per session: first-try rate against the 75-85% band, minutes, Knots, and math actions per minute. Sessions per week.
- Skills mastered "with why", and procedure-vs-why results from the Charting pairs.
- A decay watch: mastered skills that are now decaying. This is the early warning if the shortened spacing is failing.
- This week's paper-bridge problem, its answer, and a 2-minute talking point generated from the top active Haunt (e.g. "Ask why 6/sqrt(3) may be multiplied by sqrt(3)/sqrt(3)").
- Reported items, by seed.
- Devices: the build hash and last sync time for each device, and a "Pair a device" button that mints an 8-digit pairing code (section 11).

It does not show rankings or speed. Standard codes stay hidden until they are checked against the DESE (Massachusetts Department of Elementary and Secondary Education) PDF.

## 11. Technical architecture (final)

Stack:
- Vanilla ES modules, no bundler, zero runtime dependencies, `// @ts-check` with JSDoc against a frozen `types.d.ts`.
- `node --test`.
- A static deploy by rsync to Dreamhost, into versioned directories.
- Generated files are never committed (all gitignored): the generator registry, the mal-rule registry, the mount registry, the service worker and its precache manifest.

```
index.html  teacher.html  gallery.html  manifest.webmanifest  types.d.ts  icons/
proto/      (M0.5: self-contained; imports nothing from src/)
src/
  math/     rational.js surd.js ast.js parse.js print.js evaluate.js poly.js
            radical.js equiv.js forms.js solve.js
  data/     skills.js
  gen/      prng.js <zone>/<skill>.<name>.js   registry.generated.js
  misc/     malrules/<id>.js diagnose.js       malrules.generated.js
  check/    answer-spec.js judge.js
  moves/    apply.js classify.js graph.js
  learner/  model.js scheduler.js mastery.js fading.js charting.js season.js
  session/  planner.js controller.js
  render/   mathdom.js keypad.js
            visuals/{balance,numberline,bars,coin,zeropair,squareplot,tiles,grid}.js
  game/     loop.js hooks.js scenes/ sprites/ audio.js rooms/ haunts/ boss/ systems/ gate/
  store/    idb.js save-format.js migrations.js sync.js
  teacher/   dashboard.js
  app/      boot.js mounts/<name>.js           mounts.generated.js
api/        sync.php pair.php .htaccess        (data dir outside the webroot)
scripts/    serve.js gen-registry.js gen-sw.js gen-icons.js deploy.sh provision.sh audit.js
test/       mirrors src/; prop.js; fixtures/saves/vN.json; contract/
```

Layering: math <- gen, misc, check, moves <- learner, session <- render, game, teacher, app. A test parses every import and fails on an upward import.

No shared append points:
- One file per generator and one per mal-rule. `scripts/gen-registry.js` globs them into the three `*.generated.js` files. It runs at `serve.js` startup, before tests, and at deploy.
- `data/skills.js` is written once in M0 with all 41 entries; a skill with no generator yet is simply not served. Only the integrator edits it afterwards.
- `index.html` has one owner (M3) and loads only `src/app/boot.js`, which imports `mounts.generated.js`. Each milestone adds its own `src/app/mounts/<name>.js` exporting `mount(app)`.
- `game/hooks.js` (M5a) is the event bus that M5b and M9 attach to, so neither edits M5a's files.

Frozen types (M0 ships these as `types.d.ts`; changes after M0 go through the integrator):

```ts
type Q = { n: bigint; d: bigint };              // lowest terms, d > 0; saved as "n/d"
type Surd = { terms: { coef: Q; rad: bigint }[] };   // sum of coef x sqrt(rad), rad squarefree, rad 1 = rational
type Node =
  | { t: 'num'; q: Q }
  | { t: 'var'; name: string }
  | { t: 'add'; args: Node[] }
  | { t: 'mul'; args: Node[] }
  | { t: 'neg'; arg: Node }
  | { t: 'frac'; num: Node; den: Node }
  | { t: 'pow'; base: Node; exp: Node }         // exp may be a non-integer num: a rational power
  | { t: 'root'; index: number; radicand: Node }     // index is 2 in v1
  | { t: 'group'; arg: Node };                  // parentheses kept for display
type Equation = { t: 'eq'; lhs: Node; rhs: Node };
type Assumption = { name: string; rel: 'nonzero' | 'nonneg' | 'pos' };
type SolutionSet = { kind: 'finite'; roots: Surd[] } | { kind: 'none' } | { kind: 'all' };
type Env = Record<string, Q>;
type Tri = true | false | undefined;            // undefined = cannot verify

type Move = { op: 'add' | 'sub' | 'mul' | 'div' | 'square' | 'sqrt'; operand?: Node };
type MoveVerdict = 'legal' | 'risky' | 'illegal';
type Interaction = 'cast' | 'nextline' | 'predict' | 'forge' | 'twin' | 'trace' | 'why' | 'strike';

type AnswerSpec = {
  kind: 'expr' | 'equation-sides' | 'equation-multiple' | 'solution-set' | 'form-of-1' | 'form-of-0' | 'tuple';
  expected: Node | Equation | SolutionSet | Node[];
  formPredicates: string[];                     // names exported by forms.js
  assumptions: Assumption[];
};
type Choice = {
  id: string; display: Node | Equation | Move;
  verdict: 'progress' | 'legal-idle' | 'risky' | 'illegal' | 'correct' | 'wrong';
  distance?: number; malrule?: string;
};
type Step = { line: Node | Equation; move?: Move; legal: boolean; malrule?: string };
type Problem = {
  id: string; gen: string; version: number; seed: string;
  skill: string; difficulty: 1 | 2 | 3 | 4; interaction: Interaction; variant?: string;
  constructed: boolean; fadeLevel: 0 | 1 | 2 | 3;
  prompt: { verb: string; math: Node | Equation; move?: Move; goal?: string; twin?: Node | Equation };
  assumptions: Assumption[]; variableKeys: string[];
  choices?: Choice[]; answer: AnswerSpec; steps?: Step[];
  moveGraph?: { distance: number; minPath: Move[] };
  visuals: string[]; probes: Env[];
};
type Attempt = {
  problem: { gen: string; version: number; seed: string; skill: string; difficulty: number;
             interaction: Interaction; variant?: string; constructed: boolean };
  response: string;                             // raw input or choice id; never free text
  verdict: 'correct' | 'form' | 'legal-idle' | 'risky' | 'wrong' | 'unparsed' | 'unverifiable';
  firstTry: boolean; hintsUsed: number; fadeLevel: number; evidence: boolean;
  context: 'blocked' | 'mixed' | 'charting' | 'boss' | 'fracture' | 'echo' | 'warmup' | 'closer';
  misconceptions: string[]; ambiguous: boolean; ms: number;
};
type Event = {
  id: string;                                   // ULID: a sortable unique id
  v: number; t: string; build: string; device: string;
  type: 'attempt' | 'award' | 'session-start' | 'session-end' | 'unlock' | 'placement'
      | 'report' | 'paper-bridge' | 'setting';
  data: unknown;
};
type Generator = {
  id: string; version: number; skill: string; difficulty: [number, number];
  interactions: Interaction[];
  generate(rng: Rng, opts: { difficulty: number; interaction: Interaction; fadeLevel: number }): Problem;
  alphabet?(state: Equation): Move[];           // required for cast and boss generators
};
type MalRule = {
  id: string; haunt: string; standardTerm: string; script: string; skills: string[];
  apply(problem: Problem): Node | Equation | SolutionSet | undefined;
};
type SkillDef = { n: number; id: string; zone: string; pre: string[]; priority: 'A' | 'B';
                  cluster: string; sliceGate?: { maxDifficulty: number; pre: string[] } };
```

Math API (M1a implements; everyone else codes against these signatures):

```ts
// rational.js
q(n: bigint | number, d?: bigint | number): Q
add(a: Q, b: Q): Q;  sub;  mul;  div;  neg(a: Q): Q;  cmp(a: Q, b: Q): -1 | 0 | 1;  qeq(a: Q, b: Q): boolean
// surd.js
sadd(a: Surd, b: Surd): Surd;  smul;  seq(a: Surd, b: Surd): boolean
sqrtQ(a: Q): Surd | undefined;  approx(a: Surd, places: number): string    // display only
// parse.js / print.js
parse(text: string): Node | Equation | { error: string }
print(x: Node | Equation): string
// evaluate.js
evaluate(n: Node, env: Env): Surd | undefined
// poly.js / radical.js
toPoly(n: Node): Poly | undefined;  polyEq(a: Poly, b: Poly): boolean;  degree(p: Poly): number
toRadicalNormalForm(n: Node, a: Assumption[]): RadNF | undefined
// equiv.js
equivExpr(a: Node, b: Node, as?: Assumption[]): { equal: Tri; witness?: Env; note?: string }
sameSides(got: Equation, want: Equation, as?: Assumption[]): Tri          // side-wise, swap allowed
isMultiple(got: Equation, orig: Equation, as?: Assumption[]): Tri         // nonzero rational multiple
sameSolutions(a: Equation, b: Equation, v: string): { equal: Tri; witness?: Surd }
// forms.js: named predicates, (x: Node | Equation) => boolean
// solve.js
solve(e: Equation, v: string): SolutionSet | undefined
// moves
applyMove(m: Move, e: Equation): Equation
classify(m: Move, e: Equation, as: Assumption[]): MoveVerdict
bfs(start: Equation, alphabet, isGoal, maxDepth?: number, nodeCap?: number):
    { distance: number; minPath: Move[] } | undefined
```

Math core:
- Rationals are BigInt p/q. Floats are never used in a check.
- Surds are sums q_i x sqrt(s_i) with s_i squarefree.
- Expression equivalence, by class:
  - Polynomials: equality of the expanded canonical form in `poly.js`. That is a proof.
  - Rational functions: cross-multiply a/b = c/d to ad = bc and test that as a polynomial identity. The answer is "equal where defined", and the poles are reported in `note`.
  - Radicals and rational powers: v1 items are numeric, or monomial in variables declared x >= 0. They are compared by normal form: a sum of terms (surd coefficient) x (product of variables to rational powers). Point agreement is never used as proof here.
  - Anything else (nested radicals, variable radicands without a declaration, sums under a radical with variables) returns `undefined`, and the judge says "cannot verify". `audit.js` fails any generator that can emit such an item or answer.
- `witness` is found by searching the probe set, and is used for display, not proof. Tests cross-check the polynomial path against exact evaluation at degree+1 points.
- Equation checks: `sameSides` for I2/I3; `isMultiple` for rewriting tasks; `sameSolutions` (exact root sets from `solve.js`) for I1 one-way generators and I8.
- Domain policy:
  - x/x vs 1 is "equal where defined", with a note.
  - sqrt(x^2) vs x is not equal without a declaration, with witness -2; with x >= 0 declared it is equal.
  - Radicands are never negative in v1. The product rule is always stated "for a, b >= 0", and no item shows sqrt(a) x sqrt(b) with a negative a or b. `audit.js` rejects any generator that can emit a negative radicand.
  - Any multiply or divide by an expression containing a variable not declared nonzero classifies as `risky`, whatever the roots are.

Generator contract: as the `Generator` type above. Each generator is pure and seeded (no Math.random, no Date). It builds backward from the answer, and rejection-samples until:
- every mal-rule output is non-equivalent to the answer;
- the mal-rule outputs are pairwise non-equivalent;
- there is no 0 or 1 solution, and no "2 + 2 = 2 x 2" coincidence;
- an I6 bad line changes the solution set;
- a cast or boss item has a BFS path of length 6 or less;
- the display fits.

Distractors are only mal-rule outputs. Forge and Cast option sets are designed alphabets, and every option's verdict is machine-computed.

Tests (`node --test`, 5000 seeds per generator per difficulty; a failure prints the seed):
- Determinism.
- The answer key is verified two ways: substitution into the original, and the independent `solve.js`.
- Distractors are distinct from each other and from the answer.
- Tag honesty: re-running the tagged mal-rule reproduces the distractor.
- Side-wise judging: for every I2/I3 equation item, retyping the original line is rejected, and so is the fully solved line.
- Cast classification: every chip's verdict is recomputed independently; no multiply or divide by an undeclared variable expression is ever `legal`; in the one-way generators the root set really changes.
- BFS: terminates under the node cap; replaying `minPath` reaches the goal in exactly `distance` moves; each chip's distance matches a fresh search.
- Worked-step chains are equivalent step to step, except the planted bad line.
- print/parse round trip, including root and rational-power nodes.
- Render without throwing.
- Detector round trip: a simulated student who applies mal-rule M to every item must be tagged M and nothing else. An always-correct student gets no tags.
- TRUE and FALSE equivalence tables of about 100 entries each, including rational-function, radical, rational-power and domain cases; metamorphic expand/perturb tests; field-axiom property tests.
- Fake-clock learner scenarios: mastery needs 3 evidence days at least 2 days apart, one mixed, one Strike, one counting Why; at most one box per session; a missed constructed response drops exactly one box; choice attempts never move a box; awards are never revoked.
- Guesser simulation: a student who taps uniformly at random and types garbage gains no box, no EP, no mastery Why, and no shards from idle or risky moves.
- Planner simulations: a cold-start run plans without error and predicts within band; the closer is always the most winnable item; no session ends on a miss; choice items stay at or under 50%.
- Timeline simulation (the M2 gate): an 80%-accurate student playing 5 days a week, with all content available, reaches the Gate (100 EP) by day 65, the Balance Warden by day 21, and first evidence on sqrt-product-rule and quadratic-formula by day 35. If it fails, tune in this order and report the result to the teacher: the new-skills-per-run cap, the evidence gap, the Gate threshold. "Constructed responses only" is never relaxed.
- `audit.js`: fails on a shipped skill with no generator, a skill with no box 0-1 interaction or no counting Why form, a mal-rule with no separating generator, an unverifiable answer, or a negative radicand.
- Precache coverage: every module reachable by import from `boot.js` and `teacher.html` is in the precache list.

Persistence and sync:
- IndexedDB is the primary store. `navigator.storage.persist()` is called at startup. localStorage holds conveniences only.
- Eviction is treated as expected, not exceptional:
  - Sync runs after every room (`fetch` with `keepalive: true`), at session end, and on `visibilitychange` -> hidden, with a retry queue.
  - Camp and Haul show "backed up N min ago".
  - On startup with an empty store, the app shows the pairing screen and, once paired, restores the whole log from the server.
- A JSON export button ships from M0.5 on.
- `api/sync.php` is under 150 lines:
  - It accepts only tokens whose sha256 is in the allowlist `~/keystone-data/tokens.json`, which maps each token hash to `{learner, role: kid | teacher}`. An unknown token gets 401 and creates nothing. The teacher-to-kid link is that server-side map; a client never names a learner or a file.
  - POST `{since, events}`: an flock-guarded append to `~/keystone-data/<learner>.jsonl`; it returns the events the device lacks. Sync is a set union, so there are no conflicts. The teacher role cannot append.
  - Rate limit: 60 requests per minute per token hash and per IP address, then 429. Bodies over 256 KB get 413.
- Tokens are random 128-bit values, created by `scripts/provision.sh` over ssh. Nobody types one.
- Pairing (`api/pair.php`):
  - The teacher view, with the teacher token, asks for a pairing code. The server mints a fresh kid token for that learner, allowlists its hash, and stores `{code -> token}` for 15 minutes, single use.
  - They type the 8-digit code on the in-game keypad inside the home-screen app; the server returns the token and deletes the code.
  - Redemption is limited to 5 tries per 15 minutes per IP address and 20 globally.
  - The teacher role can therefore add devices, but still cannot write events. The teacher view can revoke a device token.
- No names and no free text are stored.
- Setup rule: add to the home screen FIRST, then pair. A home-screen PWA has a separate storage container from Safari tabs.

Service worker and updates:
- Cache-first, keyed by the build hash (the git short hash). The build hash is shown at Camp and in the teacher view, and is written on every event.
- A resumed home-screen app never navigates, so the app calls `registration.update()` each time it becomes visible at Camp. If a new worker is waiting and no run is in progress, it activates and the page reloads. A version never changes mid-run.
- `.htaccess` sends `Cache-Control: no-cache` for `sw.js`, `index.html`, `teacher.html` and the manifest, and a long immutable lifetime for `/v/*`.
- AudioContext: created and resumed inside the "Descend" tap handler, and resumed again on the first tap after the app returns from the background.

Deploy target (decided 2026-11-12): ssh host `mglerner.com`, production web root `~/shadyalexi.com` (https://shadyalexi.com/), staging in the subdirectory `~/shadyalexi.com/staging/` (https://shadyalexi.com/staging/), data directory `~/keystone-data/` outside the web root, PHP 8.3. Because staging is a subpath, every URL in the app, the manifest, the service worker scope and the API calls is relative; nothing may assume the site root.

Deploy. `scripts/deploy.sh` (owned by M3) hard-fails in this order:
1. Refuse if git is dirty. The build hash is the commit.
2. Tests and `audit.js`, including the precache coverage test.
3. Build into `dist/`: the registries, the icons, `v/<hash>/` holding all modules, and `sw.js` with its precache list of `v/<hash>/` URLs.
4. rsync `v/<hash>/` to staging, then the root HTML files, then `sw.js` LAST. rsync is not atomic, so nothing may reference a file that is not yet uploaded.
5. `php -l` on the host.
6. Contract suite against staging: round trip, idempotent re-POST, 401 on an unknown token, no file created by an unknown token, the teacher token cannot write, 413 on an oversize body, 429 over the rate limit, pairing code single-use and expiring, concurrent POSTs lose no lines, `sw.js` served with no-cache.
7. Production, in the same order: `v/<hash>/`, root files, `sw.js` last. The last 3 `v/` directories are kept.

`scripts/serve.js` (owned by M3) regenerates the registries, serves static files, and runs a Node mock of both API endpoints under the same contract suite.

## 12. Milestones

P = can run in parallel with the others listed. Each milestone owns disjoint paths; nobody edits a path they do not own, and shared lists are generated by glob.

**M0 Scaffold and contracts.** Owns `package.json`, `.gitignore`, `types.d.ts`, `src/data/skills.js`, `src/gen/prng.js`, `scripts/gen-registry.js`, `scripts/audit.js`, `test/prop.js`, the import-boundary test.
- `git init`; add a remote if wanted.
- `types.d.ts` frozen as in section 11, including root and rational-power nodes.
- `skills.js` with all 41 entries, clusters and slice gates.
- Accept: `node --test` is green; the registry generator globs an empty tree without error; audit prints the coverage matrix (it fails as expected on missing generators, behind an `--allow-missing` flag that M1 removes).

**M0.5 (P with M0) Proto slice: in the student's hands in 1-2 days.** Owns `proto/` only. Self-contained; it imports nothing from `src/`.
- One encounter screen. Four skills: frac-times-whole, sqrt-squared, rationalize-denominator d1, quadratic-to-standard d1.
- Three interactions: I4 Forge, I2 Next Line, I8 Strike.
- Lantern/Scale feedback after commit, and an Echo after every miss.
- Seven mal-rules: 3, 4, 5, 8, 11, 18, 19.
- A fixed rotation of 10 Knots per run. Events are logged to localStorage in the section 11 `Event`/`Attempt` shape, with a JSON export button.
- It has no planner, service worker, sync, Charting, shards or boss. It uses its own minimal exact arithmetic (rationals and q x sqrt(n)).
- Accept:
  - Every generator passes determinism, answer-key and distractor property tests over 5000 seeds.
  - The teacher examples are reproducible by seed: 4 x 1/3, sqrt(3) x sqrt(3), 6/sqrt(3), 6 + 4x = 2x^2.
  - It plays in iPhone Safari from a static URL.
  - Their exported log replays through the M2 reducer once that exists.

**M1 Math core, moves, slice generators.** Three parts, parallel once M0 is done.
- M1a owns `src/math`. Accept: TRUE/FALSE tables of at least 60 entries each are green, including the rational-function, radical and domain cases; field-axiom property tests pass.
- M1b owns `src/gen/<zone>/` slice files, `src/misc/malrules/` (all 19), `src/misc/diagnose.js`. Built against the frozen types, with M1a stubs until it lands. Accept: all 12 slice skills have generators covering their slice interactions, each with a box 0-1 interaction and a counting Why; the full property suite and the detector round trip pass for all 19 mal-rules over 5000 seeds; audit is green without the flag; the teacher examples are reproducible by seed, including 4 + 4x = 2x^2 at d3.
- M1c owns `src/check`, `src/moves`. Accept: the side-wise judging tests, the cast classification tests and the BFS tests pass.

**M2 (P with M1) Learner model, planner, Charting and season logic.** Owns `src/learner`, `src/session`.
- Built against stub generators that follow the contract.
- Accept: the fake-clock scenarios, the guesser simulation, the planner simulations including cold start, and the timeline simulation pass; a Charting simulation places a scripted student correctly on the 12-skill slice graph and on the full 41-entry graph.

**M3 (P with M1, M2) Persistence, sync, PWA shell, deploy.** Owns `index.html`, `manifest.webmanifest`, `icons/`, `src/app/boot.js`, `src/store`, `api/`, `scripts/{serve.js,deploy.sh,gen-sw.js,gen-icons.js,provision.sh}`, `test/contract`.
- Accept:
  - Contract suite green against the mock and against staging.
  - A stub page installs to an iPhone home screen, loads offline, and picks up a new deploy after being backgrounded and resumed.
  - Pairing by code works inside the installed app; a wiped store restores from the server.
  - `sw.js` is served with no-cache on Dreamhost.
  - A v1 save fixture migrates.

**M4 (P with M1, M2, M3) Render and keypad.** Owns `src/render/mathdom.js`, `src/render/keypad.js`, `gallery.html`.
- Built against the frozen types and stub problems.
- Accept: the gallery page renders 200 generated problems with no overflow at 375px width; the keypad round-trips every slice answer form, including per-item variable keys; the 45/15/40 layout holds on an iPhone with a home indicator.

**M5a Encounter core.** Needs M1-M4. Owns `src/game/{loop.js,hooks.js,audio.js,scenes/,sprites/}`, `src/render/visuals/{balance,numberline,bars,coin,zeropair,squareplot}.js`, `src/app/mounts/game.js`.
- All 8 interactions and their variants, Lantern/Scale feedback after commit, Echoes, a planner-driven 10-Knot run, Charting probes, warm-up and closer, Haul, audio, the report button, the vocabulary labels, the landscape notice.
- Imports the student's proto log.
- Accept:
  - A full run on the iPhone, offline, replaces the proto.
  - No session can end on a miss (a test enforces it).
  - Every feedback main line is 15 words or fewer, and every in-world name has a standard term (lint tests).

**M5b (after M5a's `hooks.js` is frozen) Rooms, Haunts, Warden.** Owns `src/game/{rooms,haunts,boss}/`, `src/app/mounts/rooms.js`.
- Training Rooms with backward fading, the live controller, door forks, shards, Haunts, and the Balance Warden.
- Accept: non-math time is at or under 15% in a scripted playthrough; shards are never paid for an idle or risky move (a test enforces it).

**M6 (P with M5a) Teacher view.** Needs M2, M3. Owns `teacher.html`, `src/teacher`, `src/app/mounts/teacher.js`.
- Accept: every section 10 item renders from a fixture log; the teacher token cannot write events; pairing-code minting works.

**M7 (P with M5, M6) Mint and Scales remainder: skills 4-7, 10, 11, 15, 16.** Owns its new generator files only.
- Accept: the property suite, the detector round trip, and audit.

**M8 (P with M7) Stacks and Roots: skills 17-20, 22, 24, 26, and the full difficulty range of 23 and 25.** Owns its new generator files and `src/game/rooms/derivations/`.
- Includes the derivation Training Rooms, the I4 "(9^?)^2 = 9^1" Forge, and the full Twin pools for mal-rules 15-17.
- Accept: as M7, plus normal-form equivalence tests for every radical and exponent answer; audit rejects a planted negative-radicand generator.

**M9 Systems.** Needs M5b. Owns `src/game/systems/`, `src/app/mounts/systems.js`. It attaches through `game/hooks.js` and reads `learner/season.js`; it edits neither.
- Charms, Fracture doors, the Codex and Law cards, Quick-cast, the season track display, the paper bridge, the kill list, cosmetics.
- Accept: Quick-cast never fires on an evidence item (a test enforces it); the economy never goes negative.

**M10 The Arch: skills 27-31, 33-36, and quadratic-to-standard d3-4.** Needs M8 for radicals. Owns its new generator files and `src/render/visuals/tiles.js`.
- Area tiles, the zero-pair Forge for completing the square, and one-way-move generators including squaring both sides (verdict "Risky: squaring can add solutions").
- Accept: as M7, plus root-set legality tests.

**M11 The Ridge and the Gate: skills 37-40 (and 41 if time allows).** Owns its new generator files, `src/render/visuals/grid.js`, `src/game/gate/`, `src/app/mounts/gate.js`.
- Accept: an end-to-end playtest on the iPhone against production; the Gate report marks untested skills honestly.

Suggested calendar:
- Days 1-2: M0 and M0.5. The student is playing the proto by day 2.
- Rest of week 1: M1-M4.
- Week 2: M5a and M6. The proto is replaced, with their log carried over.
- Week 3: M5b, M7, M8.
- Then M9-M11, staying ahead of their path.

## 13. Explicitly deferred

- Tap-a-term targeting on arbitrary sub-expressions, beyond the engine-chosen targets in I7.
- Drag-and-drop, token-morph enemy animation, the auto-run corridor and swipe forks.
- A timed Sprint / ghost mode for mastered skills.
- A relic economy beyond the 5 charms; heat tiers beyond Fracture doors.
- Story cutscenes and narration.
- The cut skills: inequalities, word-problem translation, scientific notation, graph families, exponentials, expression-structure. Also conjugate rationalizing, complex numbers, and nested radicals.
- Clear-fractions with variable denominators; literal-equations that divide by an undeclared symbol.
- Variable radicands without a declared x >= 0; negative radicands; rational powers of sums.
- A fitted scheduler (FSRS, the Free Spaced Repetition Scheduler).
- MathML accessibility output.
- Showing standard codes, until they are verified.
- Multi-learner support (the server map already allows it; the client does not).
- Local PHP.
- Token entry by paste or by URL inside the home-screen app; pairing codes replace it.

## Appendix: Rejected referee points

None of the 15 points is rejected outright. Six were applied with an adaptation:

- Point 2, "three skills" in M0.5: it has four. Point 3 requires sqrt-squared as the prerequisite of rationalize d1, so shipping rationalize in M0.5 without it would repeat the fault point 3 names.
- Point 2, Charting: of the two options, I chose folding it into normal play; there is no capped diagnostic session.
- Point 3: beyond what the referee listed, sqrt-product-rule d1 (numeric, perfect-square factors) is added as a slice deviation gated on sqrt-squared. Without it the named Twin pairs would still sit behind the exponent chain. Also one mal-rule the referee did not ask for, root-square-overshoot, because sqrt-squared needs a diagnosable wrong answer of its own.
- Point 4, "Same must be followed by the 1 or 0 that connects the forms": applied where such a 1 or 0 exists. For pairs joined by distribution or by a radical rule there is no single 1 or 0, so the connect step there is typing the common value.
- Point 11, "paste button or pairing code": pairing code only. A consequence the referee did not state is that the teacher token can now add devices, so it is "cannot write events" rather than strictly read-only.
- Point 12: scalar-into-denominator (mal-rule 19) is added so the new frac-times-whole I2 variant has two diagnosable distractors rather than one.
- Point 14, "default to the number line over fraction bars": fraction bars are kept, but only as a secondary view inside the "why?" expander.

One referee statement needed no change: point 3 asks to "re-gate square-roots on exp-meaning only", which v1 already did.
