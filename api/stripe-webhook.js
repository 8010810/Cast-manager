import Stripe from 'stripe';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const config = {
  api: { bodyParser: false },
};

function getRawBody(req) {
  return new Promise(function(resolve, reject) {
    var chunks = [];
    req.on('data', function(chunk) { chunks.push(chunk); });
    req.on('end', function() { resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

function getDb() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      }),
    });
  }
  return getFirestore();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    var rawBody = await getRawBody(req);
    var sig = req.headers['stripe-signature'];
    var stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    var event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (_e) {
      return res.status(400).json({ error: 'Webhook signature verification failed: ' + _e.message });
    }

    if (event.type === 'checkout.session.completed') {
      var session = event.data.object;
      var uid = session.metadata && session.metadata.uid;

      if (uid) {
        var db = getDb();
        await db.collection('users').doc(uid).collection('subscription').doc('main').set({
          status: 'active',
          sessionId: session.id,
          customerId: session.customer || '',
          subscriptionId: session.subscription || '',
          customerEmail: session.customer_email || '',
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }
    }

    return res.status(200).json({ received: true });
  } catch (_e) {
    return res.status(500).json({ error: _e.message });
  }
}
