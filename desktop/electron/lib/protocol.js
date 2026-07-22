'use strict';

const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { protocol, net } = require('electron');

const db = require('./db');
const paths = require('./paths');
const log = require('./log');

const SCHEME = 'shot';

/**
 * Serves saved screenshots to the renderer as `shot://thumb/<id>` /
 * `shot://full/<id>`. Going through a scheme instead of `file://` keeps the
 * renderer's CSP strict and means the UI can only ever reach images that are
 * actually rows in the local database -- not arbitrary paths on disk.
 */
function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

function handle() {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      const kind = url.hostname; // 'thumb' | 'full'
      const id = decodeURIComponent(url.pathname.replace(/^\//, ''));
      const row = db.getScreenshot(id);
      if (!row) return new Response('Not found', { status: 404 });

      const file = kind === 'full' ? row.filePath : row.thumbPath;
      // Defence in depth: never serve anything outside the screenshot folder.
      if (!file.startsWith(paths.screenshotDir()) || !fs.existsSync(file)) {
        return new Response('Not found', { status: 404 });
      }
      return net.fetch(pathToFileURL(file).toString());
    } catch (err) {
      log.error('protocol: shot handler failed', err);
      return new Response('Error', { status: 500 });
    }
  });
}

module.exports = { registerScheme, handle, SCHEME };
