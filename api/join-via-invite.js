import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

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
    console.error('[join-via-invite] Firebase init error:', _e.message);
    throw _e;
  }
}

function getAdminAuth() {
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
    return getAuth();
  } catch (_e) {
    console.error('[join-via-invite] Firebase init error:', _e.message);
    throw _e;
  }
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
    var decoded = await getAdminAuth().verifyIdToken(idToken).catch(function() { return null; });
    if (!decoded) return res.status(401).json({ error: 'Invalid token' });
    var callerUid = decoded.uid;

    var roomId = req.body.roomId;
    var token = req.body.token;
    var userName = req.body.userName || '';
    var ownerUid = req.body.ownerUid || '';
    var roomName = req.body.roomName || '';
    var inviteCode = req.body.inviteCode || '';

    if (!roomId || !token) {
      return res.status(400).json({ error: 'roomId and token are required' });
    }

    var db = getDb();

    // トークンの有効性を確認
    var tokenDoc = await db.collection('rooms').doc(roomId).collection('inviteTokens').doc(token).get();
    if (!tokenDoc.exists) return res.status(400).json({ error: 'Invalid invite token' });
    var tokenData = tokenDoc.data();
    if (tokenData.used) return res.status(400).json({ error: 'Invite token already used' });
    if (tokenData.expiresAt && new Date(tokenData.expiresAt) < new Date()) {
      return res.status(400).json({ error: 'Invite token expired' });
    }

    // 既参加チェック
    var memDoc = await db.collection('rooms').doc(roomId).collection('members').doc(callerUid).get();
    if (memDoc.exists) return res.status(200).json({ success: true, alreadyMember: true });

    var now = new Date().toISOString();

    // Admin SDK で書き込み（セキュリティルールを迂回）
    await Promise.all([
      db.collection('rooms').doc(roomId).collection('members').doc(callerUid).set({
        role: 'member',
        userName: userName,
        joinedAt: now,
        isInvited: true,
        invitedBy: ownerUid,
      }),
      db.collection('users').doc(callerUid).collection('rooms').doc(roomId).set({
        name: roomName,
        role: 'member',
        inviteCode: inviteCode,
        joinedAt: now,
      }),
      db.collection('rooms').doc(roomId).collection('inviteTokens').doc(token).update({
        used: true,
        usedBy: callerUid,
        usedAt: now,
      }),
    ]);

    console.log('[join-via-invite] Joined room:', callerUid, '->', roomId);
    return res.status(200).json({ success: true });
  } catch (_e) {
    console.error('[join-via-invite] Error:', _e.message);
    return res.status(500).json({ error: _e.message });
  }
}
