import Stripe from 'stripe';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
    console.error('[stripe-get-payment-method] Firebase init error:', _e.message);
    throw _e;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    var stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    var uid = req.body.uid;
    var roomId = req.body.roomId;

    if (!uid && !roomId) {
      return res.status(400).json({ error: 'uid or roomId is required' });
    }

    var db = getDb();
    var subRef;
    if (roomId) {
      subRef = db.collection('rooms').doc(roomId).collection('subscription').doc('main');
    } else {
      subRef = db.collection('users').doc(uid).collection('subscription').doc('main');
    }

    var subDoc = await subRef.get();
    if (!subDoc.exists) {
      return res.status(200).json({ paymentMethod: null });
    }

    var customerId = subDoc.data().customerId;
    if (!customerId) {
      return res.status(200).json({ paymentMethod: null });
    }

    var paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 1,
    });

    if (!paymentMethods.data || paymentMethods.data.length === 0) {
      return res.status(200).json({ paymentMethod: null });
    }

    var card = paymentMethods.data[0].card;
    console.log('[stripe-get-payment-method] Got card for', roomId ? 'room:' + roomId : 'uid:' + uid);
    return res.status(200).json({
      paymentMethod: {
        brand: card.brand,
        last4: card.last4,
        exp_month: card.exp_month,
        exp_year: card.exp_year,
      },
    });
  } catch (_e) {
    console.error('[stripe-get-payment-method] Error:', _e.message);
    return res.status(500).json({ error: _e.message });
  }
}
