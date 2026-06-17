const PocketBase = require('pocketbase').default;
const config = require('../../config');

let _pb = null;

async function getClient() {
  if (_pb) return _pb;
  const pb = new PocketBase(config.pb.url);
  try {
    await pb.collection("_superusers").authWithPassword(config.pb.email, config.pb.password);
  } catch (err) {
    throw new Error(`auth failed: ${err.message}`);
  }
  _pb = pb;
  return _pb;
}

async function insertRecord(pb, record) {
  await pb.collection(config.pb.collection).create(record);
}

async function deleteGrRecords(pb, eventStartDate) {
  const filter = `event_type = "GR" && event_start_date = "${eventStartDate}"`;
  const existing = await pb.collection(config.pb.collection).getFullList({ filter });
  for (const record of existing) {
    await pb.collection(config.pb.collection).delete(record.id);
  }
  if (existing.length > 0) {
    console.log(`[pocketbase] Deleted ${existing.length} previous GR records for ${eventStartDate}`);
  }
}

async function write(records, eventType) {
  const pb = await getClient();

  if (eventType === 'GR' && records.length > 0) {
    await deleteGrRecords(pb, records[0].event_start_date);
  }

  for (const record of records) {
    await insertRecord(pb, record);
  }

  console.log(`[pocketbase] ${records.length} records written (${eventType})`);
}

// Exposed for testing: reset the cached client between test runs
function _resetClient() { _pb = null; }

module.exports = { write, _resetClient };
