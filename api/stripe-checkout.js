import Stripe from 'stripe';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const BASE_URL = 'https://cast-manager-seven.vercel.app';

const MINI_PRICES = [
  'price_1TXgkgQaq3EwNY4QyYQ6sea2',
  'price_1TXgmOQaq3EwNY4QKovRRNqb',
];

function getDb() {
  try {
    if (getApps().length === 0) {
      var privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
      initializeApp({ credential: cert({
        type: 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID || '',
        private_key: privateKey,
        client_email: process.env.FIREBASE_CLIENT_EMAIL || '',
      }) });
    }
    return getFirestore();
  } catch (_e) {
    console.error('[stripe-checkout] Firebase init error:', _e.message);
    throw _e;
  }
}

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
    var successPath = req.body.successPath || '/?checkout=success';
    var cancelPath = req.body.cancelPath || '/?checkout=cancel';
    var plan = MINI_PRICES.includes(priceId) ? 'mini' : 'standard';

    if (!priceId) {
      return res.status(400).json({ error: 'priceId is required' });
    }

    var sessionParams = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: quantity }],
      client_reference_id: uid,
      metadata: { uid: uid, plan: plan, roomId: roomId },
      success_url: BASE_URL + successPath + (successPath.includes('?') ? '&' : '?') + 'session_id={CHECKOUT_SESSION_ID}',
      cancel_url: BASE_URL + cancelPath,
    };

    // 引き継ぎ後の新管理者：旧サブスクの残り期間を無料トライアルに設定
    if (roomId && plan === 'standard') {
      try {
        var db = getDb();
        var roomDoc = await db.collection('rooms').doc(roomId).get();
        if (roomDoc.exists) {
          var billingDeadline = roomDoc.data().billingDeadline || null;
          var nowSec = Math.floor(Date.now() / 1000);
          if (billingDeadline && billingDeadline > nowSec + 86400) {
            sessionParams.subscription_data = { trial_end: billingDeadline };
            console.log('[stripe-checkout] trial_end set to billingDeadline:', billingDeadline, 'for room:', roomId);
          }
        }
      } catch (_fe) {
        console.log('[stripe-checkout] billingDeadline fetch skipped:', _fe.message);
      }
    }

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
