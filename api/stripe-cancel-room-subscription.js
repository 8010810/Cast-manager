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
    console.error('[stripe-cancel-room-subscription] Firebase init error:', _e.message);
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
    var roomId = req.body.roomId;

    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' });
    }

    var db = getDb();
    var subDoc = await db.collection('rooms').doc(roomId).collection('subscription').doc('main').get();

    if (!subDoc.exists) {
      return res.status(200).json({ success: true, message: 'No subscription found' });
    }

    var subData = subDoc.data();
    var subscriptionId = subData.subscriptionId;

    if (subscriptionId) {
      try {
        await stripe.subscriptions.cancel(subscriptionId);
        console.log('[stripe-cancel-room-subscription] Cancelled room subscription:', subscriptionId, 'for room:', roomId);
      } catch (_e) {
        if (_e.code !== 'resource_missing') throw _e;
        console.log('[stripe-cancel-room-subscription] Subscription already gone:', subscriptionId);
      }
    }

    await db.collection('rooms').doc(roomId).collection('subscription').doc('main').update({
      status: 'canceled',
      canceledAt: new Date().toISOString(),
    }).catch(function(){});

    return res.status(200).json({ success: true });
  } catch (_e) {
    console.error('[stripe-cancel-room-subscription] Error:', _e.message);
    return res.status(500).json({ error: _e.message });
  }
}
