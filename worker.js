/**
 * Worker de la Lista 11 | FIEECS UNI
 * - Sirve los archivos de /public (binding ASSETS).
 * - Expone POST /api/contact con: CORS solo para tu dominio, validación y
 *   saneado, honeypot, trampa de tiempo, límite de envíos por IP y cabeceras
 *   de seguridad. Los secretos (webhook) viven en el Worker, nunca en el frontend.
 *
 * Configuración (ver wrangler.jsonc):
 *   - KV namespace  LISTA_KV            → guarda mensajes y contadores de límite.
 *   - Secret opcional NOTIFY_WEBHOOK_URL → avisa por Discord (formato { content }).
 *       npx wrangler secret put NOTIFY_WEBHOOK_URL
 */

// PENDIENTE: cambia por tu dominio final (sin barra al final).
const ALLOWED_ORIGINS = ['https://wb-1.loll80880.workers.dev'];

const LIMITS = { name: 80, contact: 120, message: 1000, body: 4096 };
const RATE = { max: 5, windowSec: 600 };          // 5 envíos por IP cada 10 minutos
const MIN_FILL_MS = 2500;                         // un humano tarda más que esto en llenar el formulario
const TOPICS = new Set(['sumarme', 'idea', 'duda']);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s\-()]{7,20}$/;

const SECURITY_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { ...SECURITY_HEADERS, ...extra } });

// Quita caracteres de control y recorta espacios; opcionalmente conserva saltos de línea.
const clean = (value, max, keepNewlines = false) => {
  const re = keepNewlines ? /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g;
  return String(value ?? '').replace(re, '').trim().slice(0, max);
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/contact') return handleContact(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};

async function handleContact(request, env, ctx) {
  const origin = request.headers.get('Origin');
  const originOk = !origin || ALLOWED_ORIGINS.includes(origin);
  const cors = origin && originOk
    ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' }
    : { 'Vary': 'Origin' };

  // CORS: solo tu dominio. Si el origen no está permitido, se corta aquí.
  if (!originOk) return json({ ok: false, error: 'forbidden' }, 403, cors);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '600',
      },
    });
  }

  // Solo POST
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405, { ...cors, Allow: 'POST, OPTIONS' });
  }

  if (!env.LISTA_KV) return json({ ok: false, error: 'not_configured' }, 503, cors);

  // Tipo y tamaño del cuerpo
  const ctype = request.headers.get('Content-Type') || '';
  if (!ctype.toLowerCase().startsWith('application/json')) {
    return json({ ok: false, error: 'unsupported_media_type' }, 415, cors);
  }
  const declared = Number(request.headers.get('Content-Length') || 0);
  if (declared > LIMITS.body) return json({ ok: false, error: 'too_large' }, 413, cors);

  let raw;
  try { raw = await request.text(); } catch { return json({ ok: false, error: 'bad_request' }, 400, cors); }
  if (raw.length > LIMITS.body) return json({ ok: false, error: 'too_large' }, 413, cors);

  let body;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: 'bad_json' }, 400, cors); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ ok: false, error: 'bad_json' }, 400, cors);
  }

  // Límite de envíos por IP (ventana fija en KV)
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const bucket = Math.floor(now / (RATE.windowSec * 1000));
  const rateKey = `rl:${ip}:${bucket}`;
  const used = Number((await env.LISTA_KV.get(rateKey)) || 0);
  if (used >= RATE.max) {
    return json({ ok: false, error: 'rate_limited' }, 429, { ...cors, 'Retry-After': String(RATE.windowSec) });
  }
  await env.LISTA_KV.put(rateKey, String(used + 1), { expirationTtl: RATE.windowSec * 2 });

  // Honeypot y trampa de tiempo: responden "ok" sin guardar nada, para no dar pistas a bots.
  const ts = Number(body.ts);
  if (!Number.isFinite(ts) || ts > now + 60_000 || now - ts > 86_400_000) {
    return json({ ok: false, error: 'bad_request' }, 400, cors);
  }
  if (clean(body.website, 50) !== '' || now - ts < MIN_FILL_MS) {
    return json({ ok: true }, 200, cors);
  }

  // Validación y saneado
  const name = clean(body.name, LIMITS.name);
  const contact = clean(body.contact, LIMITS.contact);
  const message = clean(body.message, LIMITS.message, true);
  const topic = TOPICS.has(body.topic) ? body.topic : '';

  const errors = {};
  if (name.length < 2) errors.name = 'invalid';
  if (!(EMAIL.test(contact) || PHONE.test(contact))) errors.contact = 'invalid';
  if (message.length < 10) errors.message = 'invalid';
  if (!topic) errors.topic = 'invalid';
  if (Object.keys(errors).length) return json({ ok: false, error: 'validation', fields: errors }, 422, cors);

  // Guardar (90 días)
  const record = { name, contact, topic, message, receivedAt: new Date(now).toISOString() };
  await env.LISTA_KV.put(`msg:${now}:${crypto.randomUUID()}`, JSON.stringify(record), {
    expirationTtl: 60 * 60 * 24 * 90,
  });

  // Aviso opcional por webhook (Discord). Sin menciones para evitar pings masivos.
  if (env.NOTIFY_WEBHOOK_URL) {
    const text = `Nuevo mensaje (${topic})\nNombre: ${name}\nContacto: ${contact}\n${message}`.slice(0, 1800);
    ctx.waitUntil(
      fetch(env.NOTIFY_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } }),
      }).catch(() => {})
    );
  }

  return json({ ok: true }, 200, cors);
}
