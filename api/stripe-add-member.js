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
    var roomId = req.body.roomId;
    var memberUid = req.body.memberUid || '';
    var memberUserName = req.body.memberUserName || '';

    if (!roomId) {
      return res.status(400).json({ error: 'roomId is required' });
    }

    var db = getDb();
    var subDoc = await db.collection('rooms').doc(roomId).collection('subscription').doc('main').get();
    if (!subDoc.exists) {
      return res.status(404).json({ error: 'Room subscription not found' });
    }

    var subData = subDoc.data();
    var subscriptionId = subData.subscriptionId;
    var customerId = subData.customerId;

    if (!subscriptionId || !customerId) {
      return res.status(400).json({ error: 'Room has no active subscription' });
    }

    // 管理者を除く招待済みメンバー数（isInvited===true）のみカウント
    var membersSnap = await db.collection('rooms').doc(roomId).collection('members').get();
    var newQuantity = membersSnap.docs.filter(function(doc) { return doc.data().isInvited === true; }).length;

    var subscription = await stripe.subscriptions.retrieve(subscriptionId);
    var item = subscription.items.data.find(function(i) { return i.price.id === ACCOUNT_ADD_PRICE; });

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

    // 即時¥1,000請求：サブスクに紐付けて作成することでCheckout決済方法が使える
    var invoiceItem = await stripe.invoiceItems.create({
      customer: customerId,
      subscription: subscriptionId,
      amount: 1000,
      currency: 'jpy',
      description: 'メンバー追加費用（招待）',
    });
    var invoice = null;
    try {
      invoice = await stripe.invoices.create({
        customer: customerId,
        subscription: subscriptionId,
        auto_advance: false,
      });
      await stripe.invoices.finalizeInvoice(invoice.id);
      await stripe.invoices.pay(invoice.id, { off_session: true });
    } catch (_payErr) {
      console.error('[stripe-add-member] Invoice pay failed:', _payErr.message);
      if (invoice) {
        await stripe.invoices.voidInvoice(invoice.id).catch(function(_e2) {
          console.error('[stripe-add-member] Failed to void invoice:', _e2.message);
        });
      } else {
        await stripe.invoiceItems.del(invoiceItem.id).catch(function(_e2) {
          console.error('[stripe-add-member] Failed to delete invoiceItem:', _e2.message);
        });
      }
      throw _payErr;
    }

    await db.collection('rooms').doc(roomId).collection('subscription').doc('main').update({
      memberCount: newQuantity,
    });

    // メンバーの個人フォルダをAdmin SDKで確実に作成
    if (memberUid) {
      try {
        var dataDoc = await db.collection('rooms').doc(roomId).collection('data').doc('main').get();
        var roomData = dataDoc.exists ? dataDoc.data() : {};
        var folders = roomData.folders || [];
        var folderExists = folders.find(function(f) { return f.ownerUid === memberUid; });
        if (!folderExists) {
          var newFolder = {
            id: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
            name: memberUserName || 'メンバー',
            castIds: [],
            ownerUid: memberUid,
          };
          await db.collection('rooms').doc(roomId).collection('data').doc('main')
            .set({ folders: folders.concat([newFolder]) }, { merge: true });
          console.log('[stripe-add-member] Created personal folder for member:', memberUid);
        }
      } catch (_folderErr) {
        console.error('[stripe-add-member] Folder creation error:', _folderErr.message);
      }
    }

    console.log('[stripe-add-member] Added member for room:', roomId, 'quantity:', newQuantity);
    return res.status(200).json({ success: true, quantity: newQuantity });
  } catch (_e) {
    console.error('[stripe-add-member] Error:', _e.message);
    return res.status(500).json({ error: _e.message });
  }
}
