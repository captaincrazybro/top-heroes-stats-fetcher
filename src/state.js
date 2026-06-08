const fs = require('fs');
const path = require('path');

let statePath = path.resolve(__dirname, '..', 'state.json');

function _setPath(p) { statePath = p; }

function _read() {
  if (!fs.existsSync(statePath)) return {};
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); }
  catch { return {}; }
}

function _write(data) {
  fs.writeFileSync(statePath, JSON.stringify(data, null, 2), 'utf8');
}

function getGrEventStartDate() {
  return _read().gr_event_start_date ?? null;
}

function setGrEventStartDate(dateStr) {
  const data = _read();
  data.gr_event_start_date = dateStr;
  _write(data);
}

function clearGrEventStartDate() {
  const data = _read();
  delete data.gr_event_start_date;
  _write(data);
}

module.exports = { getGrEventStartDate, setGrEventStartDate, clearGrEventStartDate, _setPath };
