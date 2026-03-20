import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 3000);
const LINK4M_API_TOKEN = process.env.LINK4M_API_TOKEN || '';
const APP_BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/$/, '');
const SESSION_TTL_MINUTES = Number(process.env.SESSION_TTL_MINUTES || 30);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const sessions = new Map();

function cleanupExpired() {
  const now = Date.now();
  for (const [rid, row] of sessions.entries()) {
    if (row.expiresAt <= now) sessions.delete(rid);
  }
}

function getBaseUrl(req) {
  if (APP_BASE_URL) return APP_BASE_URL;
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

function createRandomKey() {
  return crypto.randomBytes(16).toString('hex').toUpperCase();
}

function makeSession(clientId) {
  const rid = crypto.randomUUID();
  const state = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MINUTES * 60 * 1000;

  const session = {
    rid,
    state,
    clientId,
    verified: false,
    key: null,
    createdAt: Date.now(),
    verifiedAt: null,
    expiresAt,
  };

  sessions.set(rid, session);
  return session;
}

async function shortenWithLink4m(longUrl) {
  const apiUrl = new URL('https://link4m.co/api-shorten/v2');
  apiUrl.searchParams.set('api', LINK4M_API_TOKEN);
  apiUrl.searchParams.set('url', longUrl);

  const response = await fetch(apiUrl.toString(), { method: 'GET' });
  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Link4m trả dữ liệu không phải JSON: ${text.slice(0, 200)}`);
  }

  if (data.status !== 'success' || !data.shortenedUrl) {
    throw new Error(data.message || 'Không tạo được short link từ Link4m');
  }

  return data.shortenedUrl;
}

setInterval(cleanupExpired, 60 * 1000);

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    sessions: sessions.size,
    now: new Date().toISOString(),
  });
});

app.post('/api/create-link', async (req, res) => {
  try {
    cleanupExpired();

    if (!LINK4M_API_TOKEN) {
      return res.status(500).json({
        status: 'error',
        message: 'Thiếu biến môi trường LINK4M_API_TOKEN',
      });
    }

    const { clientId } = req.body || {};
    if (!clientId || typeof clientId !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Thiếu clientId',
      });
    }

    for (const [rid, row] of sessions.entries()) {
      if (row.clientId === clientId && row.verified === false) {
        sessions.delete(rid);
      }
    }

    const session = makeSession(clientId);
    const baseUrl = getBaseUrl(req);
    const verifyUrl = new URL('/verify', baseUrl);
    verifyUrl.searchParams.set('rid', session.rid);
    verifyUrl.searchParams.set('state', session.state);

    const shortUrl = await shortenWithLink4m(verifyUrl.toString());

    return res.json({
      status: 'success',
      rid: session.rid,
      shortUrl,
      expiresAt: session.expiresAt,
      verifyUrl: verifyUrl.toString(),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Lỗi server',
    });
  }
});

app.get('/verify', (req, res) => {
  cleanupExpired();

  const { rid, state } = req.query;
  const row = sessions.get(rid);

  if (!row) {
    return res.status(400).send('RID không hợp lệ hoặc đã hết hạn.');
  }

  if (row.state !== state) {
    return res.status(400).send('State không hợp lệ.');
  }

  row.verified = true;
  row.verifiedAt = Date.now();

  const returnUrl = new URL('/', getBaseUrl(req));
  returnUrl.searchParams.set('verified', '1');
  returnUrl.searchParams.set('rid', row.rid);

  return res.redirect(returnUrl.toString());
});

app.post('/api/get-key', (req, res) => {
  cleanupExpired();

  const { rid, clientId } = req.body || {};
  const row = sessions.get(rid);

  if (!row) {
    return res.status(404).json({
      status: 'error',
      message: 'Không tìm thấy phiên lấy key hoặc phiên đã hết hạn',
    });
  }

  if (row.clientId !== clientId) {
    return res.status(403).json({
      status: 'error',
      message: 'Sai clientId',
    });
  }

  if (!row.verified) {
    return res.status(403).json({
      status: 'error',
      message: 'Bạn chưa vượt link thành công',
    });
  }

  if (!row.key) {
    row.key = createRandomKey();
  }

  return res.json({
    status: 'success',
    key: row.key,
    verifiedAt: row.verifiedAt,
    expiresAt: row.expiresAt,
  });
});

app.get('/api/status/:rid', (req, res) => {
  cleanupExpired();

  const row = sessions.get(req.params.rid);
  if (!row) {
    return res.status(404).json({
      status: 'error',
      message: 'Không có session',
    });
  }

  return res.json({
    status: 'success',
    verified: row.verified,
    hasKey: Boolean(row.key),
    verifiedAt: row.verifiedAt,
    expiresAt: row.expiresAt,
  });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
