'use strict';

function computeScore(player) {
  const mqi = player.main_queue_influence;
  const inf = player.influence || 0;
  if (mqi != null && mqi !== 0) return mqi * 0.7 + inf * 0.3;
  return inf;
}

function parseDaysOffline(lastOnline) {
  if (!lastOnline || typeof lastOnline !== 'string') return Infinity;
  const s = lastOnline.trim();
  if (s === 'Online') return 0;
  let m;
  if ((m = s.match(/^(\d+)\s*min/i))) return 0;
  if ((m = s.match(/^(\d+)\s*hour/i))) return 0;
  if ((m = s.match(/^(\d+)\s*day/i))) return parseInt(m[1], 10);
  if ((m = s.match(/^(\d+)\s*week/i))) return parseInt(m[1], 10) * 7;
  console.warn(`[layout] Could not parse last_online: "${lastOnline}" — treating as inactive`);
  return Infinity;
}

function scorePlayers(players) {
  return players.map(p => {
    const days = parseDaysOffline(p.last_online);
    return {
      player: p,
      score: computeScore(p),
      daysOffline: days,
      inactive: days > 7,
      hasAoeBuffs: !!p.has_aoe_buffs,
    };
  });
}

module.exports = { computeScore, parseDaysOffline, scorePlayers };
