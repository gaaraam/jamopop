import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE, TARGET, seal, open, random, hash } from '../../lib/migration-ticket.mjs';
import { authRoute } from '../../build/migration-auth.mjs';
const secret = '1'.repeat(64);
test('encrypted transfer rejects alteration, wrong key, expiry and wrong audience', async () => {
  const p = {
    iss: SOURCE,
    aud: TARGET,
    jti: random(),
    challenge: random(),
    exp: Date.now() + 60000,
    accountId: 'test-user',
    guest: random(),
  };
  const t = await seal(p, secret);
  assert.deepEqual(await open(t, secret), p);
  assert.ok(!t.includes('test-user'));
  await assert.rejects(open(t, '2'.repeat(64)));
  await assert.rejects(open(t, secret, Date.now() + 120000));
  await assert.rejects(open(await seal({ ...p, aud: SOURCE }, secret), secret));
  const [iv, body] = t.split('.');
  await assert.rejects(open(iv + '.' + (body[0] === 'a' ? 'b' : 'a') + body.slice(1), secret));
});
test('callback requires browser state and consumes ticket atomically once', async () => {
  let used = false,
    calls = 0;
  const env = {
    MIGRATION_BRIDGE_KEY: secret,
    DB: {
      prepare() {
        return {
          bind() {
            return {
              async first() {
                calls++;
                if (used) return null;
                used = true;
                return { ticket_id: 'ok' };
              },
            };
          },
        };
      },
    },
  };
  const state = random(),
    t = await seal(
      {
        iss: SOURCE,
        aud: TARGET,
        jti: random(),
        challenge: await hash(state),
        exp: Date.now() + 60000,
        guest: random(),
      },
      secret,
    );
  const req = (s) =>
    new Request(TARGET + '/auth/complete?ticket=' + t, {
      headers: { cookie: 'bw_bridge_state=' + s },
    });
  assert.equal((await authRoute(req(random()), env)).status, 400);
  assert.equal(calls, 0);
  const ok = await authRoute(req(state), env);
  assert.equal(ok.status, 303);
  assert.match(ok.headers.get('set-cookie'), /HttpOnly/);
  assert.equal((await authRoute(req(state), env)).status, 400);
  assert.equal(calls, 2);
});
