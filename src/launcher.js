const { spawn, execSync } = require('child_process');
const { keyboard, Key } = require('@nut-tree-fork/nut-js');
const config = require('../config');
const capturer = require('./capturer');
const extractor = require('./extractor');

let gameProcess = null;
let launchTimeoutMs = config.launchTimeoutMs;
let loadTimeoutMs = config.loadTimeoutMs;

function _reset() { gameProcess = null; }
function _setTimeouts(launch, load) { launchTimeoutMs = launch; loadTimeoutMs = load; }

function isWindowVisible(titleFragment) {
  try {
    const result = execSync(
      `powershell -Command "Get-Process | Where-Object {$_.MainWindowTitle -like '*${titleFragment}*'} | Measure-Object | Select-Object -ExpandProperty Count"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    return parseInt(result.trim(), 10) > 0;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForWindow(intervalMs = 2000) {
  const deadline = Date.now() + launchTimeoutMs;
  while (Date.now() < deadline) {
    if (isWindowVisible(config.windowTitle)) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(intervalMs, remaining));
  }
  throw new Error(`timed out waiting for window: ${config.windowTitle}`);
}

async function dismissPopupIfPresent() {
  const img = await capturer.capture();
  try {
    const coords = await extractor.locateButton(img, 'red circular X button at the bottom center or top left of a popup or notification dialog');
    await clickAt(coords, 1000);
    console.log('[navigator] Dismissed startup popup');
  } catch {
    // No popup present — continue normally
  }
}

async function waitForReady(intervalMs = 5000) {
  const deadline = Date.now() + loadTimeoutMs;
  while (Date.now() < deadline) {
    const img = await capturer.capture();
    const state = await extractor.detectGameState(img);
    if (state.isMainMap) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await sleep(Math.min(intervalMs, remaining));
  }
  throw new Error('timed out waiting for game to load');
}

async function ensureFullscreen() {
  try {
    const result = execSync(
      `powershell -Command "$s = Add-Type -AssemblyName System.Windows.Forms -PassThru; [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width.ToString() + 'x' + [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height.ToString()"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    const [sw, sh] = result.trim().split('x').map(Number);

    const winResult = execSync(
      `powershell -Command "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class W { [DllImport(\"user32.dll\")] public static extern bool GetWindowRect(IntPtr h, out RECT r); } [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }' -Language CSharp; $p=(Get-Process | Where {$_.MainWindowTitle -like '*${config.windowTitle}*'} | Select -First 1); $r=New-Object RECT; [W]::GetWindowRect($p.MainWindowHandle,[ref]$r); ($r.R-$r.L).ToString()+'x'+($r.B-$r.T).ToString()"`,
      { encoding: 'utf8', timeout: 5000 }
    );
    const [ww, wh] = winResult.trim().split('x').map(Number);

    if (ww !== sw || wh !== sh) {
      console.log('[launcher] Game is not fullscreen — sending Alt+Enter');
      await keyboard.pressKey(Key.LeftAlt, Key.Return);
      await keyboard.releaseKey(Key.Return, Key.LeftAlt);
      await sleep(2000);
    }
  } catch (err) {
    console.warn('[launcher] Could not check fullscreen state:', err.message);
  }
}

async function launch() {
  if (isWindowVisible(config.windowTitle)) {
    console.log('[launcher] Existing TopHeroes instance detected — closing it...');
    close();
    await sleep(2000);
  }

  console.log('[launcher] Spawning TopHeroes...');
  gameProcess = spawn(config.gameExePath, [], { detached: true, stdio: 'ignore' });  
  if (typeof gameProcess.unref === 'function') gameProcess.unref();
  
  console.log('[launcher] Waiting for window...');
  await waitForWindow();
  
  console.log('[launcher] Waiting for game to load...');
  await waitForReady();

  // Dismiss any startup popup (e.g. "Rival Combat Day is coming")
  await dismissPopupIfPresent();

  console.log('[launcher] Game ready.');
}

function close() {
  try {
    execSync(
      `powershell -Command "Get-Process | Where-Object {$_.MainWindowTitle -like '*${config.windowTitle}*'} | Stop-Process -Force"`,
      { timeout: 5000 }
    );
    console.log('[launcher] TopHeroes closed.');
  } catch (err) {
    console.warn('[launcher] Failed to close process:', err.message);
  }
  gameProcess = null;
}

module.exports = { launch, close, _reset, _setTimeouts };
