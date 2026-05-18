import Stripe from 'stripe';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const config = {
  api: { bodyParser: false },
};

function getRawBody(req) {
  return new Promise(function(resolve, reject) {
    var chunks = [];
    req.on('data', function(chunk) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    });
    req.on('end', function() { resolve(Buffer.concat(chunks)); });
    req.on('error', function(err) { reject(err); });
  });
}

function getDb() {
  try {
    if (getApps().length === 0) {
      var privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
      var serviceAccount = {
        type: 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID || '',
        private_key: privateKey,
        client_email: process.env.FIREBASE_CLIENT_EMAIL || '',
      };
      console.log('[stripe-webhook] Firebase init project_id:', serviceAccount.project_id);
      initializeApp({ credential: cert(serviceAccount) });
    }
    return getFirestore();
  } catch (_e) {
    console.error('[stripe-webhook] Firebase init error:', _e.message);
    throw _e;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (_e) {
    console.error('[stripe-webhook] Failed to read raw body:', _e.message);
    return res.status(400).json({ error: 'Failed to read request body' });
  }

  var sig = req.headers['stripe-signature'];
  if (!sig) {
    console.error('[stripe-webhook] Missing stripe-signature header');
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  var stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  var event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (_e) {
    console.error('[stripe-webhook] Signature verification failed:', _e.message);
    return res.status(400).json({ error: 'Webhook signature verification failed: ' + _e.message });
  }

  console.log('[stripe-webhook] Event received:', event.type);

  try {
    if (event.type === 'checkout.session.completed') {
      var session = event.data.object;
      var uid = session.client_reference_id || (session.metadata && session.metadata.uid) || '';
      var plan = (session.metadata && session.metadata.plan) || 'standard';

      console.log('[stripe-webhook] checkout.session.completed uid:', uid, 'plan:', plan);

      if (!uid) {
        console.error('[stripe-webhook] No uid found in session');
        return res.status(200).json({ received: true, warning: 'No uid' });
      }

      var db = getDb();
      await db.collection('users').doc(uid).collection('subscription').doc('main').set({
        plan: plan,
        status: 'active',
        subscriptionId: session.subscription || '',
        customerId: session.customer || '',
        createdAt: new Date().toISOString(),
        cancelAtPeriodEnd: false,
        cancelAt: null,
      });

      console.log('[stripe-webhook] Subscription saved for uid:', uid);
    }

    if (event.type === 'customer.subscription.deleted') {
      // 期間末キャンセルが実際に完了したとき
      var subscription = event.data.object;
      var customerId = subscription.customer;
      var db2 = getDb();

      // customerIdからuidを検索
      var usersSnap = await db2.collectionGroup('subscription').where('customerId', '==', customerId).limit(1).get();
      if (!usersSnap.empty) {
        var subRef = usersSnap.docs[0].ref;
        await subRef.update({
          status: 'canceled',
          canceledAt: new Date().toISOString(),
        });
        console.log('[stripe-webhook] Subscription marked canceled for customer:', customerId);
      } else {
        console.log('[stripe-webhook] No subscription doc found for customer:', customerId);
      }
    }

    return res.status(200).json({ received: true });
  } catch (_e) {
    console.error('[stripe-webhook] Handler error:', _e.message, _e.stack);
    return res.status(500).json({ error: _e.message });
  }
}
