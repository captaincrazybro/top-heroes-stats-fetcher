'use strict';
// Run as Administrator: node install-service.js
const { Service } = require('node-windows');
const path = require('path');

const svc = new Service({
  name: 'TopHeroesStatsFetcher',
  description: 'Fetches Top Heroes guild event rankings daily at 02:50 UTC and writes to PocketBase',
  script: path.resolve(__dirname, 'index.js'),
  workingDirectory: __dirname,
});

svc.on('install', () => {
  console.log('Service installed. Starting...');
  svc.start();
});

svc.on('start', () => {
  console.log('Service started successfully.');
  console.log('Open services.msc and look for "TopHeroesStatsFetcher" to confirm.');
});

svc.on('alreadyinstalled', () => {
  console.log('Service is already installed.');
  console.log('Run "node uninstall-service.js" first if you want to reinstall.');
});

svc.on('error', err => {
  console.error('Service error:', err);
});

console.log('Installing TopHeroesStatsFetcher Windows service...');
svc.install();
