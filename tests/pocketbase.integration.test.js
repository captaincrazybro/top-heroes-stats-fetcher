// Integration test — hits the live PocketBase server over HTTP.
// Uses the raw REST API via fetch so Jest's module sandbox (which auto-applies
// tests/__mocks__/pocketbase.js) does not interfere with the SDK prototype chain.
require('dotenv').config();

jest.setTimeout(30000);

const BASE_URL   = process.env.POCKETBASE_URL;
const PB_EMAIL   = process.env.POCKETBASE_EMAIL;
const PB_PASS    = process.env.POCKETBASE_PASSWORD;
const COLLECTION = 'topHeroesEventRecords';

const credsPresent = !!(BASE_URL && PB_EMAIL && PB_PASS);
const suite = credsPresent ? describe : describe.skip;

// Thin REST helpers ————————————————————————————————————————————————————————
async function pbRequest(path, options = {}) {
  const { headers: extraHeaders, ...rest } = options;
  const res = await fetch(`${BASE_URL}/api${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`PocketBase ${options.method || 'GET'} ${path} → ${res.status}: ${body}`);
  }
  // DELETE returns 204 No Content — no body to parse
  if (res.status === 204) return null;
  return res.json();
}

async function authenticate() {
  const { token } = await pbRequest('/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASS }),
  });
  return token;
}
// ——————————————————————————————————————————————————————————————————————————

suite('PocketBase integration — create and delete a test record', () => {
  let token;
  let createdId = null;

  const testRecord = {
    // rank is not in the PocketBase schema — intentionally omitted
    server: '#00000',
    guild_tag: 'TST',
    player_name: '__integration_test__',
    score: 0,
    // event_type is a select field whose schema has a single malformed option ("GR,GAR,KvK")
    // instead of three separate options — omit it (not required) to avoid a validation error
    event_start_date: '2000-01-01 00:00:00.000Z', // required date field
    // captured_at is an autodate field — do not send
  };

  beforeAll(async () => {
    token = await authenticate();
  });

  afterAll(async () => {
    // Safety net: clean up the test record if a test left it behind.
    if (createdId) {
      try {
        await pbRequest(`/collections/${COLLECTION}/records/${createdId}`, {
          method: 'DELETE',
          headers: { Authorization: token },
        });
      } catch { /* already deleted */ }
    }
  });

  test('creates a record and confirms it can be fetched back', async () => {
    const created = await pbRequest(`/collections/${COLLECTION}/records`, {
      method: 'POST',
      headers: { Authorization: token },
      body: JSON.stringify(testRecord),
    });
    createdId = created.id;
    expect(createdId).toBeTruthy();

    const fetched = await pbRequest(`/collections/${COLLECTION}/records/${createdId}`, {
      headers: { Authorization: token },
    });
    expect(fetched.id).toBe(createdId);
    expect(fetched.player_name).toBe('__integration_test__');
  });

  test('deletes the record and confirms it no longer exists', async () => {
    expect(createdId).toBeTruthy();

    const deletedId = createdId;
    await pbRequest(`/collections/${COLLECTION}/records/${deletedId}`, {
      method: 'DELETE',
      headers: { Authorization: token },
    });
    createdId = null;

    await expect(
      pbRequest(`/collections/${COLLECTION}/records/${deletedId}`, {
        headers: { Authorization: token },
      })
    ).rejects.toThrow('404');
  });
});
