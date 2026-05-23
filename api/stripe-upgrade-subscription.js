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
    console.error('[stripe-upgrade-subscription] Firebase init error:', _e.message);
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
    var newPriceId = req.body.priceId;
    var roomId = req.body.roomId || '';

    if (!uid || !newPriceId) {
      return res.status(400).json({ error: 'uid and priceId are required' });
    }

    var db = getDb();
    var subDoc = await db.collection('users').doc(uid).collection('subscription').doc('main').get();

    if (!subDoc.exists) {
      return res.status(400).json({ error: 'No subscription found' });
    }

    var subData = subDoc.data();
    var subscriptionId = subData.subscriptionId;

    if (!subscriptionId) {
      return res.status(400).json({ error: 'No subscription ID' });
    }

    var subscription = await stripe.subscriptions.retrieve(subscriptionId);
    var item = subscription.items.data[0];

    if (!item) {
      return res.status(400).json({ error: 'No subscription item found' });
    }

    // プロレーションなしでプライスを差し替え
    await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: item.id, price: newPriceId }],
      proration_behavior: 'none',
      cancel_at_period_end: false,
    });

    // std.料金をその場で即時請求
    var price = await stripe.prices.retrieve(newPriceId);
    var invoiceItem = await stripe.invoiceItems.create({
      customer: subscription.customer,
      subscription: subscriptionId,
      amount: price.unit_amount,
      currency: price.currency,
      description: 'standardプランアップグレード',
    });
    var invoice = null;
    try {
      invoice = await stripe.invoices.create({
        customer: subscription.customer,
        subscription: subscriptionId,
        auto_advance: false,
      });
      await stripe.invoices.finalizeInvoice(invoice.id);
      await stripe.invoices.pay(invoice.id, { off_session: true });
    } catch (_payErr) {
      console.error('[stripe-upgrade-subscription] Invoice pay failed:', _payErr.message);
      if (invoice) {
        await stripe.invoices.voidInvoice(invoice.id).catch(function() {});
      } else {
        await stripe.invoiceItems.del(invoiceItem.id).catch(function() {});
      }
      throw _payErr;
    }

    await db.collection('users').doc(uid).collection('subscription').doc('main').update({
      plan: 'standard',
      cancelAtPeriodEnd: false,
      cancelAt: null,
    });

    // Save subscription to room doc and clear pendingPayment
    if (roomId) {
      var updatedSub = await db.collection('users').doc(uid).collection('subscription').doc('main').get();
      var subInfo = updatedSub.data();
      await db.collection('rooms').doc(roomId).collection('subscription').doc('main').set({
        plan: 'standard',
        status: 'active',
        subscriptionId: subInfo.subscriptionId || '',
        customerId: subInfo.customerId || '',
        createdAt: new Date().toISOString(),
        cancelAtPeriodEnd: false,
        cancelAt: null,
        ownerUid: uid,
      });
      await db.collection('users').doc(uid).collection('rooms').doc(roomId).update({ pendingPayment: false }).catch(function() {});
      await db.collection('rooms').doc(roomId).update({ pendingPayment: false }).catch(function() {});
    }

    console.log('[stripe-upgrade-subscription] Upgraded to std for uid:', uid, 'price:', newPriceId, 'roomId:', roomId);
    return res.status(200).json({ success: true });
  } catch (_e) {
    console.error('[stripe-upgrade-subscription] Error:', _e.message);
    return res.status(500).json({ error: _e.message });
  }
}
