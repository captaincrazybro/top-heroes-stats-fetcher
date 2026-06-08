function process(pages, guildTag) {
  const seen = new Set();
  const results = [];

  for (const page of pages) {
    for (const entry of page) {
      if (entry.guild_tag !== guildTag) continue;
      const key = `${entry.player_name}|${entry.server}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(entry);
    }
  }

  return results;
}

module.exports = { process };
