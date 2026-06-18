'use strict';
const PocketBase = require('pocketbase').default;
const config = require('../../config');

async function fetchRoster() {
  const pb = new PocketBase(config.pb.url);
  await pb.collection('_superusers').authWithPassword(
    config.pb.email,
    config.pb.password
  );
  const records = await pb.collection(config.pb.rosterCollection).getFullList({
    filter: 'joined = true',
  });
  return records;
}

module.exports = { fetchRoster };
