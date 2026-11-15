// Episode 3: "Open House". Vark comes to the school. Story text, the waves, and the knobs.
//
// WHAT TO CHANGE AFTER READING A REPORT
// Everything a teacher might want to adjust is in TUNING and in `waves` below; ep3.js only
// follows them. The episode also adjusts itself: before each wave it reads this device's log of
// typed answers (story/mastery.js) and sends more drones for the skills that are not solid yet.
//
//   A skill needs more practice than the game is giving      TUNING.force = { solve: 4 }
//   A skill is done and should not come back                 TUNING.force = { simplify: 0 }
//   Waves feel too tense / not tense enough                  TUNING.pack, TUNING.lane, TUNING.shutters (live mode: TUNING.live)
//   Episode 3b without time pressure on the math             TUNING.live.think = 0
//   Add or drop a wave, or change which skills it reviews    the `waves` list
//   A new skill                                              add it to siege3-skills.js, then name it in a wave's `fresh`
export const TUNING = {
  // The corridor plays two ways, and the menu offers each as its own episode. Everything else
  // (scouts, what a wave sends, the report) is shared.
  //   3a 'turns'  the drones step once per answer entered; one straight corridor
  //   3b 'live'   real time on a winding path: towers shoot, formations hide behind a plate, and
  //            the corridor slows down (TUNING.live.think) while the keypad is open. This is the mode
  //            for speed: the scouts still teach untimed, and a miss is still explained untimed.
  live: {
    size: 3, // drones in a formation (one plate per formation)
    hp: [4, 6, 7, 9], // hits a drone takes, by wave: later waves need more towers
    bossHp: 10, // hits per plate for the big one
    speed: 24, // pixels a second along the path (the path is about 1040 long)
    gap: 12, // seconds between formations
    lives: 6, // drones that can reach the case before the wave is lost
    surge: 140, // how far a formation jumps forward on a wrong answer
    range: 80, rate: 0.8, // launcher reach in pixels, and seconds between its shots
    slow: 0.45, // speed of a drone over floor wax, as a share of normal
    fanPush: 160, // how far back a fan blows a drone (each fan gets one go at each drone)
    think: 0.25, // how fast the corridor runs while a plate is open, as a share of normal. 0 stops it: no time pressure at all.
    startParts: 6,
    retryParts: 3, // extra parts found in the cart after a lost wave
  },
  // Drones per review skill in a wave, by where the skill stands on this device when the wave starts
  // (see `status` in mastery.js). "none" means no typed answers at all, e.g. episode 2 was skipped.
  review: { none: 3, practicing: 3, fluent: 2, mastered: 1 },
  // A review skill at one of these levels is re-taught first: a multiple-choice scout for each
  // shape of problem the wave is about to ask.
  reteach: ['none', 'practicing'],
  fresh: 4, // typed drones for a skill the wave introduces (it always gets a scout per shape first)
  minWave: 4, // a wave is padded up to this many drones, so a student who has mastered everything still gets a wave
  /** @type {Record<string, number>} */
  force: {}, // skill -> exact number of drones in every wave that reviews it, whatever the log says
  lane: 6, // squares from the far doors to the trophy case
  pack: 3, // drones already in the corridor when a wave starts
  shutters: 3, // drones that can reach the case before the wave is lost
  retryLane: 1, // each time a wave is lost, the corridor gets this much longer for the retry
  startParts: 3,
  sockets: [1, 2, 3, 4], // squares where a tower can be built
  bossPlates: 3,
};

export const content = {
  id: 'siege3',
  title: 'Open House',
  titleLive: 'Open House, Rush Hour',
  intro: [
    `Three weeks of nothing. Then Dez turns up at lunch with a delivery note she should not have.`,
    `"Forty crates. Addressed to the school roof. Signed for by a 'Mr L. V. Arkwright', who does not exist." She puts it on the table. "He said next time he comes to us. It is next time."`,
    `That night the three of you are in the main corridor with the lights off. At the far end are the double doors to the yard. At this end is the trophy case: the 1987 state championship, and next to it a 1998 Tri-County Math Bowl cup with a label in Dez's handwriting that says <i>ON LOAN</i>.`,
    `Something on the roof starts to hum.`,
    `The first one comes through the letterbox. It is the size of a pizza box, it flies, and it has a brass plate bolted to the front with a problem engraved on it.`,
    `Wrench catches it in a mop bucket and has the back off in ten seconds. "Oh, he cannot help himself," she says. "Look at the firmware. A drone with a solved plate has nothing left to do. It folds up. He made the off switch a math problem."`,
    `The PA system crackles. <i>"Good evening,"</i> says Lucian Vark, from every speaker in the building. <i>"I am not a barbarian. A problem deserves an attempt, so my machines wait for one. Take all the time you like. But each answer you enter, right or wrong, they come one locker closer. Do try to make them count."</i>`,
    `"So we do not guess," says Dez.`,
    `"We do not guess," says Wrench, and hands you the keypad.`,
  ],
  howToLive: [
    `<b>How the corridor works.</b> Drones fly through the school in formations. Each formation hides behind one brass plate, and while the plate is up nothing can hurt it.`,
    `Tap a formation to open its plate. <b>While a plate is open everything slows to a crawl, but it does not stop.</b> Quick and right is what wins; quick and wrong is worse than slow.`,
    `Solve the plate and the shields drop: your towers do the rest. Get it wrong and that formation surges forward with a new plate. Nothing moves while you read what went wrong.`,
    `The green bars on the trophy case are fire shutters. Each drone that gets there uses one up.`,
  ],
  howTo: [
    `<b>How the corridor works.</b> Nothing moves on a clock. The drones take one step each time you enter an answer.`,
    `A right answer folds up the drone you aimed at. A wrong answer gives that drone new numbers. Either way, the rest come one locker closer.`,
    `Tap a drone to aim at it. The green bars on the trophy case are fire shutters: each drone that gets there uses one up. When they are gone, the wave starts again with more room.`,
  ],
  waves: [
    {
      id: 'w1', title: 'First Bell', review: ['dist', 'solve'], fresh: [],
      story: [
        `The hum on the roof splits into a lot of smaller hums.`,
        `<i>"I thought we would begin with something familiar,"</i> says the PA. <i>"Floors twenty and twenty-five. You remember them. I certainly do."</i>`,
        `"Brackets and equations," says Dez, reading plates through binoculars. "The ones with the minus signs."`,
      ],
      won: [`The last drone folds itself into a neat square and drops onto the lino. Dez stacks it with the others. "They are quite tidy," she says. "I will give him that."`],
      lost: [`One drone too many thumps into the trophy case. Wrench hits the red button by the staff room and steel fire shutters slam down over the glass. The drones bump against them, confused, and drift back up the corridor to start again.`],
    },
    {
      id: 'w2', title: 'The Root Cellar Sends Its Regards', review: ['simplify', 'rationalize'], fresh: [],
      story: [
        `<i>"My gardeners send their regards,"</i> says the PA.`,
        `The next drones have little plant labels cable-tied to them.`,
        `"Square roots," says Wrench. "He has sent us his greenhouse." She cracks her knuckles. "Simplest form, nothing left under the root that should not be there, and no roots on the bottom."`,
      ],
      won: [`The corridor goes quiet. One folded drone still has its plant label on. It says <i>basil</i>.`],
      lost: [`Too many of them reach the case before you can stop them. Wrench drops the fire shutters again. "Slower," she says. "He said it himself. The clock is not the problem."`],
    },
    {
      id: 'w3', title: 'New Material', review: [], fresh: ['frac'],
      story: [
        `<i>"You have been inside my building twice,"</i> says the PA. <i>"So you have seen my locks. You have not seen my fractions."</i>`,
        `The plates on these drones are different. Two fractions and a plus or a minus between them.`,
        `"I know this one," says Wrench. "It is the same trick as the root on the bottom. You cannot add a half and a sixth while they are different sizes. So you multiply the half by one. Not a plain one. A one dressed up as three over three. Same amount, new name: three sixths. Now they are the same size and you just count them."`,
        `"A cleverly chosen one," says Dez.`,
        `"Every time," says Wrench.`,
      ],
      won: [`"He is going to be so cross about the fractions," says Dez happily.`],
      lost: [`Shutters. The drones retreat. "Same size pieces first," says Wrench. "Then count the tops. The bottom is just the name of the piece."`],
    },
    {
      id: 'w4', title: 'The Chairman', review: 'weakest', fresh: [], boss: true,
      story: [
        `The hum on the roof stops. Then something much larger starts up.`,
        `<i>"I had hoped not to need this,"</i> says the PA, in the voice of a man who has been looking forward to it all week.`,
        `It comes through the double doors sideways because it does not fit the other way. It is the size of a dining table. It has a small brass plaque that says <i>THE CHAIRMAN</i> and, bolted to the front, not one plate but a stack of them.`,
        `"It is slow," says Wrench. "But it has a stack of plates, and you have to get through every one."`,
        `A few ordinary drones tuck in ahead of it, like ducklings.`,
      ],
      won: [
        `The last plate goes dark. The Chairman hangs in the air for a moment, then folds: in half, in half again, and again, until it is the size of a briefcase. It lands on the lino with a polite click.`,
      ],
      lost: [`Shutters. The Chairman backs out through the double doors, taking part of the frame with it, and lines up for another go.`],
    },
  ],
  chapterBreak: {
    title: 'End of chapter 1',
    text: [
      `The hum on the roof winds down.`,
      `"They are charging," says Dez, checking the delivery note. "Eight hours a charge. He will be back tomorrow night."`,
      `Wrench is already asleep against the lost property box.`,
      `<b>This is a good place to stop for today.</b> Your progress is saved on this device. Tomorrow's drones carry something new, and what you do on a different day counts for more.`,
    ],
    stopped: [
      `Saved. Close the page whenever you like.`,
      `When you come back, open the same page on this device and you will be right here, in the corridor.`,
    ],
  },
  ending: {
    title: 'Lights On',
    text: [
      `Dez turns the corridor lights on. There are folded drones stacked against the lockers like pizza boxes after a party.`,
      `The PA crackles one more time. Lucian Vark does not sound like he is smiling.`,
      `<i>"Forty machines,"</i> he says. <i>"Forty. And a Chairman."</i>`,
      `A long pause.`,
      `<i>"Very well. No more doors, and no more drones. The Tri-County Math Bowl is in the spring. This year it has a new sponsor, who has also, as it happens, entered a team. In public. With judges."</i>`,
      `<i>"Bring a pencil."</i>`,
      `The speakers click off.`,
      `"Did he just challenge us to a quiz?" says Wrench.`,
      `"He challenged us to a quiz," says Dez. She looks at the 1998 cup, then at you. "We are going to need a bigger case."`,
    ],
  },
  // Episode 3b tells its own story: the night after, with Vark's drones rewired for practice.
  // Anything not given here falls back to the 3a text above.
  live: {
    intro: [
      `"The Math Bowl has a buzzer," says Dez.`,
      `It is the night after the open house. The three of you are back in the main corridor. Stacked against the lockers are forty folded drones and one folded Chairman.`,
      `"You were right every time it mattered," she says. "You were also slow. Vark's team will not be slow. In the Bowl, the first hand on the buzzer gets the question."`,
      `Wrench has been busy. Every drone has its back off and a new chip in it. "They are ours now," she says. "Mostly. I have set them to fly round the whole school, so there is room to work. And I gave them shields, or this would be too easy." She pats a machine made from a leaf blower and a bucket of tennis balls. "Solve the plate, the shield drops, and this does the rest."`,
      `"Mostly ours?" says Dez.`,
      `"I could not get the part that goes for the trophy case out of the firmware," says Wrench. "So the shutters are real. Also, they do not stop and wait for you any more. While you work on a plate they slow to a crawl. That is all the mercy I left in."`,
      `Dez picks up the PA microphone and does a voice. <i>"Good evening. I am Lucian Vark, and I am a very sore loser."</i>`,
      `"Right first," says Wrench, and hands you the keypad. "Then quick."`,
    ],
    waves: {
      w1: {
        story: [
          `Wrench throws a switch, and the hum starts up on the roof exactly as it did last night.`,
          `<i>"Floors twenty and twenty-five,"</i> says Dez into the microphone, in the voice. <i>"You remember them. I certainly do."</i>`,
          `"Brackets and equations," says Wrench. "You know these. So this time, keep an eye on the corridor."`,
        ],
        won: [`The last drone folds up and drops. Wrench puts away a stopwatch she has definitely not been holding. "Again," she says. "With roots."`],
        lost: [`Too many get through. The shutters slam down, and the drones drift back up to the roof to line up again. "That is what practice is for," says Dez.`],
      },
      w2: {
        story: [
          `<i>"My gardeners send their regards,"</i> says Dez. The voice is getting better, which worries everyone.`,
          `"Square roots," says Wrench. "Simplest form, and no roots on the bottom. You know your squares by now. See how fast you can spot one hiding inside a number."`,
        ],
        won: [`Quiet. One drone still has its plant label on. Somebody has crossed out <i>basil</i> and written <i>ours</i>.`],
        lost: [`Shutters. "Fast is no use if it is wrong," says Wrench. "A wrong answer costs you more corridor than a slow one. I built it that way on purpose."`],
      },
      w3: {
        story: [
          `"Fractions," says Wrench. "Same trick as last night. You cannot add them while the pieces are different sizes, so you multiply one of them by a well-chosen one. Three over three. Five over five. Same amount, new name."`,
          `"The trick now is choosing the one quickly," says Dez. "Look at the two bottoms first. Often one of them already fits inside the other."`,
        ],
        won: [`"Fractions, at speed," says Dez. "He is going to hate that."`],
        lost: [`Shutters. "Same size pieces first," says Wrench. "Then count the tops. Do not skip that step to save a second."`],
      },
      w4: {
        story: [
          `"I unfolded it," says Wrench. "I had to know whether it would fold back."`,
          `The Chairman comes through the double doors sideways, taking the rest of the frame with it. A few ordinary drones tuck in ahead of it, like ducklings.`,
          `"It still has its stack of plates," says Wrench. "Each one you solve, it drops its shield for a while, then puts it back up. You have to get through every one."`,
        ],
        won: [`The last plate goes dark and the Chairman folds: in half, in half again, down to the size of a briefcase. "It does fold back," says Wrench, with some relief.`],
        lost: [`Shutters. The Chairman reverses out through the hole where the doors used to be, and lines up for another go.`],
      },
    },
    breakText: [
      `Wrench throws the switch and the hum winds down.`,
      `"They need eight hours on charge," she says. "So do you."`,
      `<b>This is a good place to stop for today.</b> Your progress is saved on this device. What you do on a different day counts for more.`,
    ],
    ending: {
      title: 'Buzzer',
      text: [
        `Wrench kills the power. Forty-one machines settle onto the lino, and the corridor is quiet.`,
        `Dez puts the microphone down. "Right, and quick," she says. "That is a team."`,
        `"That is a third of a team," says Wrench. "He is bringing people who have done nothing else for a year."`,
        `"Then we have until spring," says Dez. She looks at the 1998 cup, and then at the empty space in the case beside it.`,
        `"Bring a pencil," she says.`,
      ],
    },
  },
  towers: [
    { id: 'glue', name: 'Glue mat', cost: 3, what: 'A drone that lands on this locker is stuck there for one extra move.' },
    { id: 'fan', name: 'Gym fan', cost: 5, what: 'Every time you solve a plate, a drone hovering over the fan is blown back two lockers.' },
  ],
  towersLive: [
    { id: 'launcher', name: 'Ball launcher', cost: 3, what: 'From the PE store. Fires tennis balls at any drone in reach whose shield is down.' },
    { id: 'wax', name: 'Floor wax', cost: 3, what: 'Every drone passing near it moves at half speed, shield or no shield. Does no damage.' },
    { id: 'fan', name: 'Gym fan', cost: 5, what: 'The first time a drone comes near it, the drone is blown a long way back down the corridor. Does no damage.' },
  ],
  spare: { cost: 4, what: 'One more fire shutter: one more drone can reach the case before the wave is lost.' },
};
