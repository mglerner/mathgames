// @ts-check
// Every in-world name with its classroom term (DESIGN.md section 9). Shown beside the name on
// first sight in a run; Haunt names (mal-rules) always carry their term in feedback.

/** @type {Record<string, { name: string, standardTerm: string }>} */
export const VOCAB = {
  knotExpr: { name: 'Knot', standardTerm: 'expression' },
  knotEq: { name: 'Knot', standardTerm: 'equation' },
  lantern: { name: 'Lantern', standardTerm: 'substitution check' },
  scale: { name: 'Scale', standardTerm: 'both sides of the equation' },
  coin: { name: 'coin', standardTerm: 'form of 1' },
  echo: { name: 'Echo', standardTerm: 'a fresh practice item of the same kind' },
  keeper: { name: 'Keeper', standardTerm: 'you, the solver' },
  deep: { name: 'the Deep', standardTerm: 'a practice run' },
  descend: { name: 'Descend', standardTerm: 'start a run' },
  haul: { name: 'Haul', standardTerm: 'end-of-run summary' },
  forge: { name: 'Forge', standardTerm: 'choose the form of 1 or the whole-number fraction' },
  nextline: { name: 'Next Line', standardTerm: 'choose the result of the stated step' },
  strike: { name: 'Strike', standardTerm: 'type the answer' },
};

/** Tracks first sight within one run. */
export function makeSighting() {
  /** @type {Set<string>} */
  const seen = new Set();
  return {
    /** @param {string} key @returns {string} "Lantern = substitution check" first time, else "Lantern" */
    label(key) {
      const e = VOCAB[key];
      if (!e) throw new Error(`no vocab ${key}`);
      if (seen.has(key)) return e.name;
      seen.add(key);
      return `${e.name} = ${e.standardTerm}`;
    },
    /** @param {string} key */
    seen: (key) => seen.has(key),
  };
}
