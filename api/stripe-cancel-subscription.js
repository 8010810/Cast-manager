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
    console.error('[stripe-cancel-subscription] Firebase init error:', _e.message);
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

    if (!uid) {
      return res.status(400).json({ error: 'uid is required' });
    }

    var db = getDb();
    var subDoc = await db.collection('users').doc(uid).collection('subscription').doc('main').get();

    if (!subDoc.exists) {
      return res.status(200).json({ success: true, message: 'No subscription found' });
    }

    var subData = subDoc.data();
    var subscriptionId = subData.subscriptionId;

    if (!subscriptionId) {
      return res.status(200).json({ success: true, message: 'No subscription ID' });
    }

    // 期間末キャンセル（即時停止ではなく更新日に停止）
    var subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    var periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

    // Firestoreに解約予定を記録
    await db.collection('users').doc(uid).collection('subscription').doc('main').update({
      cancelAtPeriodEnd: true,
      cancelAt: periodEnd,
    });

    console.log('[stripe-cancel-subscription] Scheduled cancel for uid:', uid, 'at:', periodEnd);
    return res.status(200).json({ success: true, cancelAt: periodEnd });
  } catch (_e) {
    console.error('[stripe-cancel-subscription] Error:', _e.message);
    return res.status(500).json({ error: _e.message });
  }
}
