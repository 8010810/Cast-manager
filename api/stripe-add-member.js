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
    console.error('[stripe-add-member] Firebase init error:', _e.message);
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
    var roomId = req.body.roomId;

    if (!ownerUid || !roomId) {
      return res.status(400).json({ error: 'ownerUid and roomId are required' });
    }

    var db = getDb();
    var subDoc = await db.collection('users').doc(ownerUid).collection('subscription').doc('main').get();
    if (!subDoc.exists) {
      return res.status(404).json({ error: 'Owner subscription not found' });
    }

    var subData = subDoc.data();
    var subscriptionId = subData.subscriptionId;
    var customerId = subData.customerId;

    if (!subscriptionId || !customerId) {
      return res.status(400).json({ error: 'Owner has no active subscription' });
    }

    var subscription = await stripe.subscriptions.retrieve(subscriptionId);
    var item = subscription.items.data.find(function(i) { return i.price.id === ACCOUNT_ADD_PRICE; });

    // サブスクから支払い方法を取得（invoices.payに必要）
    var paymentMethodId = subscription.default_payment_method;
    if (!paymentMethodId) {
      var customer = await stripe.customers.retrieve(customerId);
      paymentMethodId = customer.invoice_settings && customer.invoice_settings.default_payment_method
        || customer.default_source
        || null;
    }

    var newQuantity;
    if (item) {
      newQuantity = (item.quantity || 0) + 1;
      await stripe.subscriptionItems.update(item.id, {
        quantity: newQuantity,
        proration_behavior: 'none',
      });
    } else {
      await stripe.subscriptionItems.create({
        subscription: subscriptionId,
        price: ACCOUNT_ADD_PRICE,
        quantity: 1,
        proration_behavior: 'none',
      });
      newQuantity = 1;
    }

    // 即時¥1,000請求
    await stripe.invoiceItems.create({
      customer: customerId,
      amount: 1000,
      currency: 'jpy',
      description: 'メンバー追加費用（招待）',
    });
    var invoice = await stripe.invoices.create({
      customer: customerId,
      auto_advance: false,
    });
    await stripe.invoices.finalizeInvoice(invoice.id);
    var payOpts = paymentMethodId ? { payment_method: paymentMethodId } : {};
    await stripe.invoices.pay(invoice.id, payOpts);

    await db.collection('users').doc(ownerUid).collection('subscription').doc('main').update({
      memberCount: newQuantity,
    });

    console.log('[stripe-add-member] Added member for owner:', ownerUid, 'quantity:', newQuantity);
    return res.status(200).json({ success: true, quantity: newQuantity });
  } catch (_e) {
    console.error('[stripe-add-member] Error:', _e.message);
    return res.status(500).json({ error: _e.message });
  }
}
