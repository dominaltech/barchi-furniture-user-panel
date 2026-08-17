const { webcrypto } = require('crypto');
const crypto = webcrypto || globalThis.crypto;
const enc = new TextEncoder();

function b64uDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function b64uEncode(buf) {
  const bytes = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer);
  let b = '';
  for (const byte of bytes) b += String.fromCharCode(byte);
  return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function concat(...bufs) {
  const arrays = bufs.map(b => b instanceof Uint8Array ? b : new Uint8Array(b));
  const total = arrays.reduce((n, a) => n + a.byteLength, 0);
  const out = new Uint8Array(total);
  let i = 0;
  for (const a of arrays) { out.set(a, i); i += a.byteLength; }
  return out;
}

function rawP256PrivToPkcs8(raw32) {
  if (raw32.length !== 32) throw new Error(`Expected 32-byte P-256 key, got ${raw32.length}`);
  return concat(
    new Uint8Array([
      0x30, 0x41, 0x02, 0x01, 0x00,
      0x30, 0x13,
        0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01,
        0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07,
      0x04, 0x27, 0x30, 0x25, 0x02, 0x01, 0x01, 0x04, 0x20
    ]),
    raw32
  );
}

async function makeVapidJWT(audience, subject, pubB64u, privB64u) {
  const header = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64uEncode(enc.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 43200,
    sub: subject
  })));
  const signing = `${header}.${claims}`;
  const pkcs8 = rawP256PrivToPkcs8(b64uDecode(privB64u));
  const key = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(signing));
  return `${signing}.${b64uEncode(sig)}`;
}

async function encryptPayload(plaintext, p256dhB64u, authB64u) {
  const clientPubRaw = b64uDecode(p256dhB64u);
  const authSecret = b64uDecode(authB64u);
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const serverKP = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', serverKP.publicKey));
  const clientPub = await crypto.subtle.importKey('raw', clientPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhBits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPub }, serverKP.privateKey, 256));

  const prkKey = await crypto.subtle.importKey('raw', ecdhBits, 'HKDF', false, ['deriveBits']);
  const keyInfo = concat(enc.encode('WebPush: info\0'), clientPubRaw, serverPubRaw);
  const ikm = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: keyInfo }, prkKey, 256
  ));
  const ikmKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);

  const cekRaw = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('Content-Encoding: aes128gcm\0') }, ikmKey, 128
  ));
  const nonceRaw = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('Content-Encoding: nonce\0') }, ikmKey, 96
  ));

  const cek = await crypto.subtle.importKey('raw', cekRaw, 'AES-GCM', false, ['encrypt']);
  const padded = concat(enc.encode(plaintext), new Uint8Array([0x02]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonceRaw }, cek, padded));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  return concat(salt, rs, new Uint8Array([65]), serverPubRaw, ciphertext);
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const PUB = process.env.VAPID_PUBLIC_KEY || 'BLRlIrTI65YeYRK_UbJyEbtYpz6b6zLFs5NNG9-VzFT3CYQ2D_hmm8RQ0qf9UsTBEfXjNnw2FSqkaZnI7IX6wuM';
  const PRIV = process.env.VAPID_PRIVATE_KEY || 'PysO4tsQFkzs3JXEQXXKgM2sZBSa4e4OwJltFZUhOPM';
  const SUBJ = process.env.VAPID_SUBJECT || 'mailto:barchi.furniture@gmail.com';
  const SB_URL = process.env.SB_URL || process.env.SUPABASE_URL || 'https://fyviuwmvyussvzeufuwg.supabase.co';
  const SB_KEY = process.env.SB_SERVICE_ROLE_KEY || 
                 process.env.SUPABASE_SERVICE_ROLE_KEY || 
                 process.env.SB_ANON_KEY || 
                 process.env.SUPABASE_ANON_KEY || 
                 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dml1d212eXVzc3Z6ZXVmdXdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MTA3MTUsImV4cCI6MjEwMDk4NjcxNX0.JbpegqU_gzyp4kiUZo9yPccdqHCCalcyWLPcCABbqoc';

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const { orderCode, customer, productName, total } = body || {};

  try {
    // Fetch active admin push subscriptions from Supabase
    const sbRes = await fetch(
      `${SB_URL}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth&order=updated_at.desc&limit=10`,
      { headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY } }
    );

    if (!sbRes.ok) {
      const errText = await sbRes.text();
      console.error('[notify-order] Supabase fetch failed:', sbRes.status, errText);
      return res.status(502).json({ error: `Supabase ${sbRes.status}: ${errText}` });
    }

    const subscriptions = await sbRes.json();
    console.log('[notify-order] Found', subscriptions?.length, 'subscription(s)');

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(200).json({ success: false, error: 'No admin push subscriptions found in Supabase.' });
    }

    const product = productName ? ` · ${productName}` : '';
    const amount = total ? ` · \u20B9${total.toLocaleString('en-IN')}` : '';
    const payload = {
      title: `🛒 New Barchi Order: ${orderCode || 'incoming'}`,
      body: `${customer || 'Customer'}${product}${amount}`,
      url: '/orders.html',
      tag: 'barchi-order'
    };

    let sent = 0, failed = 0;
    const errors = [];

    for (const sub of subscriptions) {
      try {
        if (!sub.endpoint || !sub.p256dh || !sub.auth) {
          failed++;
          continue;
        }

        const endpoint = new URL(sub.endpoint);
        const audience = `${endpoint.protocol}//${endpoint.host}`;
        const jwt = await makeVapidJWT(audience, SUBJ, PUB, PRIV);
        const encBody = await encryptPayload(JSON.stringify(payload), sub.p256dh, sub.auth);

        const pushRes = await fetch(sub.endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `vapid t=${jwt},k=${PUB}`,
            'Content-Type': 'application/octet-stream',
            'Content-Encoding': 'aes128gcm',
            'TTL': '86400',
            'Urgency': 'high',
            'Topic': 'barchi-order'
          },
          body: encBody
        });

        if ([200, 201, 202].includes(pushRes.status)) {
          sent++;
        } else {
          if ([404, 410].includes(pushRes.status)) {
            try {
              await fetch(`${SB_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, {
                method: 'DELETE',
                headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
              });
            } catch(e) {}
          }
          const detail = await pushRes.text();
          errors.push(`Status ${pushRes.status}: ${detail}`);
          failed++;
        }
      } catch (err) {
        errors.push(`Exception: ${err.message}`);
        failed++;
      }
    }

    return res.status(200).json({ success: sent > 0, sent, failed, errors });

  } catch (err) {
    console.error('[notify-order] General exception:', err);
    return res.status(500).json({ error: 'Server exception: ' + err.message });
  }
};
