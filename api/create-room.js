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

function generateInviteCode() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var code = '';
  for (var i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
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
    var roomName = (req.body.roomName || '').trim();
    var userName = req.body.userName || '';
    var trial = !!req.body.trial; // true = stdトライアル

    if (!roomName) return res.status(400).json({ error: 'roomName is required' });

    var inviteCode = generateInviteCode();
    var rid = db.collection('rooms').doc().id;
    var now = new Date().toISOString();
    var inviteCodeExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    var folderName = userName || 'オーナー';
    var initData = {
      casts: [], records: {}, customers: {},
      folders: [
        { id: Math.random().toString(36).slice(2), name: '新入店', castIds: [] },
        { id: Math.random().toString(36).slice(2), name: folderName, castIds: [], ownerUid: uid },
      ],
      shifts: {}, visits: [], quota: {},
    };

    await db.collection('rooms').doc(rid).set({
      name: roomName, ownerUid: uid, createdAt: now, inviteCode: inviteCode,
      inviteCodeExpiresAt: inviteCodeExpiresAt,
    });
    await db.collection('rooms').doc(rid).collection('data').doc('main').set(initData);
    await db.collection('rooms').doc(rid).collection('members').doc(uid).set({
      role: 'admin', userName: userName, joinedAt: now,
    });
    await db.collection('users').doc(uid).collection('rooms').doc(rid).set({
      name: roomName, role: 'admin', inviteCode: inviteCode, joinedAt: now,
    });
    await db.collection('users').doc(uid).collection('meta').doc('consent')
      .update({ lastRoomId: rid }).catch(function() {});

    if (trial) {
      var trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await db.collection('rooms').doc(rid).collection('subscription').doc('main').set({
        plan: 'standard', status: 'trialing', ownerUid: uid,
        trialStartAt: now, trialEndsAt: trialEndsAt, createdAt: now,
      });
    }

    return res.status(200).json({ ok: true, roomId: rid, inviteCode: inviteCode });
  } catch (_e) {
    console.error('[create-room] error:', _e.message);
    return res.status(500).json({ error: _e.message });
  }
}
