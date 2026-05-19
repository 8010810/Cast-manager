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
    console.error('[clear-billing-deadline] Firebase init error:', _e.message);
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
    var roomId = req.body.roomId;
    var uid = req.body.uid;

    if (!roomId || !uid) {
      return res.status(400).json({ error: 'roomId and uid are required' });
    }

    var db = getDb();

    // 管理者であることを確認
    var memberDoc = await db.collection('rooms').doc(roomId).collection('members').doc(uid).get();
    if (!memberDoc.exists || memberDoc.data().role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await db.collection('rooms').doc(roomId).update({ billingDeadline: null });
    console.log('[clear-billing-deadline] Cleared for room:', roomId, 'uid:', uid);
    return res.status(200).json({ success: true });
  } catch (_e) {
    console.error('[clear-billing-deadline] Error:', _e.message);
    return res.status(500).json({ error: _e.message });
  }
}
