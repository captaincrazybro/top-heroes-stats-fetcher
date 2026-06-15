// src/scheduler.js
const cron = require('node-cron');

// 2:45 AM UTC daily
cron.schedule('45 2 * * *', () => {
  console.log('[scheduler] Cron fired — starting run');
  const { run } = require('../index');
  run().catch(err => console.error('[scheduler] Run failed:', err));
}, { timezone: 'UTC' });

console.log('[scheduler] Scheduled for 02:45 UTC daily. Waiting...');
