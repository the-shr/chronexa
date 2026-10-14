const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const windows = [];
let timers = [];
class Window extends EventEmitter {
  constructor(options) {
    super(); this.options = options; this.calls = [];
    this.webContents = {}; windows.push(this);
  }
  isDestroyed() { return Boolean(this.destroyed); }
  isMinimized() { return false; }
  show() { this.calls.push('show'); }
  moveTop() { this.calls.push('top'); }
  focus() { this.calls.push('focus'); }
  flashFrame() {}
  setAlwaysOnTop() {}
  setVisibleOnAllWorkspaces() {}
  loadFile() { return Promise.resolve(); }
  close() { this.destroyed = true; this.emit('closed'); }
}

const mockedModule = { exports: {} };
vm.runInNewContext(fs.readFileSync(__dirname + '/desktop/electron/lib/windows.js', 'utf8'), {
  module: mockedModule, exports: mockedModule.exports,
  __dirname: __dirname + '/desktop/electron/lib', process: { env: {} },
  require: (name) => name === 'electron'
    ? { BrowserWindow: Window, screen: {
      getCursorScreenPoint: () => ({ x: 2100, y: 10 }),
      getDisplayNearestPoint: () => ({ workArea: { x: 1920, y: 0, width: 1920, height: 1080 } }),
    } }
    : name === './settings' ? {} : require(name),
  setTimeout: (fn) => { timers.push(fn); return fn; },
  clearTimeout: (fn) => { timers = timers.filter((timer) => timer !== fn); },
});

const warning = mockedModule.exports.openIdleWindow();
assert(warning.options.x > 1920, 'warning opens on the active monitor');
warning.emit('ready-to-show');
assert.deepEqual(warning.calls.slice(-3), ['show', 'top', 'focus']);
timers.shift()();
assert.equal(warning.calls.filter((call) => call === 'top').length, 2, 'foreground request retries');
mockedModule.exports.closeIdleWindow();
assert.equal(timers.length, 0, 'foreground retries are cleaned up');
console.log('PASS: active-monitor placement, foreground retry and cleanup');
