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
    console.error('[kick-member] Firebase init error:', _e.message);
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
    var targetUid = req.body.targetUid;
    var roomId = req.body.roomId;

    if (!targetUid || !roomId) {
      return res.status(400).json({ error: 'targetUid and roomId are required' });
    }

    var db = getDb();

    // Admin SDK でセキュリティルールを迂回して確実に削除
    await Promise.all([
      db.collection('rooms').doc(roomId).collection('members').doc(targetUid).delete(),
      db.collection('users').doc(targetUid).collection('rooms').doc(roomId).delete(),
    ]);

    console.log('[kick-member] Kicked', targetUid, 'from room', roomId);
    return res.status(200).json({ success: true });
  } catch (_e) {
    console.error('[kick-member] Error:', _e.message);
    return res.status(500).json({ error: _e.message });
  }
}
