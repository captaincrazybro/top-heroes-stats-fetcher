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
  try {
    await pb.collection(config.pb.collection).create(record);
  } catch (err) {
    const detail = err.data ? JSON.stringify(err.data) : err.message;
    console.error(`[pocketbase] Failed to create record (rank ${record.rank ?? '?'}): ${detail}`);
    throw err;
  }
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

  let written = 0;
  const failed = [];
  for (const record of records) {
    try {
      await insertRecord(pb, record);
      written++;
    } catch {
      failed.push(record.rank ?? '?');
    }
  }

  console.log(`[pocketbase] ${written}/${records.length} records written (${eventType})`);
  if (failed.length > 0) {
    console.error(`[pocketbase] Failed ranks: ${failed.join(', ')}`);
  }
}

// Exposed for testing: reset the cached client between test runs
function _resetClient() { _pb = null; }

module.exports = { write, _resetClient };
