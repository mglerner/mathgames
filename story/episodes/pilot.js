// Pilot episode: "The Vark Job". Five locks, one per gap the teacher named.
// Authored content is trusted HTML. Every option carries a machine-checkable
// value (`num`, or `bc` for the quadratic) that story/test/pilot.test.js
// verifies against an independent computation.

/** Stacked fraction. */
export const F = (a, b) => `<span class="frac"><span>${a}</span><span>${b}</span></span>`;
/** Square root: a drawn tick joined to a bar over the contents (a text glyph leaves a gap). */
export const R = (x) => `<span class="sqrt"><svg viewBox="0 0 10 20" preserveAspectRatio="none" aria-hidden="true"><path d="M0.5 11 L2.5 10 L5 19 L10 0.7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg><span>${x}</span></span>`;
export const M = '−'; // minus sign
export const X2 = 'x<sup>2</sup>';
const S2 = Math.SQRT2;

export const episode = {
  id: 'pilot',
  title: 'The Vark Job',
  intro: [
    `Lucian Vark won the Tri-County Math Bowl in 1998 and has not been normal about it since.`,
    `Last month he bought your school's 1987 state championship trophy at an auction nobody else was told about. It now sits on the 14th floor of Vark Tower, behind locks he designed himself. Every lock is a math problem. Of course it is.`,
    `The crew is three people. Dez drives and talks in your ear. Wrench carries the gear. You do the locks. They call you Numbers. You did not get a vote.`,
    `<b>How this works:</b> grab paper and a pencil. Work each lock out, then pick your answer. A wrong answer does not end the job. It gets you a setback, an explanation of exactly what went wrong, and another try.`,
  ],
  problems: [
    {
      id: 'cable',
      title: 'The Cable',
      story: [
        `11:40 pm. The loading dock behind Vark Tower smells like old fryer oil.`,
        `Wrench is packing the climbing line. "The vent run is 4 sections," she says. "Each section eats ${F(1, 3)} of a spool. How many spools do I pack? Do not say 'some'."`,
      ],
      ask: `4 &times; ${F(1, 3)} = ?`,
      truth: 4 / 3,
      similar: `<b>A similar one:</b> 5 &times; ${F(2, 7)}. That is five lots of two-sevenths: 10 sevenths. So 5 &times; ${F(2, 7)} = ${F(10, 7)}. The 7 never moved, because the pieces never changed size. You just have more of them.`,
      options: [
        {
          id: 'a', html: F(4, 3), num: 4 / 3, right: true,
        },
        {
          id: 'b', html: F(4, 12), num: 4 / 12,
          setback: `Wrench packs ${F(4, 12)} of a spool, then squints at it. "That's a third. That's ONE section." You find this out for sure at the end of section one, dangling in a vent, holding the end of the line.`,
          why: `You multiplied the top AND the bottom by 4. That is multiplying by ${F(4, 4)}, and ${F(4, 4)} is just 1. Multiplying by 1 never changes an amount: ${F(4, 12)} is the same amount as ${F(1, 3)}, cut into smaller pieces. That move is great when you want the <i>same</i> amount in a different outfit. Here you want 4 times as much. Four lots of one-third is ${F(1, 3)} + ${F(1, 3)} + ${F(1, 3)} + ${F(1, 3)} = ${F(4, 3)}. Only the top changes: the top counts pieces, the bottom says how big each piece is.`,
        },
        {
          id: 'c', html: F(1, 12), num: 1 / 12,
          setback: `Wrench hands you ${F(1, 12)} of a spool. It is roughly a shoelace. Dez laughs for so long he has to mute himself.`,
          why: `You multiplied only the bottom by 4. Making the bottom bigger makes each piece <i>smaller</i>: twelfths are a quarter the size of thirds. So you divided by 4 instead of multiplying. Four lots of one-third is 4 pieces of size one-third: ${F(4, 3)}.`,
        },
        {
          id: 'd', html: `12`, num: 12,
          setback: `Wrench packs 12 spools. Her bag now weighs more than she does. She gets it four feet up the wall before the strap gives out and the whole dock hears it.`,
          why: `12 answers a different question: how many thirds fit inside 4? That is 4 &divide; ${F(1, 3)}. You need 4 &times; ${F(1, 3)}: four pieces, each one-third of a spool. Four thirds is ${F(4, 3)}, a bit more than one spool.`,
        },
        {
          id: 'e', html: `4${F(1, 3)}`, num: 4 + 1 / 3,
          setback: `Wrench packs four and a third spools. You use about a third of that. The rest follows you through the vent, getting caught on every screw.`,
          why: `Writing 4 next to ${F(1, 3)} means 4 <i>plus</i> ${F(1, 3)}. You were asked for 4 <i>times</i> ${F(1, 3)}: four pieces, each a third. That is ${F(4, 3)}, which is only 1${F(1, 3)}.`,
        },
      ],
      win: [
        `"${F(4, 3)}. One spool and a bit," Wrench says, and packs two to be safe. The line holds through all four sections.`,
        `You drop out of the vent into a service corridor. At the far end is a steel door with a brass plate screwed to it.`,
      ],
    },
    {
      id: 'door',
      title: 'The Service Door',
      story: [
        `The brass plate is engraved. Below it is a keypad.`,
        `"Read it to me," says Dez.`,
        `You read it to him. There is a long silence on the line. "He put homework on his door."`,
        `The plate says: <i>Enter x. One attempt per customer. &mdash; L.V.</i>`,
      ],
      ask: `${M}3(x ${M} 4) = 18`,
      similar: `<b>A similar one:</b> ${M}2(x ${M} 5) = 14. Distribute to BOTH terms: ${M}2 times x is ${M}2x, and ${M}2 times ${M}5 is +10. So ${M}2x + 10 = 14. Take 10 from both sides: ${M}2x = 4. Divide both sides by ${M}2: x = ${M}2. Check it in the original: ${M}2(${M}2 ${M} 5) = ${M}2(${M}7) = 14. It works.`,
      options: [
        { id: 'a', html: `x = ${M}2`, num: -2, right: true },
        {
          id: 'b', html: `x = ${M}10`, num: -10,
          setback: `The keypad plays a sad trombone noise. Vark recorded a sad trombone noise. A small screen lights up: <i>"Signs, my friend. Signs."</i>`,
          why: `When you distributed, you got ${M}3x ${M} 12. But the second product is ${M}3 times ${M}4, and a negative times a negative is positive: +12. So the line should be ${M}3x + 12 = 18. You can always catch this by plugging your answer into the original: ${M}3(${M}10 ${M} 4) = ${M}3(${M}14) = 42, not 18.`,
        },
        {
          id: 'c', html: `x = ${M}${F(22, 3)}`, num: -22 / 3,
          setback: `The keypad thinks about it for a long time, then prints a tiny paper receipt that says <i>"No."</i>`,
          why: `The ${M}3 only reached the x. You wrote ${M}3x ${M} 4, but the ${M}3 multiplies everything inside the brackets: the x <i>and</i> the ${M}4. That gives ${M}3x + 12 = 18. An ugly answer like ${M}${F(22, 3)} is not proof of a mistake, but it is a good reason to check: ${M}3(${M}${F(22, 3)} ${M} 4) = 22 + 12 = 34, not 18.`,
        },
        {
          id: 'd', html: `x = 2`, num: 2,
          setback: `The lock clicks! Then un-clicks. Somewhere above you, a recording of Vark chuckles.`,
          why: `So close. You got to ${M}3x = 6 and then lost the minus sign. Dividing both sides by ${M}3 gives x = 6 &divide; (${M}3) = ${M}2. Check yours in the original: ${M}3(2 ${M} 4) = ${M}3(${M}2) = 6, not 18.`,
        },
        {
          id: 'e', html: `x = 10`, num: 10,
          setback: `The keypad shows a frowning face that Vark clearly drew himself. It has his moustache.`,
          why: `Dividing both sides by ${M}3 first is a legal move, but 18 &divide; (${M}3) is ${M}6, not 6. That gives x ${M} 4 = ${M}6, so x = ${M}2. Check yours in the original: ${M}3(10 ${M} 4) = ${M}3(6) = ${M}18. Right size, wrong sign.`,
        },
      ],
      win: [
        `The door swings open. "One attempt per customer," Dez reads back. "What a guy."`,
        `Behind the door is Vark's private elevator. It has no buttons. It has a touchscreen, and a sticky note.`,
      ],
    },
    {
      id: 'elevator',
      title: 'The Elevator',
      story: [
        `The touchscreen shows an equation and a blank template: <b>${X2} + __x + __ = 0</b>. It will only take the equation with everything on one side, zero on the other, and a plain ${X2} out front.`,
        `The sticky note is in Vark's handwriting: <i>"x = 3 works. Obviously."</i>`,
        `"That note is a gift," says Wrench. "Whatever you type in, 3 still has to work."`,
      ],
      ask: `Rewrite <span class="nw">6 + 4x = 2${X2}</span> in the screen's form.`,
      similar: `<b>A similar one:</b> 8 + 6x = 2${X2}. The 2${X2} can stay where it is. Take 6x and 8 away from both sides: 0 = 2${X2} ${M} 6x ${M} 8. (They changed sign because you subtracted them.) Now halve EVERY term: 0 = ${X2} ${M} 3x ${M} 4. Flip it around if you like: ${X2} ${M} 3x ${M} 4 = 0. Test with x = 4: the original gives 8 + 24 = 32 and 2(16) = 32. The new one gives 16 ${M} 12 ${M} 4 = 0. Both true.`,
      options: [
        { id: 'a', html: `${X2} ${M} 2x ${M} 3 = 0`, bc: [-2, -3], right: true },
        {
          id: 'b', html: `${X2} + 2x + 3 = 0`, bc: [2, 3],
          setback: `The elevator goes down. You were on the ground floor. You did not know there was a down.`,
          why: `You carried the 6 and the 4x across the equals sign without changing them. Nothing gets "carried". What you can do is subtract the same thing from both sides, and subtracting 4x and 6 leaves ${M}4x and ${M}6 on the other side. Use the sticky note: with x = 3 your version gives 9 + 6 + 3 = 18, not 0.`,
        },
        {
          id: 'c', html: `${X2} ${M} 4x ${M} 6 = 0`, bc: [-4, -6],
          setback: `The elevator rises half a floor and stops. The doors open on a concrete wall. Someone has written "nope" on it in marker. It looks like Vark's handwriting.`,
          why: `Your signs are right. But you halved only the 2${X2}. Dividing an equation by 2 means dividing <i>every</i> term on both sides by 2, or it stops being the same equation. 2${X2} ${M} 4x ${M} 6 = 0 becomes ${X2} ${M} 2x ${M} 3 = 0. Sticky note: with x = 3 yours gives 9 ${M} 12 ${M} 6 = ${M}9, not 0.`,
        },
        {
          id: 'd', html: `${X2} ${M} 2x ${M} 6 = 0`, bc: [-2, -6],
          setback: `The elevator plays 40 seconds of smooth jazz and then asks you to rate your experience.`,
          why: `Nearly. You halved the 2${X2} and the 4x but the 6 got left behind. Every term gets halved, including the plain number: 6 &divide; 2 = 3. Sticky note: with x = 3 yours gives 9 ${M} 6 ${M} 6 = ${M}3, not 0.`,
        },
        {
          id: 'e', html: `${X2} ${M} 2x + 3 = 0`, bc: [-2, 3],
          setback: `The screen flashes <i>"ALMOST. Which is another word for no."</i>`,
          why: `One sign slipped. Both the 4x and the 6 were subtracted from both sides, so both turn up negative on the other side: 2${X2} ${M} 4x ${M} 6. Sticky note: with x = 3 yours gives 9 ${M} 6 + 3 = 6, not 0.`,
        },
      ],
      win: [
        `You test it against the sticky note first: 9 ${M} 6 ${M} 3 = 0. Good. You type it in.`,
        `The elevator hums up to 14. The doors open on a dark gallery, and at the end of it, a vault door with a dial the size of a pizza.`,
      ],
    },
    {
      id: 'dial',
      title: 'The Vault Dial',
      story: [
        `The dial is not numbered 0 to 99. Every mark on it is a square root, written in what a little plaque calls "simplest form, as God intended".`,
        `A slip of paper in the frame gives tonight's setting: ${R(50)}.`,
        `"There's no ${R(50)} on this dial," Wrench says. "Find me the mark that means the same thing."`,
      ],
      ask: `Simplify ${R(50)}`,
      truth: Math.sqrt(50),
      similar: `<b>A similar one:</b> ${R(48)}. Look for a perfect square hiding inside: 48 = 16 &times; 3. A root of a product splits into a product of roots: ${R('16 &times; 3')} = ${R(16)} &times; ${R(3)} = 4${R(3)}. Rough check: ${R(48)} is a bit under 7, and 4 &times; 1.73 is about 6.9.`,
      options: [
        { id: 'a', html: `5${R(2)}`, num: 5 * S2, right: true },
        {
          id: 'b', html: `25${R(2)}`, num: 25 * S2,
          setback: `You spin the dial to 25${R(2)}. It is most of the way round. Something heavy inside the door goes <i>clunk</i> in a way that does not sound like opening.`,
          why: `You found the right split, 50 = 25 &times; 2. But the 25 has to go through the root to get out: ${R(25)} is 5. So ${R('25 &times; 2')} = ${R(25)} &times; ${R(2)} = 5${R(2)}. Rough check: ${R(50)} is just over 7, because 7 &times; 7 = 49. But 25${R(2)} is about 35.`,
        },
        {
          id: 'c', html: `2${R(5)}`, num: 2 * Math.sqrt(5),
          setback: `The dial turns to 2${R(5)} and a little flag pops out of the door. The flag says <i>"backwards"</i>.`,
          why: `The numbers got swapped. 50 = 25 &times; 2, and it is the 25 that is a perfect square, so it is the 25 that comes out (as 5). The 2 stays under the root: 5${R(2)}. Rough check: 2${R(5)} is about 4.5, and ${R(50)} is just over 7.`,
        },
        {
          id: 'd', html: `10`, num: 10,
          setback: `You set the dial to 10. A speaker crackles: Vark, recorded, sighing. Just sighing. It goes on for a while.`,
          why: `You split 50 as 25 + 25 and took the root of each piece: 5 + 5. Roots split across <i>multiplying</i>, never across adding. ${R('a &times; b')} = ${R('a')} &times; ${R('b')} is always true; ${R('a + b')} = ${R('a')} + ${R('b')} is not. Check: if ${R(50)} were 10, then 10 &times; 10 would be 50.`,
        },
        {
          id: 'e', html: `25`, num: 25,
          setback: `You set the dial to 25. Nothing happens, and then a tiny mechanical hand comes out of the door and wags one finger at you.`,
          why: `25 is half of 50. A square root asks a different question: what number times <i>itself</i> makes 50? 25 &times; 25 is 625. Split off a perfect square instead: 50 = 25 &times; 2, so ${R(50)} = ${R(25)} &times; ${R(2)} = 5${R(2)}.`,
        },
      ],
      win: [
        `5${R(2)}. The dial settles and the vault door opens like it weighs nothing.`,
        `Inside, on a velvet stand, under a glass case: the 1987 trophy. The case has one last lock. It is voice-activated. Vark wants you to say the answer out loud.`,
      ],
    },
    {
      id: 'case',
      title: 'The Glass Case',
      story: [
        `A card on the case reads: <i>"State this number properly. I will not have a root in the basement of a fraction. &mdash; L.V."</i>`,
        `"The basement," says Dez. "He means the bottom."`,
        `"We know what he means, Dez."`,
      ],
      ask: `Rewrite ${F(6, R(2))} with no root on the bottom, fully simplified.`,
      truth: 6 / S2,
      similar: `<b>A similar one:</b> ${F(10, R(5))}. Multiply by a carefully chosen 1: ${F(R(5), R(5))}. It is 1, so the amount cannot change. Top: 10${R(5)}. Bottom: ${R(5)} &times; ${R(5)} = 5, because that is what a square root <i>means</i>. So you have ${F(`10${R(5)}`, 5)}, and 10 &divide; 5 = 2, leaving 2${R(5)}.`,
      options: [
        { id: 'a', html: `3${R(2)}`, num: 3 * S2, right: true },
        {
          id: 'f', html: F(`6${R(2)}`, 2), num: 6 * S2 / 2, near: true,
          setback: `The case says <i>"Warmer."</i> in Vark's voice. It does not open.`,
          why: `This is the right amount, and the root is out of the basement. Vark also wants it simplified: 6 on top and 2 on the bottom share a factor of 2. 6 &divide; 2 = 3.`,
        },
        {
          id: 'b', html: `6${R(2)}`, num: 6 * S2,
          setback: `You say "six root two". The case says <i>"That is twice what I asked for,"</i> and a spotlight comes on, pointing at you personally.`,
          why: `You multiplied the top by ${R(2)} and let the bottom just disappear. Multiplying only the top changes the amount: you doubled it. The legal move is to multiply by 1, wearing the costume ${F(R(2), R(2))}. Top: 6${R(2)}. Bottom: ${R(2)} &times; ${R(2)} = 2. That is ${F(`6${R(2)}`, 2)} = 3${R(2)}. Rough check: 6 &divide; 1.41 is about 4.2, and 3 &times; 1.41 is about 4.2. But 6${R(2)} is about 8.5.`,
        },
        {
          id: 'c', html: `3`, num: 3,
          setback: `You say "three". The case plays a recording of an audience going "ooooh", the bad kind.`,
          why: `The bottom turned into 2 and the top stayed 6. Either the root sign got dropped (${R(2)} is about 1.41, not 2), or the bottom got multiplied by ${R(2)} and the top did not. Whatever you do to the bottom you must do to the top, so that all together you multiplied by 1: ${F(6, R(2))} &times; ${F(R(2), R(2))} = ${F(`6${R(2)}`, 2)} = 3${R(2)}.`,
        },
        {
          id: 'd', html: R(3), num: Math.sqrt(3),
          setback: `You say "root three". The case does not even respond. Wrench pats your shoulder.`,
          why: `You pulled the 6 under the root with the 2 and divided: ${R('6 &divide; 2')}. But the 6 was never under a root. Only things that are both under roots can merge like that. Leave the 6 alone and multiply by ${F(R(2), R(2))}, which is 1: you get ${F(`6${R(2)}`, 2)} = 3${R(2)}. Rough check: ${F(6, R(2))} is about 4.2, and ${R(3)} is about 1.7.`,
        },
      ],
      win: [
        `"Three root two," you say. The glass lifts.`,
        `Wrench has the trophy in the bag in four seconds. You are back down the vent line in ninety. Dez has the engine running.`,
        `It is only when you are six blocks away that Wrench turns the trophy over. Taped to the base is an envelope, and on the envelope, in handwriting you now know very well:`,
        `<i>"Well done. Now come and get the other one."</i>`,
      ],
    },
  ],
};

// Likely working behind each wrong answer (`guess`, slip marked with B) and the
// same lines done correctly (`fix`, the changed part marked with G).
const B = (x) => `<mark class="bad">${x}</mark>`;
const G = (x) => `<mark class="good">${x}</mark>`;
const A = (x) => ` <span class="ann">${x}</span>`;
const T = '&times;';
const CASE_FIX = [
  `${F(6, R(2))} ${T} ${G(F(R(2), R(2)))} = ${F(`6${R(2)}`, G(2))}${A(`${R(2)} ${T} ${R(2)} = 2`)}`,
  `= ${G(`3${R(2)}`)}${A('6 &divide; 2 = 3')}`,
];
const DIAL_FIX = [
  `${R(50)} = ${R(`25 ${T} 2`)}`,
  `= ${G(R(25))} ${T} ${R(2)}`,
  `= ${G(5)}${R(2)}`,
];
// Written-out balance working: each row is [left, right]; `op: true` rows are the
// "do this to both sides" lines, drawn in green with a rule under them.
const BAL = (rows) => `<span class="bal">${rows.map(([l, rt, op]) =>
  `<span class="l${op ? ' op' : ''}">${l}</span><span class="m${op ? ' op' : ''}">${op ? '&nbsp;' : '='}</span><span class="r${op ? ' op' : ''}">${rt}</span>`).join('')}</span>`;
const ELEV_FIX = [
  BAL([
    [`6 + 4x`, `2${X2}`],
    [`${M} 4x`, `${M} 4x`, true],
    [`6`, `2${X2} ${M} 4x`],
    [`${M} 6`, `${M} 6`, true],
    [`0`, `2${X2} ${M} 4x ${M} 6`],
    [`&divide; 2`, `&divide; 2`, true],
    [`0`, `${G(`${X2} ${M} 2x ${M} 3`)}`],
  ]),
  `${X2} ${M} 2x ${M} 3 = 0${A('same equation, sides swapped')}`,
];
const ELEV_FIX2 = [
  BAL([
    [`6 + 4x`, `2${X2}`],
    [`&divide; 2`, `&divide; 2`, true],
    [`3 + 2x`, `${X2}`],
    [`${M} 2x`, `${M} 2x`, true],
    [`3`, `${X2} ${M} 2x`],
    [`${M} 3`, `${M} 3`, true],
    [`0`, `${G(`${X2} ${M} 2x ${M} 3`)}`],
  ]),
];
const ELEV_QUICK = `<p>Once the long way is solid, do both subtractions in one line. Anything that leaves one side turns up on the other side with its sign flipped, <i>because</i> you subtracted it from both:</p>
  <div class="work"><div>6 + 4x = 2${X2}</div><div>0 = 2${X2} ${G(`${M} 4x ${M} 6`)}</div><div>0 = ${X2} ${M} 2x ${M} 3${A('halve every term')}</div></div>`;
const DOOR_FIX = [
  BAL([
    [`${M}3(x ${M} 4)`, `18`],
    [`${M}3x ${G('+ 12')}`, `18`],
    [`${M} 12`, `${M} 12`, true],
    [`${M}3x`, `6`],
    [`&divide; (${M}3)`, `&divide; (${M}3)`, true],
    [`x`, `${G(`${M}2`)}`],
  ]),
];
const DOOR_QUICK = `<p>Once the long way is solid, the same moves fit in three short lines, with the "both sides" steps done in your head:</p>
  <div class="work"><div>${M}3x + 12 = 18</div><div>${M}3x = 6</div><div>x = ${M}2</div></div>`;
const WORK = {
  cable: {
    b: {
      guess: [`4 ${T} ${F(1, 3)} = ${F(`4 ${T} 1`, B(`4 ${T} 3`))}`, `= ${F(4, B(12))}`],
      fix: [`4 ${T} ${F(1, 3)} = ${F(`4 ${T} 1`, G(3))}`, `= ${F(4, G(3))}`],
    },
    c: {
      guess: [`4 ${T} ${F(1, 3)} = ${F(1, B(`4 ${T} 3`))}`, `= ${F(1, B(12))}`],
      fix: [`4 ${T} ${F(1, 3)} = ${F(G(`4 ${T} 1`), G(3))}`, `= ${F(G(4), G(3))}`],
    },
    d: {
      guess: [`4 ${T} ${F(1, 3)} = 4 ${B(`${T} 3`)}`, `= ${B(12)}`],
      fix: [`4 ${T} ${F(1, 3)} = ${G(F(`4 ${T} 1`, 3))}`, `= ${G(F(4, 3))}`],
    },
    e: {
      guess: [`4 ${T} ${F(1, 3)} = ${B(`4${F(1, 3)}`)}`],
      fix: [`4 ${T} ${F(1, 3)} = ${G(`${F(1, 3)} + ${F(1, 3)} + ${F(1, 3)} + ${F(1, 3)}`)}`, `= ${G(F(4, 3))}`],
    },
  },
  door: {
    b: {
      guess: [`${M}3x ${B(`${M} 12`)} = 18`, `${M}3x = ${B(30)}`, `x = ${B(`${M}10`)}`],
      fix: DOOR_FIX, quick: DOOR_QUICK,
    },
    c: {
      guess: [`${M}3x ${B(`${M} 4`)} = 18`, `${M}3x = ${B(22)}`, `x = ${B(`${M}${F(22, 3)}`)}`],
      fix: DOOR_FIX, quick: DOOR_QUICK,
    },
    d: {
      guess: [`${M}3x + 12 = 18`, `${M}3x = 6`, `x = ${B(2)}`],
      fix: DOOR_FIX, quick: DOOR_QUICK,
    },
    e: {
      guess: [`x ${M} 4 = ${B(6)}`, `x = ${B(10)}`],
      fix: DOOR_FIX, quick: DOOR_QUICK,
    },
  },
  elevator: {
    b: {
      guess: [`6 + 4x = 2${X2}`, `2${X2} ${B('+ 4x + 6')} = 0`, `${X2} ${B('+ 2x + 3')} = 0`],
      guess2: [`3 + 2x = ${X2}${A('divided by 2: fine')}`, `${X2} ${B('+ 2x + 3')} = 0`],
      fix: ELEV_FIX, fix2: ELEV_FIX2, quick: ELEV_QUICK,
    },
    c: {
      guess: [`2${X2} ${M} 4x ${M} 6 = 0`, `${X2} ${B(`${M} 4x ${M} 6`)} = 0`],
      fix: ELEV_FIX, quick: ELEV_QUICK,
    },
    d: {
      guess: [`2${X2} ${M} 4x ${M} 6 = 0`, `${X2} ${M} 2x ${B(`${M} 6`)} = 0`],
      fix: ELEV_FIX, quick: ELEV_QUICK,
    },
    e: {
      guess: [`2${X2} ${M} 4x ${B('+ 6')} = 0`, `${X2} ${M} 2x ${B('+ 3')} = 0`],
      guess2: [`3 + 2x = ${X2}${A('divided by 2: fine')}`, `${X2} ${M} 2x ${B('+ 3')} = 0`],
      fix: ELEV_FIX, fix2: ELEV_FIX2, quick: ELEV_QUICK,
    },
  },
  dial: {
    b: { guess: [`${R(50)} = ${R(`25 ${T} 2`)}`, `= ${B(25)}${R(2)}`], fix: DIAL_FIX },
    c: { guess: [`${R(50)} = ${R(`25 ${T} 2`)}`, `= ${B(2)}${R(B(5))}`], fix: DIAL_FIX },
    d: {
      guess: [`${R(50)} = ${R(`25 ${B('+')} 25`)}`, `= ${R(25)} ${B('+')} ${R(25)}`, `= ${B(10)}`],
      fix: [`${R(50)} = ${R(`25 ${G(T)} 2`)}`, `= ${R(25)} ${G(T)} ${R(2)}`, `= ${G(`5${R(2)}`)}`],
    },
    e: { guess: [`${R(50)} = 50 ${B('&divide; 2')}`, `= ${B(25)}`], fix: DIAL_FIX },
  },
  case: {
    f: {
      guess: [`${F(6, R(2))} ${T} ${F(R(2), R(2))} = ${F(`6${R(2)}`, 2)}${A('all correct so far')}`],
      fix: [`${F(`6${R(2)}`, 2)} = ${G(`3${R(2)}`)}${A('6 &divide; 2 = 3')}`],
    },
    b: { guess: [`${F(6, R(2))} ${T} ${B(R(2))} = ${B(`6${R(2)}`)}`], fix: CASE_FIX },
    c: { guess: [`${F(6, R(2))} = ${F(6, B(2))}`, `= ${B(3)}`], fix: CASE_FIX },
    d: { guess: [`${F(6, R(2))} = ${B(R('6 &divide; 2'))}`, `= ${B(R(3))}`], fix: CASE_FIX },
  },
};
for (const p of episode.problems) for (const o of p.options) Object.assign(o, WORK[p.id][o.id]);

// Plain-text labels for the copyable feedback report.
const TXT = {
  cable: { a: '4/3', b: '4/12', c: '1/12', d: '12', e: '4 1/3' },
  door: { a: 'x = -2', b: 'x = -10', c: 'x = -22/3', d: 'x = 2', e: 'x = 10' },
  elevator: { a: 'x^2 - 2x - 3 = 0', b: 'x^2 + 2x + 3 = 0', c: 'x^2 - 4x - 6 = 0', d: 'x^2 - 2x - 6 = 0', e: 'x^2 - 2x + 3 = 0' },
  dial: { a: '5 sqrt(2)', b: '25 sqrt(2)', c: '2 sqrt(5)', d: '10', e: '25' },
  case: { a: '3 sqrt(2)', f: '6 sqrt(2) / 2', b: '6 sqrt(2)', c: '3', d: 'sqrt(3)' },
};
for (const p of episode.problems) for (const o of p.options) o.txt = TXT[p.id][o.id];
