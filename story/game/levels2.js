// @ts-check
// Running sections for episode 2, "The Other One": two per floor, plus the getaway.
// Faster than episode 1. story/test/sim.test.js checks every level is fair.

/**
 * Lay out obstacles from a pattern: L = low (jump), H = high (slide).
 * Gaps alternate between `gap` and `gap + 40` so the rhythm is not perfectly even.
 * @param {string} pattern @param {number} gap @param {string} low @param {string} high
 */
function row(pattern, gap, low, high) {
  let x = 280 - gap;
  return [...pattern].map((ch, i) => {
    x += gap + (i % 2 ? 40 : 0);
    return /** @type {import('./sim.js').Obstacle} */ ({ x, kind: ch === 'L' ? 'low' : 'high', skin: ch === 'L' ? low : high });
  });
}
/** @returns {import('./sim.js').Level} */
function level(id, name, theme, speed, goal, pattern, low, high, who, text) {
  const obstacles = row(pattern, Math.round(speed * 1.08), low, high);
  return { id, name, theme, speed, goal, length: obstacles[obstacles.length - 1].x + 140, beats: [{ x: 40, who, text }], obstacles };
}

/** @type {import('./sim.js').Level[]} */
export const levels2 = [
  level('stairs', 'Stairwell B', 'corridor', 170, 'door', 'LHLLHL', 'box', 'pipe',
    'Dez', 'Twenty floors of stairs. He has put things ON the stairs. Same as before: JUMP the low ones, SLIDE under the high ones.'),
  level('archive', 'The archive', 'vault', 175, 'door', 'HLHLLHL', 'box', 'laser',
    'Wrench', 'Filing cabinets, floor to ceiling. He alphabetised his grudges.'),
  level('ducts', 'Floor 25 ducts', 'vent', 180, 'door', 'LHHLHLL', 'box', 'fan',
    'Wrench', 'These vents are warm. That is the servers. Do not touch the left wall.'),
  level('servers', 'The server hall', 'server', 185, 'elevator', 'LHLHLLH', 'box', 'laser',
    'Dez', 'Every one of those blinking lights is a camera I am currently lying to. Go fast.'),
  level('cellar', 'The Root Cellar', 'green', 185, 'door', 'LLHLHLH', 'crate', 'pipe',
    'Dez', 'Floor 30 is a greenhouse. He calls it the Root Cellar. It is on the thirtieth floor. I hate him.'),
  level('glass', 'The glass walk', 'green', 190, 'door', 'HLLHLHLL', 'crate', 'laser',
    'Wrench', 'Sprinklers are on a timer. So are the lasers. Guess which one I am worried about.'),
  level('hall', 'Penthouse hall', 'gallery', 195, 'door', 'LHLLHLHL', 'pedestal', 'laser',
    'Dez', 'Penthouse. Every painting up here is of him. I counted nine. Ten. Keep moving.'),
  level('office', "Vark's office", 'gallery', 200, 'case', 'HLHLL', 'pedestal', 'laser',
    'Wrench', 'There it is. Glass case, end of the room. Do not get excited yet.'),
  level('getaway2', 'Getaway', 'alarm', 210, 'exit', 'LHLLHLHHLLHL', 'crate', 'laser',
    'Dez', 'That is every alarm in the building. Thirty-five floors, going down. RUN.'),
];
