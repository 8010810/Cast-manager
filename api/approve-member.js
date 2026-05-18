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
    console.error('[approve-member] Firebase init error:', _e.message);
    throw _e;
  }
}

const ACCOUNT_ADD_PRICE = 'price_1TXgqSQaq3EwNY4QdQVc6rNT';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    var ownerUid = req.body.ownerUid;
    var memberUid = req.body.memberUid;
    var memberUserName = req.body.memberUserName || '';
    var roomId = req.body.roomId;
    var roomName = req.body.roomName || '';
    var inviteCode = req.body.inviteCode || '';

    if (!ownerUid || !memberUid || !roomId) {
      return res.status(400).json({ error: 'ownerUid, memberUid and roomId are required' });
    }

    var stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    var db = getDb();
    var now = new Date().toISOString();

    // 管理者のサブスクが有効かを先に確認してブロック
    var subDoc = await db.collection('users').doc(ownerUid).collection('subscription').doc('main').get();
    if (!subDoc.exists || !subDoc.data().subscriptionId || subDoc.data().status !== 'active') {
      console.log('[approve-member] No active subscription for owner, blocking approval');
      return res.status(400).json({ error: '管理者のサブスクリプションが有効ではないため承認できません' });
    }

    // Admin SDK でセキュリティルールを迂回して両コレクションに書き込む
    await Promise.all([
      db.collection('rooms').doc(roomId).collection('members').doc(memberUid).set({
        role: 'member',
        userName: memberUserName,
        joinedAt: now,
        isInvited: true,
        invitedBy: ownerUid,
      }),
      db.collection('users').doc(memberUid).collection('rooms').doc(roomId).set({
        name: roomName,
        role: 'member',
        inviteCode: inviteCode,
        joinedAt: now,
      }),
      db.collection('rooms').doc(roomId).collection('joinRequests').doc(memberUid).delete(),
    ]);

    // メンバーのminiサブスクがあればキャンセル
    var memberSubDoc = await db.collection('users').doc(memberUid).collection('subscription').doc('main').get();
    if (memberSubDoc.exists && memberSubDoc.data().subscriptionId) {
      try {
        await stripe.subscriptions.cancel(memberSubDoc.data().subscriptionId);
        await db.collection('users').doc(memberUid).collection('subscription').doc('main').delete();
        console.log('[approve-member] Cancelled mini subscription for member:', memberUid);
      } catch (_subErr) {
        console.log('[approve-member] Mini sub cancel skipped:', _subErr.message);
      }
    }

    // Stripe即時課金（stripe-add-memberと同じロジック）
    var subData = subDoc.data();
    var subscriptionId = subData.subscriptionId;
    var customerId = subData.customerId;

    // Firestoreの実際の招待メンバー数を正として数量更新
    var membersSnap = await db.collection('rooms').doc(roomId).collection('members')
      .where('isInvited', '==', true).get();
    var newQuantity = membersSnap.size;

    var subscription = await stripe.subscriptions.retrieve(subscriptionId);
    var item = subscription.items.data.find(function(i) { return i.price.id === ACCOUNT_ADD_PRICE; });

    var invoice;
    try {
      if (item) {
        await stripe.subscriptionItems.update(item.id, {
          quantity: newQuantity,
          proration_behavior: 'none',
        });
      } else {
        await stripe.subscriptionItems.create({
          subscription: subscriptionId,
          price: ACCOUNT_ADD_PRICE,
          quantity: newQuantity,
          proration_behavior: 'none',
        });
      }

      // 即時請求
      var invoiceItem = await stripe.invoiceItems.create({
        customer: customerId,
        subscription: subscriptionId,
        amount: 1000,
        currency: 'jpy',
        description: 'メンバー追加費用（招待）',
      });
      invoice = await stripe.invoices.create({
        customer: customerId,
        subscription: subscriptionId,
        auto_advance: false,
      });
      await stripe.invoices.pay(invoice.id, { off_session: true });
    } catch (_e) {
      console.error('[approve-member] Billing error:', _e.message);
      if (invoice && invoice.id) {
        await stripe.invoices.voidInvoice(invoice.id).catch(function(){});
      }
      return res.status(200).json({ success: true, billed: false, billingError: _e.message });
    }

    await db.collection('users').doc(ownerUid).collection('subscription').doc('main').update({
      memberCount: newQuantity,
    });

    console.log('[approve-member] Approved and billed. member:', memberUid, 'room:', roomId, 'quantity:', newQuantity);
    return res.status(200).json({ success: true, billed: true, quantity: newQuantity });
  } catch (_e) {
    console.error('[approve-member] Error:', _e.message);
    return res.status(500).json({ error: _e.message });
  }
}
