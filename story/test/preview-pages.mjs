// Prints one line per screenshot for shots.sh: "<file name> <comma-separated preview names>".
// Two phone-width screens per picture keeps the text large enough to read.
// An optional argument keeps only previews whose name contains it, e.g. "lock" or "dist", or "e3-" for episode 3.
import { previews as p2 } from '../ep2.js';
import { previews as p3 } from '../ep3.js';

const filter = process.argv[2] || '';
const names = [...p2(), ...p3()].map((p) => p.name).filter((n) => n.includes(filter));
for (let i = 0; i < names.length; i += 2) {
  const pair = names.slice(i, i + 2);
  console.log(`${String(i / 2 + 1).padStart(2, '0')}_${pair.join('+')} ${pair.join(',')}`);
}
