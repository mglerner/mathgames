// Keystone Deep frozen types (DESIGN.md section 11). Shipped by M0.
// Changes after M0 go through the integrator.
// Use from JS with JSDoc, e.g.  /** @typedef {import('../../types.d.ts').Q} Q */

// ---------------------------------------------------------------- values

/** Rational in lowest terms, d > 0; saved as "n/d". */
export type Q = { n: bigint; d: bigint };
/** Sum of coef x sqrt(rad), rad squarefree, rad 1 = rational. */
export type Surd = { terms: { coef: Q; rad: bigint }[] };

export type Node =
  | { t: 'num'; q: Q }
  | { t: 'var'; name: string }
  | { t: 'add'; args: Node[] }
  | { t: 'mul'; args: Node[] }
  | { t: 'neg'; arg: Node }
  | { t: 'frac'; num: Node; den: Node }
  /** exp may be a non-integer num: a rational power */
  | { t: 'pow'; base: Node; exp: Node }
  /** index is 2 in v1 */
  | { t: 'root'; index: number; radicand: Node }
  /** parentheses kept for display */
  | { t: 'group'; arg: Node };
export type Equation = { t: 'eq'; lhs: Node; rhs: Node };
export type Assumption = { name: string; rel: 'nonzero' | 'nonneg' | 'pos' };
export type SolutionSet = { kind: 'finite'; roots: Surd[] } | { kind: 'none' } | { kind: 'all' };
export type Env = Record<string, Q>;
/** undefined = cannot verify */
export type Tri = true | false | undefined;

// ---------------------------------------------------------------- moves and items

export type Move = { op: 'add' | 'sub' | 'mul' | 'div' | 'square' | 'sqrt'; operand?: Node };
export type MoveVerdict = 'legal' | 'risky' | 'illegal';
export type Interaction = 'cast' | 'nextline' | 'predict' | 'forge' | 'twin' | 'trace' | 'why' | 'strike';

export type AnswerSpec = {
  kind: 'expr' | 'equation-sides' | 'equation-multiple' | 'solution-set' | 'form-of-1' | 'form-of-0' | 'tuple';
  expected: Node | Equation | SolutionSet | Node[];
  /** names exported by forms.js */
  formPredicates: string[];
  assumptions: Assumption[];
  /**
   * (integrator addition, optional; 'expr' only) the variable a "Solve for v"
   * item solves for. The typed solved line "v = E" (or "E = v", v not in E)
   * is then judged as E (section 3 I8: any complete, correctly formed final
   * answer is accepted).
   */
  solvedFor?: string;
};
export type Choice = {
  id: string; display: Node | Equation | Move;
  verdict: 'progress' | 'legal-idle' | 'risky' | 'illegal' | 'correct' | 'wrong';
  distance?: number; malrule?: string;
};
/**
 * reason (integrator addition, optional): a short classroom-vocabulary line
 * saying why this step is legal (or what the planted bad line did), shown in
 * worked steps. Plain ASCII.
 */
export type Step = { line: Node | Equation; move?: Move; legal: boolean; malrule?: string; reason?: string };
export type Problem = {
  id: string; gen: string; version: number; seed: string;
  skill: string; difficulty: 1 | 2 | 3 | 4; interaction: Interaction; variant?: string;
  constructed: boolean; fadeLevel: 0 | 1 | 2 | 3;
  prompt: { verb: string; math: Node | Equation; move?: Move; goal?: string; twin?: Node | Equation };
  assumptions: Assumption[]; variableKeys: string[];
  choices?: Choice[]; answer: AnswerSpec; steps?: Step[];
  moveGraph?: { distance: number; minPath: Move[] };
  visuals: string[]; probes: Env[];
};
export type Attempt = {
  problem: { gen: string; version: number; seed: string; skill: string; difficulty: number;
             interaction: Interaction; variant?: string; constructed: boolean };
  /** raw input or choice id; never free text */
  response: string;
  verdict: 'correct' | 'form' | 'legal-idle' | 'risky' | 'wrong' | 'unparsed' | 'unverifiable';
  firstTry: boolean; hintsUsed: number; fadeLevel: number; evidence: boolean;
  context: 'blocked' | 'mixed' | 'charting' | 'boss' | 'fracture' | 'echo' | 'warmup' | 'closer';
  misconceptions: string[]; ambiguous: boolean; ms: number;
};
export type Event = {
  /** ULID: a sortable unique id */
  id: string;
  v: number; t: string; build: string; device: string;
  type: 'attempt' | 'award' | 'session-start' | 'session-end' | 'unlock' | 'placement'
      | 'report' | 'paper-bridge' | 'setting';
  data: unknown;
};

// ---------------------------------------------------------------- PRNG (src/gen/prng.js)

/**
 * Seeded deterministic PRNG. Never Math.random, never Date.
 * Floats only ever steer sampling (bool); they never enter a correctness check.
 */
export type Rng = {
  /** the string seed this stream was built from (forks carry a derived seed) */
  readonly seed: string;
  /** next raw uint32 */
  next(): number;
  /** uniform integer in [lo, hi], both inclusive; lo, hi safe integers, hi - lo < 2^32 */
  int(lo: number, hi: number): number;
  /** uniform element; throws on an empty array */
  pick<T>(arr: readonly T[]): T;
  /** uniformly shuffled copy (Fisher-Yates); the input is not mutated */
  shuffle<T>(arr: readonly T[]): T[];
  /** true with probability p (default 0.5), 0 <= p <= 1 */
  bool(p?: number): boolean;
  /** independent substream: depends only on (this.seed, label), not on draws so far */
  fork(label: string): Rng;
};

// ---------------------------------------------------------------- content contracts

export type Generator = {
  id: string; version: number; skill: string; difficulty: [number, number];
  interactions: Interaction[];
  generate(rng: Rng, opts: { difficulty: number; interaction: Interaction; fadeLevel: number }): Problem;
  /** required for cast and boss generators */
  alphabet?(state: Equation): Move[];
};
/**
 * applyAll (integrator addition, optional; every rule built with
 * src/misc/kit.js defineMalRule has it): every faithful wrong result on the
 * item, most typical first ([] when the bug does not show); apply() is its
 * first element. diagnose.js compares a response with every one of them.
 */
export type MalRule = {
  id: string; haunt: string; standardTerm: string; script: string; skills: string[];
  apply(problem: Problem): Node | Equation | SolutionSet | undefined;
  applyAll?(problem: Problem): (Node | Equation | SolutionSet)[];
};
/**
 * slice: ships in the first slice ([S] in section 4). Added by M0 beyond the
 * section 11 text, which lists the slice in section 4 but not on the type.
 * cluster: section 8 Warden cluster id, or 'none' (systems-linear only).
 */
export type SkillDef = { n: number; id: string; zone: string; pre: string[]; priority: 'A' | 'B';
                         cluster: string; slice: boolean;
                         sliceGate?: { maxDifficulty: number; pre: string[] } };

// ---------------------------------------------------------------- math API (M1a implements)

/**
 * PLACEHOLDER, M1a refines: canonical expanded polynomial (poly.js).
 * Opaque to everyone but src/math; compare only with polyEq.
 */
export type Poly = { readonly kind: 'poly'; readonly [internal: string]: unknown };
/**
 * PLACEHOLDER, M1a refines: radical normal form (radical.js), a sum of
 * (surd coefficient) x (product of variables to rational powers).
 * Opaque to everyone but src/math.
 */
export type RadNF = { readonly kind: 'radnf'; readonly [internal: string]: unknown };

/** rational.js */
export interface RationalAPI {
  q(n: bigint | number, d?: bigint | number): Q;
  add(a: Q, b: Q): Q;
  sub(a: Q, b: Q): Q;
  mul(a: Q, b: Q): Q;
  div(a: Q, b: Q): Q;
  neg(a: Q): Q;
  cmp(a: Q, b: Q): -1 | 0 | 1;
  qeq(a: Q, b: Q): boolean;
}
/** surd.js */
export interface SurdAPI {
  sadd(a: Surd, b: Surd): Surd;
  smul(a: Surd, b: Surd): Surd;
  seq(a: Surd, b: Surd): boolean;
  sqrtQ(a: Q): Surd | undefined;
  /** display only */
  approx(a: Surd, places: number): string;
}
/** parse.js */
export interface ParseAPI {
  parse(text: string): Node | Equation | { error: string };
}
/** print.js */
export interface PrintAPI {
  print(x: Node | Equation): string;
}
/** evaluate.js */
export interface EvaluateAPI {
  evaluate(n: Node, env: Env): Surd | undefined;
}
/** poly.js */
export interface PolyAPI {
  toPoly(n: Node): Poly | undefined;
  polyEq(a: Poly, b: Poly): boolean;
  degree(p: Poly): number;
}
/** radical.js */
export interface RadicalAPI {
  toRadicalNormalForm(n: Node, a: Assumption[]): RadNF | undefined;
}
/** equiv.js */
export interface EquivAPI {
  equivExpr(a: Node, b: Node, as?: Assumption[]): { equal: Tri; witness?: Env; note?: string };
  /** side-wise, swap allowed */
  sameSides(got: Equation, want: Equation, as?: Assumption[]): Tri;
  /** nonzero rational multiple */
  isMultiple(got: Equation, orig: Equation, as?: Assumption[]): Tri;
  sameSolutions(a: Equation, b: Equation, v: string): { equal: Tri; witness?: Surd };
}
/** forms.js: named predicates */
export type FormPredicate = (x: Node | Equation) => boolean;
/** solve.js */
export interface SolveAPI {
  solve(e: Equation, v: string): SolutionSet | undefined;
}
/** moves: apply.js, classify.js, graph.js */
export interface MovesAPI {
  applyMove(m: Move, e: Equation): Equation;
  classify(m: Move, e: Equation, as: Assumption[]): MoveVerdict;
  /** as (integrator addition, optional 6th parameter): the item's assumptions, used to classify each move (default []) */
  bfs(start: Equation, alphabet: (state: Equation) => Move[], isGoal: (state: Equation) => boolean,
      maxDepth?: number, nodeCap?: number, as?: Assumption[]): { distance: number; minPath: Move[] } | undefined;
}

// ---------------------------------------------------------------- judge (src/check/judge.js)
//
// judge(problem: Problem, rawResponse: string, opts?: { tapped?: boolean }): JudgeResult
// The third argument (integrator note): tapped = true when rawResponse is a
// choice id from a tap rather than typed keypad text; required for a tap on a
// constructed item. judge() never throws. JudgeResult is defined in judge.js.
