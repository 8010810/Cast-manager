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

    // 旧サブスクを即時キャンセルし、残り期間を新オーナーのトライアルとして引き継ぐ
    var oldSubDoc = await db.collection('users').doc(oldOwnerUid).collection('subscription').doc('main').get();
    var trialEnd = null;
    if (oldSubDoc.exists && oldSubDoc.data().subscriptionId) {
      try {
        var oldSub = await stripe.subscriptions.retrieve(oldSubDoc.data().subscriptionId);
        trialEnd = oldSub.current_period_end; // Unixタイムスタンプ（秒）
        await stripe.subscriptions.cancel(oldSubDoc.data().subscriptionId);
        await db.collection('users').doc(oldOwnerUid).collection('subscription').doc('main').update({
          status: 'canceled', cancelAtPeriodEnd: false,
        });
      } catch (_stripeErr) {
        console.log('[stripe-transfer-owner] Stripe cancel skipped:', _stripeErr.message);
      }
    }

    // 新オーナーのmetaに残り期間を保存（チェックアウト時のトライアル用）
    if (trialEnd) {
      await db.collection('users').doc(newOwnerUid).collection('meta').doc('consent')
        .set({ transferTrialEnd: trialEnd }, { merge: true });
    }

    // Firestore: ルームのオーナー更新
    await db.collection('rooms').doc(roomId).update({ ownerUid: newOwnerUid });
    // 新オーナーのロールをadminに
    await db.collection('rooms').doc(roomId).collection('members').doc(newOwnerUid).update({ role: 'admin' });
    // 旧オーナーのロールをsub-adminに
    await db.collection('rooms').doc(roomId).collection('members').doc(oldOwnerUid).update({ role: 'sub-admin' });
    // users側のロールも更新
    await db.collection('users').doc(newOwnerUid).collection('rooms').doc(roomId).update({ role: 'admin' }).catch(function(){});
    await db.collection('users').doc(oldOwnerUid).collection('rooms').doc(roomId).update({ role: 'sub-admin' }).catch(function(){});

    console.log('[stripe-transfer-owner] Transferred from', oldOwnerUid, 'to', newOwnerUid);
    return res.status(200).json({ success: true });
  } catch (_e) {
    console.error('[stripe-transfer-owner] Error:', _e.message);
    return res.status(500).json({ error: _e.message });
  }
}
