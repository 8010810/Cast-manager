import Stripe from 'stripe';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const MINI_MONTHLY_PRICE = 'price_1TXgkgQaq3EwNY4QyYQ6sea2';
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
    console.error('[stripe-transfer-owner] Firebase init error:', _e.message);
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
    var oldOwnerUid = req.body.oldOwnerUid;
    var newOwnerUid = req.body.newOwnerUid;
    var roomId = req.body.roomId;

    if (!oldOwnerUid || !newOwnerUid || !roomId) {
      return res.status(400).json({ error: 'oldOwnerUid, newOwnerUid, roomId are required' });
    }

    var db = getDb();

    // 旧オーナーのサブスク取得
    var oldSubDoc = await db.collection('users').doc(oldOwnerUid).collection('subscription').doc('main').get();
    if (!oldSubDoc.exists) {
      return res.status(404).json({ error: 'Old owner subscription not found' });
    }
    var oldSubData = oldSubDoc.data();
    var oldSubscriptionId = oldSubData.subscriptionId;
    var oldCustomerId = oldSubData.customerId;

    if (!oldSubscriptionId || !oldCustomerId) {
      return res.status(400).json({ error: 'Old owner has no active subscription' });
    }

    // 新オーナーのStripe顧客IDを取得または作成
    var newSubDoc = await db.collection('users').doc(newOwnerUid).collection('subscription').doc('main').get();
    var newCustomerId = newSubDoc.exists ? (newSubDoc.data().customerId || null) : null;
    if (!newCustomerId) {
      var customer = await stripe.customers.create({
        metadata: { uid: newOwnerUid },
      });
      newCustomerId = customer.id;
    }

    // 旧サブスクの内容を取得
    var oldSub = await stripe.subscriptions.retrieve(oldSubscriptionId);
    var stdItem = oldSub.items.data.find(function(i) { return i.price.id !== ACCOUNT_ADD_PRICE; });
    var accountAddItem = oldSub.items.data.find(function(i) { return i.price.id === ACCOUNT_ADD_PRICE; });

    // 旧サブスクをキャンセル
    await stripe.subscriptions.cancel(oldSubscriptionId);

    // 新オーナー用サブスク作成（STD + ACCOUNT_ADD）
    var newItems = [];
    if (stdItem) newItems.push({ price: stdItem.price.id });
    if (accountAddItem && (accountAddItem.quantity || 0) > 0) {
      newItems.push({ price: ACCOUNT_ADD_PRICE, quantity: accountAddItem.quantity });
    }
    var newSub = await stripe.subscriptions.create({
      customer: newCustomerId,
      items: newItems,
    });

    // 旧オーナー用miniサブスク作成
    var miniSub = await stripe.subscriptions.create({
      customer: oldCustomerId,
      items: [{ price: MINI_MONTHLY_PRICE }],
    });

    var now = new Date().toISOString();

    // Firestore更新
    await db.collection('users').doc(newOwnerUid).collection('subscription').doc('main').set({
      plan: 'standard',
      status: 'active',
      subscriptionId: newSub.id,
      customerId: newCustomerId,
      createdAt: now,
    });
    await db.collection('users').doc(oldOwnerUid).collection('subscription').doc('main').set({
      plan: 'mini',
      status: 'active',
      subscriptionId: miniSub.id,
      customerId: oldCustomerId,
      createdAt: now,
    });

    // ルームのオーナー更新
    await db.collection('rooms').doc(roomId).update({ ownerUid: newOwnerUid });
    // 新オーナーのロールをadminに
    await db.collection('rooms').doc(roomId).collection('members').doc(newOwnerUid).update({ role: 'admin' });
    // 旧オーナーのロールをmemberに
    await db.collection('rooms').doc(roomId).collection('members').doc(oldOwnerUid).update({ role: 'member' });

    console.log('[stripe-transfer-owner] Transferred from', oldOwnerUid, 'to', newOwnerUid);
    return res.status(200).json({ success: true });
  } catch (_e) {
    console.error('[stripe-transfer-owner] Error:', _e.message);
    return res.status(500).json({ error: _e.message });
  }
}
