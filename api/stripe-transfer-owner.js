import Stripe from 'stripe';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

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
    var oldOwnerUid = req.body.oldOwnerUid;
    var newOwnerUid = req.body.newOwnerUid;
    var roomId = req.body.roomId;

    if (!oldOwnerUid || !newOwnerUid || !roomId) {
      return res.status(400).json({ error: 'oldOwnerUid, newOwnerUid, roomId are required' });
    }

    var db = getDb();

    // ルームのオーナー更新
    await db.collection('rooms').doc(roomId).update({ ownerUid: newOwnerUid });

    // 新オーナーのロールをadminに、isInvitedを削除（連携アカウント数カウントから除外）
    await db.collection('rooms').doc(roomId).collection('members').doc(newOwnerUid).update({
      role: 'admin',
      isInvited: FieldValue.delete(),
    });

    // 旧オーナーのロールをsub-adminに、isInvited=trueで連携アカウントとしてカウント
    await db.collection('rooms').doc(roomId).collection('members').doc(oldOwnerUid).update({
      role: 'sub-admin',
      isInvited: true,
    });

    // users側のロールも更新
    await db.collection('users').doc(newOwnerUid).collection('rooms').doc(roomId).update({ role: 'admin' }).catch(function(){});
    await db.collection('users').doc(oldOwnerUid).collection('rooms').doc(roomId).update({ role: 'sub-admin' }).catch(function(){});

    // ルームのサブスクのownerUidも更新
    await db.collection('rooms').doc(roomId).collection('subscription').doc('main').update({
      ownerUid: newOwnerUid,
    }).catch(function(){});

    // Firestore更新後に isInvited===true のメンバー数で Stripe を同期
    try {
      var stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      var subDoc = await db.collection('rooms').doc(roomId).collection('subscription').doc('main').get();
      if (subDoc.exists) {
        var subData = subDoc.data();
        var subscriptionId = subData.subscriptionId;
        if (subscriptionId) {
          var membersSnap = await db.collection('rooms').doc(roomId).collection('members').get();
          var newQuantity = membersSnap.docs.filter(function(doc) { return doc.data().isInvited === true; }).length;
          var subscription = await stripe.subscriptions.retrieve(subscriptionId);
          var item = subscription.items.data.find(function(i) { return i.price.id === ACCOUNT_ADD_PRICE; });
          if (item) {
            await stripe.subscriptionItems.update(item.id, {
              quantity: newQuantity,
              proration_behavior: 'none',
            });
            await db.collection('rooms').doc(roomId).collection('subscription').doc('main').update({
              memberCount: newQuantity,
            });
            console.log('[stripe-transfer-owner] Updated Stripe quantity to', newQuantity);
          }
        }
      }
    } catch (_stripeErr) {
      console.error('[stripe-transfer-owner] Stripe sync error:', _stripeErr.message);
    }

    console.log('[stripe-transfer-owner] Transferred from', oldOwnerUid, 'to', newOwnerUid);
    return res.status(200).json({ success: true });
  } catch (_e) {
    console.error('[stripe-transfer-owner] Error:', _e.message);
    return res.status(500).json({ error: _e.message });
  }
}
