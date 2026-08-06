import assert from 'node:assert/strict';
import test from 'node:test';

import { closeAfterApproval } from '../src/js/window-close-policy.js';

test('failed approved close restores future close protection', async () => {
  let approved = false;
  const failure = new Error('close failed');

  await assert.rejects(
    closeAfterApproval(
      async () => {
        assert.equal(approved, true);
        throw failure;
      },
      (value) => { approved = value; },
    ),
    failure,
  );

  assert.equal(approved, false);
});

test('successful approved close retains the deliberate close-event bypass', async () => {
  let approved = false;

  await closeAfterApproval(
    async () => {
      assert.equal(approved, true);
    },
    (value) => { approved = value; },
  );

  assert.equal(approved, true);
});
