'use strict';
// Shared server helpers for Sayid English V4 API routes (Vercel Node functions, no deps).

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

// Best-effort per-instance rate limit (personal project scale).
const buckets = new Map();
function checkRate(ip, route, limit, windowMs) {
  const now = Date.now();
  const key = `${route}|${ip}`;
  let arr = buckets.get(key);
  if (!arr) { arr = []; buckets.set(key, arr); }
  while (arr.length && now - arr[0] > windowMs) arr.shift();
  if (arr.length >= limit) return false;
  arr.push(now);
  if (buckets.size > 4000) buckets.clear();
  return true;
}

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

function fail(res, http, error, extra) {
  send(res, http, extra ? { error, ...extra } : { error });
}

// Reads JSON body with an explicit byte cap. Vercel usually pre-parses req.body;
// this still enforces size and shape defensively.
function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined && req.body !== null) {
      if (typeof req.body === 'object') return resolve(req.body);
      if (typeof req.body === 'string') {
        if (Buffer.byteLength(req.body) > maxBytes) return reject({ code: 'BODY_TOO_LARGE' });
        try { return resolve(JSON.parse(req.body || '{}')); } catch { return reject({ code: 'BAD_JSON' }); }
      }
      return reject({ code: 'BAD_JSON' });
    }
    let bytes = 0;
    const chunks = [];
    req.on('data', (c) => {
      bytes += c.length;
      if (bytes > maxBytes) { reject({ code: 'BODY_TOO_LARGE' }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject({ code: 'BAD_JSON' }); }
    });
    req.on('error', () => reject({ code: 'BAD_JSON' }));
  });
}

function requirePost(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Allow', 'POST, OPTIONS');
    res.end();
    return false;
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    fail(res, 405, 'METHOD_NOT_ALLOWED');
    return false;
  }
  const ct = String(req.headers['content-type'] || '');
  if (!ct.includes('application/json')) { fail(res, 415, 'INVALID_CONTENT_TYPE'); return false; }
  return true;
}

const isLocale = (v) => v === 'en' || v === 'tr';
const clampStr = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

function withTimeout(ms) {
  const ctl = new AbortController();
  const h = setTimeout(() => ctl.abort(), ms);
  return { signal: ctl.signal, done: () => clearTimeout(h) };
}

module.exports = { clientIp, checkRate, send, fail, readJsonBody, requirePost, isLocale, clampStr, withTimeout };
