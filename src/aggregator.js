function normalizeTag(tag, expectedLength) {
  const cleaned = (tag ?? '').replace(/^\[|\]$/g, '').trim();
  return cleaned.slice(0, expectedLength);
}

function process(pages, guildTag) {
  const seenRanks = new Set();
  const results = [];

  for (const page of pages) {
    for (const entry of page) {
      const tag = normalizeTag(entry.guild_tag, guildTag.length);
      if (tag !== guildTag) {
        console.log(`[aggregator] skipped rank ${entry.rank} "${entry.player_name}" — guild_tag "${entry.guild_tag}" (normalized: "${tag}") !== "${guildTag}"`);
        continue;
      }
      if (seenRanks.has(entry.rank)) continue;
      seenRanks.add(entry.rank);
      results.push({ ...entry, guild_tag: tag });
    }
  }

  return results;
}

module.exports = { process };
