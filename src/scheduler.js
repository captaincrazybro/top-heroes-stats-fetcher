// src/scheduler.js
const cron = require('node-cron');

// 2:50 AM UTC daily
cron.schedule('50 2 * * *', () => {
  console.log('[scheduler] Cron fired — starting run');
  const { run } = require('../index');
  run().catch(err => console.error('[scheduler] Run failed:', err));
}, { timezone: 'UTC' });

console.log('[scheduler] Scheduled for 02:50 UTC daily. Waiting...');
