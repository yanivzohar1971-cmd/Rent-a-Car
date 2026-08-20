import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonBomSafe, stripUtf8Bom, UTF8_BOM, isJsonBomParseError } from '../src/jsonBom.js';

const SESSION_BODY = `{
    "taskId":  "TASK-00023",
    "nonce":  "abc",
    "pid":  1234
}`;

test('parseJsonBomSafe accepts UTF-8 BOM prefixed JSON from the launcher session path', () => {
  const parsed = parseJsonBomSafe(`${UTF8_BOM}${SESSION_BODY}`, { source: 'agent-session.json' });
  assert.equal(parsed.taskId, 'TASK-00023');
  assert.equal(parsed.pid, 1234);
});

test('parseJsonBomSafe accepts normal non-BOM JSON', () => {
  const parsed = parseJsonBomSafe(SESSION_BODY, { source: 'agent-session.json' });
  assert.equal(parsed.taskId, 'TASK-00023');
});

test('parseJsonBomSafe still fails honestly on malformed JSON', () => {
  assert.throws(
    () => parseJsonBomSafe(`${UTF8_BOM}{ not json`, { source: 'agent-session.json' }),
    (error) => {
      assert.match(error.message, /Invalid JSON in agent-session.json/);
      assert.equal(error.hadUtf8Bom, true);
      assert.equal(isJsonBomParseError(error), true);
      return true;
    },
  );
  assert.throws(
    () => parseJsonBomSafe('{ not json', { source: 'agent-session.json' }),
    /Invalid JSON in agent-session.json/,
  );
});

test('stripUtf8Bom only removes a leading BOM', () => {
  assert.equal(stripUtf8Bom(`${UTF8_BOM}{"a":1}`), '{"a":1}');
  assert.equal(stripUtf8Bom('{"a":1}'), '{"a":1}');
});
