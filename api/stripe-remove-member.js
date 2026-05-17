import Stripe from 'stripe';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const ACCOUNT_ADD_PRICE = 'price_1TXgqSQaq3EwNY4QdQVc6rNT';

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
    console.error('[stripe-remove-member] Firebase init error:', _e.message);
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
    var ownerUid = req.body.ownerUid;

    if (!ownerUid) {
      return res.status(400).json({ error: 'ownerUid is required' });
    }

    var db = getDb();
    var subDoc = await db.collection('users').doc(ownerUid).collection('subscription').doc('main').get();
    if (!subDoc.exists) {
      return res.status(200).json({ success: true, message: 'No subscription found' });
    }

    var subData = subDoc.data();
    var subscriptionId = subData.subscriptionId;
    if (!subscriptionId) {
      return res.status(200).json({ success: true, message: 'No subscription ID' });
    }

    var subscription = await stripe.subscriptions.retrieve(subscriptionId);
    var item = subscription.items.data.find(function(i) { return i.price.id === ACCOUNT_ADD_PRICE; });

    if (!item || item.quantity <= 0) {
      return res.status(200).json({ success: true, message: 'No ACCOUNT_ADD item to decrease' });
    }

    var newQuantity = Math.max(0, (item.quantity || 1) - 1);
    await stripe.subscriptionItems.update(item.id, {
      quantity: newQuantity,
      proration_behavior: 'none',
    });

    await db.collection('users').doc(ownerUid).collection('subscription').doc('main').update({
      memberCount: newQuantity,
    });

    console.log('[stripe-remove-member] Removed member for owner:', ownerUid, 'quantity:', newQuantity);
    return res.status(200).json({ success: true, quantity: newQuantity });
  } catch (_e) {
    console.error('[stripe-remove-member] Error:', _e.message);
    return res.status(500).json({ error: _e.message });
  }
}
