import Stripe from 'stripe';

const BASE_URL = 'https://cast-manager-seven.vercel.app';

const MINI_PRICES = [
  'price_1TeLmXHoTkoUKrRrpYisWdwY',
  'price_1TeLmXHoTkoUKrRr8QCP4Kol',
];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    var stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    var priceId = req.body.priceId;
    var quantity = req.body.quantity || 1;
    var uid = req.body.uid || '';
    var roomId = req.body.roomId || '';
    var roomName = req.body.roomName || '';
    var successPath = req.body.successPath || '/?checkout=success';
    var cancelPath = req.body.cancelPath || '/?checkout=cancel';
    var plan = MINI_PRICES.includes(priceId) ? 'mini' : 'standard';

    if (!priceId) {
      return res.status(400).json({ error: 'priceId is required' });
    }

    var sessionParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: quantity }],
      client_reference_id: uid,
      metadata: { uid: uid, plan: plan, roomId: roomId, roomName: roomName },
      success_url: BASE_URL + successPath + (successPath.includes('?') ? '&' : '?') + 'session_id={CHECKOUT_SESSION_ID}',
      cancel_url: BASE_URL + cancelPath,
      custom_text: {
        submit: {
          message: '解約はログイン後の設定画面からいつでも可能です。解約後は次回更新日まで利用できます。',
        },
      },
    };

    var session = await stripe.checkout.sessions.create(sessionParams);

    return res.status(200).json({
      sessionId: session.id,
      url: session.url,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
    });
  } catch (_e) {
    return res.status(500).json({ error: _e.message });
  }
}
