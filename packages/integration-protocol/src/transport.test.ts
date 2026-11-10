import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { invocationSchema, invocationReplySchema, invocationSubject, replyPrefix, decode, encode } from './transport.js';

test('transport accepts correlation metadata and rejects clinical payloads and forged routing fields', () => {
  const input = { id: randomUUID(), workspaceId: randomUUID(), integrationId: randomUUID(), deadline: Date.now()+1000 };
  assert.deepEqual(invocationSchema.parse(decode(encode(input))), input);
  for (const extra of [{ query: 'name' }, { value: {} }, { userId: randomUUID() }, { url: 'https://example.invalid' }])
    assert.equal(invocationSchema.safeParse({ ...input, ...extra }).success, false);
  assert.throws(() => invocationSubject('*', input.integrationId, 'event'));
  assert.throws(() => replyPrefix(input.workspaceId, '>'));
  assert.equal(invocationReplySchema.safeParse({ id: input.id, outcome: 'retry' }).success, false);
  assert.throws(() => decode(new Uint8Array(16385)));
});
