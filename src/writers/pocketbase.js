const PocketBase = require('pocketbase');
const config = require('../../config');

let _pb = null;

async function getClient() {
  if (_pb) return _pb;
  const pb = new PocketBase(config.pb.url);
  await pb.admins.authWithPassword(config.pb.email, config.pb.password);
  _pb = pb;
  return _pb;
}

async function insertRecord(pb, record) {
  const collection = config.pb.eventRecordsCollection;
  await pb.collection(collection).create(record);
}

async function upsertGrRecord(pb, record) {
  const collection = config.pb.grRecordsCollection;
  const filter = `player_name = "${record.player_name}" && event_start_date = "${record.event_start_date}"`;
  const existing = await pb.collection(collection).getList(1, 1, { filter });

  if (existing.totalItems > 0) {
    await pb.collection(collection).update(existing.items[0].id, record);
  } else {
    await pb.collection(collection).create(record);
  }
}

async function write(records, eventType) {
  const pb = await getClient();

  for (const record of records) {
    if (eventType === 'GR') {
      await upsertGrRecord(pb, record);
    } else {
      await insertRecord(pb, record);
    }
  }

  console.log(`[pocketbase] ${records.length} records written (${eventType})`);
}

// Exposed for testing: reset the cached client between test runs
function _resetClient() { _pb = null; }

module.exports = { write, _resetClient };
