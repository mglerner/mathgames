// Adversarial reads of KEYPAD_CSS / MATH_CSS (no browser available: these are
// static checks of the stylesheet text plus the module's own width estimator).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEYPAD_CSS, MAX_TOKENS, makeKeypad, press, inputText, readInput } from '../../../src/render/keypad.js';
import { MATH_CSS, estimateWidth, WIDTH_SAFETY, DISPLAY_CAP_PX } from '../../../src/render/mathdom.js';

const rule = (css, sel) => {
  const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : '';
};

test('keys are at least 48px and handled without hover', () => {
  assert.match(rule(KEYPAD_CSS, '.kp-key'), /min-height:\s*48px/);
  assert.match(rule(KEYPAD_CSS, '.kp-key'), /min-width:\s*48px/);
  assert.doesNotMatch(KEYPAD_CSS + MATH_CSS, /:hover/);
});

// Finding 3: the preview is a centered flex row with overflow: hidden and the
// math inside it never wraps (except at "="). A 26-key input (well under
// MAX_TOKENS = 60) is wider than the preview even by the estimator's own
// numbers with its 10% safety factor removed, so both ends are clipped: the
// leading minus of -(x+1)(x-1)(x+2)(x-2)(x+3) is cut off and the preview reads
// as a positive product.
test('a long but legal input is not clipped out of the live preview', () => {
  const keys = ['-', '(', 'var:x', '+', '1', ')', '(', 'var:x', '-', '1', ')', '(', 'var:x', '+', '2', ')', '(', 'var:x', '-', '2', ')', '(', 'var:x', '+', '3', ')'];
  assert.ok(keys.length < MAX_TOKENS);
  let st = makeKeypad({ variableKeys: ['x'] });
  for (const k of keys) st = press(st, k);
  const r = readInput(inputText(st));
  assert.equal(r.status, 'read');
  const px = estimateWidth(r.items[0], { fontPx: 24 }).oneLine / WIDTH_SAFETY;
  // preview content box: 343px math column - 2px border - 16px padding
  const clips = /overflow:\s*hidden/.test(rule(KEYPAD_CSS, '.kp-preview')) && /justify-content:\s*center/.test(rule(KEYPAD_CSS, '.kp-preview'));
  assert.ok(!(clips && px > DISPLAY_CAP_PX - 18), `estimated ${px.toFixed(0)}px in a ${DISPLAY_CAP_PX - 18}px centered overflow:hidden box`);
});

// Finding 4 (minor): section 9 says math at 22px or larger. With a 24px base,
// .frac is 0.92em and compounds: a fraction inside a fraction is 20.3px and a
// rational exponent x^(1/2) is 24 x 0.62 x 0.92 = 13.7px.
test('nested fraction text stays at or above 22px with the 24px base', () => {
  const frac = Number(rule(MATH_CSS, '.m .frac').match(/font-size:\s*([\d.]+)em/)[1]);
  assert.ok(24 * frac * frac >= 22, `nested fraction ${(24 * frac * frac).toFixed(1)}px`);
});
