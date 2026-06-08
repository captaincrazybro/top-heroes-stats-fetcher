const screenshot = require('screenshot-desktop');

async function capture() {
  return screenshot({ format: 'png' });
}

module.exports = { capture };
