import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

function getServices() {
  if (getApps().length === 0) {
    var privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    initializeApp({ credential: cert({
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID || '',
      private_key: privateKey,
      client_email: process.env.FIREBASE_CLIENT_EMAIL || '',
    }) });
  }
  return { db: getFirestore(), adminAuth: getAuth() };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    var authHeader = req.headers['authorization'] || '';
    var idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!idToken) return res.status(401).json({ error: 'Unauthorized' });

    var { db, adminAuth } = getServices();
    var decoded = await adminAuth.verifyIdToken(idToken).catch(function() { return null; });
    if (!decoded) return res.status(401).json({ error: 'Invalid token' });

    var uid = decoded.uid;
    var plan = req.body.plan || 'mini'; // 'mini' or 'standard'
    var roomId = req.body.roomId || '';

    var now = new Date().toISOString();
    var trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    if (plan === 'standard' && roomId) {
      // Verify user owns the room
      var roomDoc = await db.collection('rooms').doc(roomId).get();
      if (!roomDoc.exists || roomDoc.data().ownerUid !== uid) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      await db.collection('rooms').doc(roomId).collection('subscription').doc('main').set({
        plan: 'standard',
        status: 'trialing',
        ownerUid: uid,
        trialStartAt: now,
        trialEndsAt: trialEndsAt,
        createdAt: now,
      });
    } else {
      await db.collection('users').doc(uid).collection('subscription').doc('main').set({
        plan: 'mini',
        status: 'trialing',
        trialStartAt: now,
        trialEndsAt: trialEndsAt,
        createdAt: now,
      });
    }

    return res.status(200).json({ ok: true, trialEndsAt: trialEndsAt });
  } catch (_e) {
    console.error('[start-trial] error:', _e.message);
    return res.status(500).json({ error: _e.message });
  }
}
