'use strict';

const fs = require('node:fs');
const paths = require('./paths');

let stream = null;

function open() {
  try {
    stream = fs.createWriteStream(paths.logFile(), { flags: 'a' });
  } catch {
    stream = null;
  }
}

function write(level, args) {
  const line = `[${new Date().toISOString()}] ${level} ${args
    .map((a) => (typeof a === 'string' ? a : safeStringify(a)))
    .join(' ')}`;
  if (process.env.NODE_ENV === 'development') console.log(line);
  if (!stream) open();
  stream?.write(`${line}\n`);
}

function safeStringify(value) {
  if (value instanceof Error) return `${value.message}\n${value.stack || ''}`;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

module.exports = {
  info: (...a) => write('INFO ', a),
  warn: (...a) => write('WARN ', a),
  error: (...a) => write('ERROR', a),
};
