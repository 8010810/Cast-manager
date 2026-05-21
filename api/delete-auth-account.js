import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

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
    console.error('[delete-auth-account] Firebase init error:', _e.message);
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
    var uid = req.body.uid;
    if (!uid) {
      return res.status(400).json({ error: 'uid is required' });
    }

    var adminAuth = getAdminAuth();
    await adminAuth.deleteUser(uid);
    console.log('[delete-auth-account] Deleted auth user:', uid);
    return res.status(200).json({ success: true });
  } catch (_e) {
    if (_e.code === 'auth/user-not-found') {
      return res.status(200).json({ success: true, message: 'User already deleted' });
    }
    console.error('[delete-auth-account] Error:', _e.message);
    return res.status(500).json({ error: _e.message });
  }
}
