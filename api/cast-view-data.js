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
    console.error('[cast-view-data] Firebase init error:', _e.message);
    throw _e;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    var uid = req.query.uid;
    var castId = req.query.id;

    if (!uid || !castId) {
      return res.status(400).json({ error: 'uid and id are required' });
    }

    var db = getDb();
    var doc = await db.collection('users').doc(uid).collection('data').doc('main').get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Data not found' });
    }

    var data = doc.data();
    var cast = (data.casts || []).find(function(c) { return c.id === castId; });
    if (!cast) {
      return res.status(404).json({ error: 'Cast not found' });
    }

    // そのキャスト分のデータのみ返す
    return res.status(200).json({
      cast: cast,
      records: (data.records || {})[castId] || [],
      customers: (data.customers || {})[castId] || [],
    });
  } catch (_e) {
    console.error('[cast-view-data] Error:', _e.message);
    return res.status(500).json({ error: _e.message });
  }
}
