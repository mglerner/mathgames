// @ts-check
// Running sections for "The Vark Job": one before each lock, plus the getaway.
// `low` obstacles are jumped, `high` ones are slid under. Beats pause the run
// for a line of dialogue. story/test/sim.test.js checks every level is fair.

/** @type {import('./sim.js').Level[]} */
export const levels = [
  {
    id: 'dock', name: 'Loading dock', theme: 'dock', speed: 140, length: 1150, goal: 'vent',
    beats: [
      { x: 40, who: 'Dez', text: 'Comms check. You two are on the dock. Crates ahead: hit JUMP.' },
      { x: 470, who: 'Dez', text: 'Low pipe coming up. SLIDE under it. No, you cannot jump a pipe.' },
    ],
    obstacles: [
      { x: 300, kind: 'low', skin: 'crate' }, { x: 680, kind: 'high', skin: 'pipe' },
      { x: 860, kind: 'low', skin: 'crate' }, { x: 1030, kind: 'high', skin: 'pipe' },
    ],
  },
  {
    id: 'vent', name: 'The vents', theme: 'vent', speed: 150, length: 1250, goal: 'door',
    beats: [{ x: 40, who: 'Wrench', text: 'Vents. Duck the fan housings, hop the junction boxes. Stay close.' }],
    obstacles: [
      { x: 260, kind: 'high', skin: 'fan' }, { x: 440, kind: 'low', skin: 'box' }, { x: 620, kind: 'high', skin: 'fan' },
      { x: 800, kind: 'low', skin: 'box' }, { x: 970, kind: 'low', skin: 'box' }, { x: 1130, kind: 'high', skin: 'fan' },
    ],
  },
  {
    id: 'corridor', name: 'Service corridor', theme: 'corridor', speed: 160, length: 1350, goal: 'elevator',
    beats: [{ x: 40, who: 'Dez', text: 'He has lasers. Of course he has lasers. Red line low: jump it. Red line high: slide.' }],
    obstacles: [
      { x: 260, kind: 'low', skin: 'laser' }, { x: 440, kind: 'high', skin: 'laser' }, { x: 620, kind: 'low', skin: 'laser' },
      { x: 790, kind: 'low', skin: 'laser' }, { x: 960, kind: 'high', skin: 'laser' }, { x: 1130, kind: 'low', skin: 'laser' },
    ],
  },
  {
    id: 'gallery', name: 'The gallery', theme: 'gallery', speed: 170, length: 1450, goal: 'vault',
    beats: [{ x: 40, who: 'Wrench', text: 'Fourteenth floor. Do not touch the art. Do not touch anything.' }],
    obstacles: [
      { x: 270, kind: 'low', skin: 'pedestal' }, { x: 450, kind: 'high', skin: 'laser' }, { x: 630, kind: 'low', skin: 'laser' },
      { x: 810, kind: 'high', skin: 'laser' }, { x: 990, kind: 'low', skin: 'pedestal' }, { x: 1160, kind: 'low', skin: 'laser' },
      { x: 1330, kind: 'high', skin: 'laser' },
    ],
  },
  {
    id: 'vault', name: 'Inside the vault', theme: 'vault', speed: 150, length: 800, goal: 'case',
    beats: [{ x: 40, who: 'Dez', text: 'You are in the vault? You are actually in the vault. Okay. Okay okay okay.' }],
    obstacles: [
      { x: 260, kind: 'low', skin: 'laser' }, { x: 440, kind: 'high', skin: 'laser' }, { x: 620, kind: 'low', skin: 'pedestal' },
    ],
  },
  {
    id: 'getaway', name: 'Getaway', theme: 'alarm', speed: 190, length: 1900, goal: 'exit',
    beats: [{ x: 40, who: 'Dez', text: 'Alarm is up. Everything you walked past on the way in is now trying to stop you. RUN.' }],
    obstacles: [
      { x: 280, kind: 'low', skin: 'laser' }, { x: 480, kind: 'high', skin: 'laser' }, { x: 680, kind: 'low', skin: 'pedestal' },
      { x: 880, kind: 'low', skin: 'laser' }, { x: 1080, kind: 'high', skin: 'laser' }, { x: 1280, kind: 'low', skin: 'crate' },
      { x: 1480, kind: 'high', skin: 'pipe' }, { x: 1680, kind: 'low', skin: 'crate' },
    ],
  },
];
