// PhonePe Check Order Status Serverless Function (Vercel Node.js)
const CLIENT_ID = process.env.PHONEPE_CLIENT_ID || 'SU2608141901116912180849';
const CLIENT_VERSION = process.env.PHONEPE_CLIENT_VERSION || '1';
const CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET || 'fa463a37-a26f-40d9-bb2b-9c45c0983756';
const PHONEPE_ENV = process.env.PHONEPE_ENV || 'PRODUCTION'; // 'PRODUCTION' or 'SANDBOX'

const SB_URL = process.env.SB_URL || process.env.SUPABASE_URL || 'https://fyviuwmvyussvzeufuwg.supabase.co';
const SB_KEY = process.env.SB_SERVICE_ROLE_KEY || 
               process.env.SUPABASE_SERVICE_ROLE_KEY || 
               process.env.SB_ANON_KEY || 
               process.env.SUPABASE_ANON_KEY || 
               'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5dml1d212eXVzc3Z6ZXVmdXdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MTA3MTUsImV4cCI6MjEwMDk4NjcxNX0.JbpegqU_gzyp4kiUZo9yPccdqHCCalcyWLPcCABbqoc';

const TOKEN_URL = PHONEPE_ENV === 'SANDBOX'
  ? 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token'
  : 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token';

const STATUS_BASE_URL = PHONEPE_ENV === 'SANDBOX'
  ? 'https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/order'
  : 'https://api.phonepe.com/apis/pg/checkout/v2/order';

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();
  if (cachedToken && tokenExpiresAt > now + 60000) {
    return cachedToken;
  }

  const params = new URLSearchParams();
  params.append('client_id', CLIENT_ID);
  params.append('client_version', CLIENT_VERSION);
  params.append('client_secret', CLIENT_SECRET);
  params.append('grant_type', 'client_credentials');

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to obtain PhonePe token: ${errText}`);
  }

  const data = await response.json();
  cachedToken = data.access_token;
  const expiresInMs = (data.expires_in || 3600) * 1000;
  tokenExpiresAt = now + expiresInMs;
  return cachedToken;
}

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let merchantOrderId = '';

    if (req.query && (req.query.orderId || req.query.merchantOrderId)) {
      merchantOrderId = req.query.orderId || req.query.merchantOrderId;
    } else if (req.body) {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      merchantOrderId = body.orderId || body.merchantOrderId;
    }

    if (!merchantOrderId) {
      return res.status(400).json({ success: false, error: 'orderId or merchantOrderId is required' });
    }

    // Clean order ID parameter
    const cleanOrderId = String(merchantOrderId).trim();

    // 1. Fetch OAuth Access Token
    const token = await getAccessToken();

    // 2. Query PhonePe Order Status API
    const statusUrl = `${STATUS_BASE_URL}/${encodeURIComponent(cleanOrderId)}/status?details=true&errorContext=true`;
    const ppRes = await fetch(statusUrl, {
      method: 'GET',
      headers: {
        'Authorization': `O-Bearer ${token}`
      }
    });

    const statusData = await ppRes.json();

    if (!ppRes.ok) {
      return res.status(ppRes.status || 500).json({
        success: false,
        error: statusData.message || statusData.code || 'Error checking PhonePe order status',
        details: statusData
      });
    }

    const state = statusData.state || 'PENDING';
    const isCompleted = state === 'COMPLETED';
    const isFailed = state === 'FAILED';

    // 3. Update Supabase order record based on payment outcome
    if (SB_URL && SB_KEY) {
      try {
        if (isCompleted) {
          await fetch(`${SB_URL}/rest/v1/orders?id=eq.${encodeURIComponent(cleanOrderId)}`, {
            method: 'PATCH',
            headers: {
              'apikey': SB_KEY,
              'Authorization': `Bearer ${SB_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
              status: 'Confirmed',
              payment_status: 'Paid',
              payment_method: 'PhonePe PG',
              transaction_id: statusData.orderId || statusData.paymentDetails?.[0]?.transactionId || null,
              updated_at: new Date().toISOString()
            })
          });
        } else if (isFailed) {
          await fetch(`${SB_URL}/rest/v1/orders?id=eq.${encodeURIComponent(cleanOrderId)}`, {
            method: 'PATCH',
            headers: {
              'apikey': SB_KEY,
              'Authorization': `Bearer ${SB_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
              status: 'Cancelled',
              payment_status: 'Failed',
              updated_at: new Date().toISOString()
            })
          });
        }
      } catch (dbErr) {
        console.warn('Supabase order update notice:', dbErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      state: state,
      isPaid: isCompleted,
      isFailed: isFailed,
      orderId: statusData.orderId,
      merchantOrderId: cleanOrderId,
      amount: statusData.amount ? (statusData.amount / 100) : null,
      currency: statusData.currency || 'INR',
      paymentDetails: statusData.paymentDetails || [],
      raw: statusData
    });

  } catch (err) {
    console.error('Error in phonepe-check-status:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Internal Server Error while verifying PhonePe payment.'
    });
  }
};
