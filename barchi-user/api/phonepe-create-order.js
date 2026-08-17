// PhonePe Create Order Serverless Function (Vercel Node.js)
const CLIENT_ID = process.env.PHONEPE_CLIENT_ID || 'SU2608141901116912180849';
const CLIENT_VERSION = process.env.PHONEPE_CLIENT_VERSION || '1';
const CLIENT_SECRET = process.env.PHONEPE_CLIENT_SECRET || 'fa463a37-a26f-40d9-bb2b-9c45c0983756';
const PHONEPE_ENV = process.env.PHONEPE_ENV || 'PRODUCTION'; // 'PRODUCTION' or 'SANDBOX'

const TOKEN_URL = PHONEPE_ENV === 'SANDBOX'
  ? 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token'
  : 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token';

const PAY_URL = PHONEPE_ENV === 'SANDBOX'
  ? 'https://api-preprod.phonepe.com/apis/pg-sandbox/checkout/v2/pay'
  : 'https://api.phonepe.com/apis/pg/checkout/v2/pay';

// In-memory token cache across warm serverless invocations for maximum speed
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
    throw new Error(`Failed to obtain PhonePe token (${response.status}): ${errText}`);
  }

  const data = await response.json();
  if (!data.access_token) {
    throw new Error(`Invalid token response from PhonePe: ${JSON.stringify(data)}`);
  }

  cachedToken = data.access_token;
  // expires_in is in seconds
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

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed. Use POST.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const {
      amount,
      merchantOrderId,
      customer,
      redirectUrl: customRedirectUrl
    } = body;

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Valid payment amount is required.' });
    }

    // Convert amount in Rupees to Paise (PhonePe requires amount in Paise integer)
    const amountInPaise = Math.round(numAmount * 100);

    // Generate or format unique merchant order ID
    const cleanOrderId = merchantOrderId 
      ? String(merchantOrderId).replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 63)
      : `BARCHI_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

    // Determine base URL for redirect callback
    let origin = 'https://barchi-user.vercel.app';
    if (req.headers.origin) {
      origin = req.headers.origin;
    } else if (req.headers.referer) {
      try {
        const parsed = new URL(req.headers.referer);
        origin = `${parsed.protocol}//${parsed.host}`;
      } catch (e) {}
    } else if (req.headers.host) {
      origin = `https://${req.headers.host}`;
    }

    const redirectUrl = customRedirectUrl || `${origin}/order-success.html?orderId=${encodeURIComponent(cleanOrderId)}`;

    // 1. Fetch OAuth Access Token
    const token = await getAccessToken();

    // 2. Build PhonePe Standard Checkout Payload
    const payPayload = {
      merchantOrderId: cleanOrderId,
      amount: amountInPaise,
      expireAfter: 1200, // 20 minutes expiry
      paymentFlow: {
        type: 'PG_CHECKOUT',
        message: `Barchi Luxury Furniture Order #${cleanOrderId}`,
        merchantUrls: {
          redirectUrl: redirectUrl
        }
      },
      disablePaymentRetry: false
    };

    if (customer && customer.phone) {
      payPayload.metaInfo = {
        customerName: String(customer.name || 'Barchi Customer').substring(0, 64),
        customerPhone: String(customer.phone).replace(/\D/g, '').substring(0, 15),
        customerEmail: String(customer.email || '').substring(0, 64)
      };
    }

    // 3. Initiate Checkout with PhonePe PG
    const payResponse = await fetch(PAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `O-Bearer ${token}`
      },
      body: JSON.stringify(payPayload)
    });

    const payData = await payResponse.json();

    if (!payResponse.ok || !payData.redirectUrl) {
      console.error('PhonePe Pay Error:', payData);
      return res.status(payResponse.status || 500).json({
        success: false,
        error: payData.message || payData.code || 'Failed to initiate PhonePe payment.',
        details: payData
      });
    }

    // 4. Return checkout redirect URL to frontend
    return res.status(200).json({
      success: true,
      redirectUrl: payData.redirectUrl,
      orderId: payData.orderId,
      merchantOrderId: cleanOrderId,
      amount: numAmount,
      amountInPaise: amountInPaise,
      expireAt: payData.expireAt
    });

  } catch (error) {
    console.error('Server error in phonepe-create-order:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal Server Error during PhonePe order creation.'
    });
  }
};
