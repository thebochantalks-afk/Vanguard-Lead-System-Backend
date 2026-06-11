/**
 * Interakt WhatsApp Business API Service
 * 
 * Interakt is an Indian WhatsApp Business Solution Provider (BSP).
 * Each client registers their own WhatsApp number via Interakt.
 * The system sends messages through the client's own number.
 * 
 * Docs: https://docs.interakt.ai/
 */

const INTERAKT_API_URL = 'https://api.interakt.ai/v1/public/';

/**
 * Send a WhatsApp text message via Interakt.
 * 
 * @param {string} phoneNumber - Lead's phone number (without country code prefix)
 * @param {string} text - Message content
 * @param {object} options
 * @param {string} options.countryCode - Country code (default: '+91')
 * @param {string} options.apiKey - Interakt API key (default: INTERAKT_API_KEY env var)
 * @returns {Promise<object>}
 */
export async function sendMessage(phoneNumber, text, options = {}) {
  const countryCode = options.countryCode || process.env.INTERAKT_COUNTRY_CODE || '+91';
  const apiKey = options.apiKey || process.env.INTERAKT_API_KEY;

  if (!apiKey) {
    throw new Error('INTERAKT_API_KEY is not configured. Set it in environment variables.');
  }

  // Clean the phone number - remove whatsapp: prefix, spaces, etc.
  const cleanPhone = String(phoneNumber)
    .replace(/^whatsapp[:\+]?/i, '')
    .replace(/[\s\-\(\)]/g, '')
    .trim();

  const payload = {
    countryCode,
    phoneNumber: cleanPhone,
    type: 'Text',
    text,
  };

  try {
    const response = await fetch(`${INTERAKT_API_URL}message/`, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Interakt send error:', JSON.stringify(data));
      throw new Error(`Interakt API error: ${data.message || response.statusText}`);
    }

    console.log(`✅ WhatsApp sent to ${countryCode}${cleanPhone} via Interakt`);
    return data;
  } catch (error) {
    console.error('Interakt send error:', error.message);
    throw error;
  }
}

/**
 * Process an incoming Interakt webhook payload.
 * Interakt sends incoming messages as POST to your webhook URL.
 * 
 * @param {object} body - The request body from Interakt
 * @returns {{ phone: string, message: string, name: string } | null}
 */
export function parseIncomingMessage(body) {
  // Interakt webhook format (varies by configuration):
  // {
  //   "from": "919876543210",
  //   "msg": "Hello",
  //   "senderName": "Rahul",
  //   "messageType": "text",
  //   "timestamp": 1234567890
  // }

  const phone = body.from || body.phone || body.From;
  const message = body.msg || body.message || body.text || body.Body || body.body;
  const name = body.senderName || body.name || body.ProfileName || '';

  if (!phone || !message) {
    return null;
  }

  return {
    phone: String(phone).replace(/^whatsapp[:\+]?/i, '').trim(),
    message: String(message).trim(),
    name: String(name).trim(),
  };
}