'use strict';
// Run as Administrator: node uninstall-service.js
const { Service } = require('node-windows');
const path = require('path');

const svc = new Service({
  name: 'TopHeroesStatsFetcher',
  script: path.resolve(__dirname, 'index.js'),
});

svc.on('uninstall', () => {
  console.log('Service uninstalled successfully.');
});

svc.on('error', err => {
  console.error('Service error:', err);
});

console.log('Uninstalling TopHeroesStatsFetcher Windows service...');
svc.uninstall();
