// Episode 2: "The Other One". Story text only; the problems are generated in
// heist2-skills.js, so nothing here mentions a specific number from a lock.
// Four floors, one skill each. A floor is a door for every shape of problem its
// lock can ask (multiple choice, with explanations), then the floor lock (typed
// answers, three in a row). Nothing appears on a lock that a door has not taught.
import { R, F } from './pilot.js';

export const content = {
  id: 'heist2',
  title: 'The Other One',
  intro: [
    `The note taped to the trophy said: <i>"Well done. Now come and get the other one."</i>`,
    `It took Dez two days to work out what the other one is. It is the 1998 Tri-County Math Bowl cup. Vark's own. The thing he loves most in the world. Your school came second that year, by one question.`,
    `"He is daring us," says Dez.<br>"It is a trap," says Wrench.<br>"It is a trap with a trophy in it," says Dez, and that settles it.`,
    `The cup is in the penthouse, floor 35. Between you and it are four floors, and Vark has rebuilt every one of them since your last visit.`,
    `<b>What is new:</b> each floor has doors, and then one <b>floor lock</b>. Doors work like last time: pick an answer, and a wrong one gets you an explanation. A floor lock has no choices. You type the answer, and it takes <b>three right in a row</b> to open.`,
    `<b>Also new:</b> every lock you open, Wrench strips for <b>parts</b>. Parts buy gear at her workbench. Opening a door on the first try is worth the most.`,
    `Paper and pencil. Same as before.`,
  ],
  floors: [
    {
      id: 'f20', name: 'Floor 20', skill: 'dist', runs: ['stairs', 'archive'],
      doors: [
        {
          id: 'f20a', title: 'The Archive Door', form: 0,
          story: [
            `Floor 20. A frosted glass door that says ARCHIVE, and under it a brass plate. You already know what is on the plate.`,
            `"There is a minus sign outside the brackets," you say.`,
            `"Is that bad?" says Dez.`,
            `"It is how he got me last time."`,
          ],
          setbacks: [
            `The plate plays a sad trombone. It is a longer sad trombone than last time. He has had it re-recorded.`,
            `A drawer in the wall slides open, hands you a small card that says <i>"No."</i>, and slides shut.`,
            `The door speaks, in Vark's voice: <i>"Signs, my friend. We have discussed signs."</i> Dez says a word you are not allowed to say.`,
            `Every light on the floor turns off, then on again. Nothing else happens. It is somehow worse.`,
          ],
          win: [
            `The glass door slides open. Wrench already has the back off the lock. "Parts," she says, pocketing something. "Good ones."`,
            `Inside: filing cabinets, floor to ceiling, as far as you can see.`,
          ],
        },
        {
          id: 'f20b', title: 'The Cabinet Row', form: 1,
          story: [
            `Halfway down the archive, a steel shutter blocks the aisle. The lock on it is smaller and meaner.`,
            `"This one has no number in front of the brackets at all," you say. "Just a minus sign."`,
            `"So it does nothing?" says Dez.`,
            `"No. It does plenty."`,
          ],
          setbacks: [
            `The shutter rattles up six inches, then drops. From somewhere above, a recording of polite applause.`,
            `A filing cabinet next to you opens by itself. Every folder in it is labelled <i>"People who forgot the minus sign."</i> It is a full cabinet.`,
            `The lock prints a small receipt. It says <i>"Thank you for trying."</i>`,
            `A sprinkler above you goes off for exactly one second.`,
          ],
          win: [
            `The shutter rolls all the way up and stays up.`,
            `Past it the aisle narrows, and a heavy reading desk has been bolted to the floor right across it. There is a lock on the desk.`,
          ],
        },
        {
          id: 'f20c', title: 'The Reading Desk', form: 2,
          story: [
            `The desk lamp turns itself on as you walk up.`,
            `This lock has something the last two did not: a plain number sitting out in front, then the minus sign, then the brackets.`,
            `"He wants me to do the subtraction first," you say. "Front number minus the next number, then multiply."`,
            `"And you are not going to?" says Dez.`,
            `"Multiplying comes first. The brackets get multiplied before that front number is allowed anywhere near them."`,
          ],
          setbacks: [
            `The desk lamp turns itself off. Then on. Then off. It is flashing something in Morse code. Wrench says it is the word "no".`,
            `A drawer in the desk shoots open and hits you in the hip. Inside is one sheet of paper: <i>"Order of operations. Look it up."</i>`,
            `The lock makes a long, slow, descending whistle.`,
            `Somewhere in the archive, one filing cabinet falls over. You are fairly sure that was on purpose.`,
          ],
          win: [
            `The bolts holding the desk pull back into the floor and the whole thing rolls aside on hidden wheels.`,
            `At the end of the aisle is the way to the next floor: a round steel door with three brass tumblers in a row. No answer choices on it anywhere. Just a keypad.`,
          ],
        },
      ],
      lock: {
        title: 'Floor Lock 20',
        story: [
          `Engraved above the keypad: <i>"Anyone can be lucky once. &mdash; L.V."</i>`,
          `"Three tumblers," says Wrench. "Each right answer sets one. A wrong answer drops all of them. And there is nothing to pick from. You type it."`,
          `"What if I keep getting it wrong?"`,
          `"Then I get the drill out. I would rather not. Drilled locks have no parts in them."`,
        ],
        open: [
          `The third tumbler drops into place with a sound like a very expensive car door. The round door swings open.`,
          `"Three in a row," says Dez. "He is going to be so annoyed."`,
        ],
        bypass: [
          `"Okay. Stand back." Wrench gets the drill out. It takes four loud minutes, and the lock is scrap when she is done.`,
          `"No parts in that one," she says. "We will see this kind again. You will get it."`,
        ],
      },
    },
    {
      id: 'f25', name: 'Floor 25', skill: 'solve', runs: ['ducts', 'servers'],
      doors: [
        {
          id: 'f25a', title: 'The Duct Hatch', form: 0,
          story: [
            `The duct ends at a hatch with a keypad on the inside, which is a strange place for a keypad.`,
            `A sticker next to it: <i>"Enter x. Check your answer in the original. I always did. &mdash; L.V."</i>`,
            `"That is actually good advice," you say.`,
            `"Do not tell him that," says Wrench.`,
          ],
          setbacks: [
            `The hatch stays shut. A fan somewhere behind you speeds up, like it is laughing.`,
            `The keypad shows a frowning face made of little green dots. It holds the frown for a long time.`,
            `A small speaker says <i>"x is not that."</i> and then, after a pause, <i>"x has never been that."</i>`,
            `The duct gets noticeably warmer. Wrench looks at you. You look at the keypad.`,
          ],
          win: [
            `The hatch pops. You drop into a room that hums.`,
            `Rows of black cabinets with blinking lights, colder than outside, stretching off in both directions.`,
          ],
        },
        {
          id: 'f25b', title: 'The Cage', form: 2,
          story: [
            `The server hall has a cage across the middle of it. The cage has a lock. The lock has x on both sides of the equals sign.`,
            `"He put x on both sides," you tell Dez.`,
            `"Can he do that?"`,
            `"He can. You get them all onto one side. Whatever you do, you do to both sides."`,
          ],
          setbacks: [
            `The cage door buzzes. Every blinking light in the room turns red for one second, all at once, then goes back to pretending nothing happened.`,
            `A screen on the nearest cabinet shows a single line: <i>"Did you do it to BOTH sides?"</i>`,
            `The lock makes a sound like a disappointed uncle.`,
            `Somewhere a printer starts up. It prints for a while. You decide not to go and look.`,
          ],
          win: [
            `The cage door swings open. Dez exhales into the microphone for about four seconds.`,
            `Past the cage is the lift lobby. A velvet rope on two brass posts runs across it. The rope has a lock. Of course the rope has a lock.`,
          ],
        },
        {
          id: 'f25c', title: 'The Velvet Rope', form: 1,
          story: [
            `You look at the lock on the rope for a while.`,
            `"This is the one from the service door," you say. "Brackets, a negative number outside them, and an equals sign."`,
            `"The one that got you," says Dez.`,
            `"The one that got me."`,
            `"You could step over the rope," says Wrench. Nobody steps over the rope.`,
          ],
          setbacks: [
            `The rope stays clipped. A small brass plaque on the post flips over. The back says <i>"Again?"</i>`,
            `One of the brass posts plays the sad trombone. He has put a speaker in a post.`,
            `The lock shows the same equation again, slightly bigger, as if you might not have seen it properly.`,
            `The lift behind the rope goes "ding", opens, waits, and closes again without you.`,
          ],
          win: [
            `The rope unclips itself and drops. Dez does a very quiet cheer.`,
            `Across the lift doors: another round steel lock, three tumblers, no choices.`,
          ],
        },
      ],
      lock: {
        title: 'Floor Lock 25',
        story: [
          `Engraved above this one: <i>"Twice is a habit. Three times is a skill. &mdash; L.V."</i>`,
          `"Same deal," says Wrench. "Three right in a row. You type x."`,
          `"Check each one in the original before you press Enter," says Dez. "The sticker said."`,
          `"You are quoting him now?"`,
          `"It was a good sticker."`,
        ],
        open: [
          `Clunk. Clunk. Clunk. The lift doors open on an empty lift with a mirror, soft music, and a small brass sign: <i>"Going up?"</i>`,
          `"I really do not like him," says Wrench, and gets in.`,
        ],
        bypass: [
          `Wrench drills it. The lift doors grind open halfway and you squeeze through.`,
          `"That kind of lock is not finished with you," she says. "Next time."`,
        ],
      },
    },
    {
      id: 'f30', name: 'Floor 30', skill: 'simplify', runs: ['cellar', 'glass'],
      doors: [
        {
          id: 'f30a', title: 'The Greenhouse Door', form: 0,
          story: [
            `Floor 30 is warm and smells like wet dirt. A sign over the door says THE ROOT CELLAR in letters made of twigs.`,
            `"It is a greenhouse on the thirtieth floor and he called it a cellar," says Dez. "Because of roots. Because of SQUARE roots."`,
            `The lock wants a square root simplified: the biggest perfect square pulled out from under the root sign, and whatever is left staying under it.`,
          ],
          setbacks: [
            `A sprinkler turns on directly above you, and only above you.`,
            `A small sign rotates out of the wall: <i>"Only perfect squares may leave the root. Everybody else stays."</i>`,
            `One of the plants appears to turn and look at you. Wrench says it is the air conditioning. She does not sound sure.`,
            `The door plays eight seconds of very calm flute music and stays shut.`,
          ],
          win: [
            `The door opens onto rows of plants in brass pots. Each pot has a little engraved label. The labels are all square roots.`,
            `"He labelled his plants in simplest radical form," says Wrench. "I want to go home."`,
          ],
        },
        {
          id: 'f30b', title: 'The Glass Walk', form: 1,
          story: [
            `A glass walkway crosses over the plants to the far wall. Halfway along is a gate.`,
            `The number under this root is bigger, and you can see more than one perfect square hiding in it.`,
            `"Take out the biggest one," you say, mostly to yourself. "If the number left under the root still has a square in it, I am not done."`,
          ],
          setbacks: [
            `The gate does not open. The glass under your feet lights up red, then goes clear again. You can see a very long way down.`,
            `A tiny speaker in the handrail says <i>"Is that the LARGEST perfect square? Is it really?"</i>`,
            `The sprinklers come on across the whole floor. The plants look thrilled.`,
            `The gate prints a ticket: <i>"Admit none."</i>`,
          ],
          win: [
            `The gate swings open. At the far end of the walkway is a round steel lock with three tumblers, and ivy growing over it, on purpose.`,
          ],
        },
      ],
      lock: {
        title: 'Floor Lock 30',
        story: [
          `Engraved above the keypad, with a small brass leaf on either side: <i>"What comes out must have been a perfect square. &mdash; L.V."</i>`,
          `Two boxes this time: the number that comes out in front of the root, and the number that stays under it.`,
          `"Three in a row," says Wrench. "You know how this goes."`,
        ],
        open: [
          `Three tumblers. The ivy pulls back by itself, which nobody mentions, and the door opens on a private staircase with a red carpet.`,
          `"Penthouse," says Dez. "One floor to go."`,
        ],
        bypass: [
          `Wrench drills through the lock and a fair amount of ivy.`,
          `"Roots are going to come up again upstairs," she says. "Watch what I do next time. Biggest square first."`,
        ],
      },
    },
    {
      id: 'f35', name: 'Penthouse', skill: 'rationalize', runs: ['hall', 'office'],
      doors: [
        {
          id: 'f35a', title: 'The Penthouse Door', form: 0,
          story: [
            `At the top of the red stairs is a door with a framed notice: <i>"HOUSE RULE: no roots on the ground floor."</i>`,
            `"The ground floor of what? We are on thirty-five," says Dez.`,
            `"Of a fraction," you say. "He means the bottom. He does not allow a square root on the bottom of a fraction."`,
            `The way to move one without changing the amount is to multiply by a cleverly chosen 1. Something like ${F(R(2), R(2))}: top and bottom the same, so it is 1, and multiplying by 1 changes nothing.`,
          ],
          setbacks: [
            `The framed notice lights up from behind. It now says <i>"HOUSE RULE"</i> in much bigger letters.`,
            `A butler's bell rings somewhere. Nobody comes. The door stays shut.`,
            `The door says, in Vark's voice: <i>"If you multiply the bottom, you multiply the top. That is not a rule of my house. That is a rule of the universe."</i>`,
            `The carpet under you slides back about two feet, taking you with it.`,
          ],
          win: [
            `The door opens on a long hall. Paintings on both walls. Every single one is of Lucian Vark holding a cup.`,
          ],
        },
        {
          id: 'f35b', title: 'The Office Door', form: 1,
          story: [
            `The last ordinary door in the building. You can see the glass case through the keyhole.`,
            `This fraction has a number sitting next to the root on the bottom.`,
            `"The plain number is not the problem," you say. "The root is. Same clever 1 as before: I multiply top and bottom by the root, and deal with the plain numbers after."`,
          ],
          setbacks: [
            `The keyhole closes like an eye.`,
            `A painting of Vark behind you clears its throat. It is a speaker. You are almost sure it is a speaker.`,
            `The lock displays: <i>"You changed the amount. I asked you to change its clothes."</i>`,
            `Nothing happens at all, for long enough that it becomes insulting.`,
          ],
          win: [
            `The office door opens without a sound.`,
            `The cup is at the far end of the room in a glass case, lit from above. Between you and it: a desk the size of a car, and one last round steel lock set into the floor in front of the case.`,
          ],
        },
      ],
      lock: {
        title: 'The Last Lock',
        story: [
          `No engraving on this one. Just a handwritten card propped against it: <i>"I did not think you would get this far. Three more. &mdash; Lucian"</i>`,
          `"He signed it with his first name," says Dez. "Is that good or bad?"`,
          `"Three in a row," says Wrench. "Then we leave. Fast."`,
        ],
        open: [
          `The third tumbler sets. The glass case rises into the ceiling.`,
          `The 1998 Tri-County Math Bowl cup is smaller than you expected. It is also much heavier.`,
          `Every alarm in the building goes off at once.`,
        ],
        bypass: [
          `Wrench looks at the lock, looks at you, and gets the drill out. The case cracks, the cup comes out, and every alarm in the building goes off at once.`,
          `"We will work on that one," she shouts over the noise. "Later!"`,
        ],
      },
    },
  ],
  chapterBreak: {
    title: 'End of chapter 1',
    text: [
      `The lift stops between 26 and 27 and the music cuts out.`,
      `"Guard change," says Dez. "The upper floors are crawling for the next few hours. There is a maintenance cupboard on 26. Get in it and stay in it."`,
      `It is a small cupboard. Wrench falls asleep sitting on a bucket in under a minute.`,
      `<b>This is a good place to stop for today.</b> Your progress is saved on this device. Chapter 2 starts with a quick check on the two kinds of lock you just opened, and it counts for more if you do it on a different day.`,
    ],
    stopped: [
      `Saved. Close the page whenever you like.`,
      `When you come back, open the same page on this device and you will be right here, in the cupboard.`,
    ],
  },
  recheck: {
    title: 'The Stairwell Panel',
    story: [
      `Dez wakes you both up. "Guard change is done. Bad news: Vark's system re-keys itself after every guard change. The stairwell door wants proof you still know floors 20 and 25."`,
      `"So it is a quiz," says Wrench.`,
      `"It is a quiz," says Dez.`,
      `No tumblers this time, and nothing drops if you miss. A few typed answers, and each right one is worth a part.`,
    ],
    done: [
      `The stairwell door clicks open. Five flights up, the air starts to smell like a garden centre.`,
    ],
  },
  ending: {
    title: 'Out',
    text: [
      `You hit the pavement at a dead run. Dez already has the door open and the car moving.`,
      `Six blocks away, Wrench's phone rings. Unknown number. She puts it on speaker.`,
      `<i>"Good evening,"</i> says Lucian Vark. He sounds like a man smiling with his teeth. <i>"I assume you checked each answer in the original. I would have."</i>`,
      `Nobody says anything.`,
      `<i>"Keep the cup. You earned it, which is more than I can say for the people who gave it to me. But you have now been in my building twice, and that will not happen a third time. I am finished with doors."</i>`,
      `<i>"Next time, I come to you. I am building something for the purpose. You will want to think about how to defend a school."</i>`,
      `The line goes dead.`,
      `"Defend a what?" says Dez.`,
    ],
  },
  shop: [
    { id: 'scanner', name: 'Scanner', cost: 5, what: 'Tags every obstacle in the running sections with an arrow: up to jump, down to slide.' },
    { id: 'boots', name: 'Spring boots', cost: 8, what: 'Press JUMP again in mid-air for a second, smaller jump.' },
    { id: 'dampers', name: 'Dampers', cost: 10, what: 'The first thing you run into in each section does not knock you back.' },
    { id: 'trail', name: 'Gold trail', cost: 4, what: 'Does nothing useful. Looks excellent.' },
  ],
};
