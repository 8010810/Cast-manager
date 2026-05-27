import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function getAdminAuth() {
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
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    var email = (req.body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'メールアドレスを入力してください' });

    var apiKey = process.env.RESEND_API_KEY;
    var fromEmail = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !fromEmail) {
      console.error('[send-password-reset] Missing RESEND_API_KEY or RESEND_FROM_EMAIL');
      return res.status(500).json({ error: 'メール設定が未完了です' });
    }

    var adminAuth = getAdminAuth();

    // ユーザー存在確認（存在しない場合は成功レスポンスを返して列挙攻撃を防ぐ）
    var userExists = true;
    await adminAuth.getUserByEmail(email).catch(function(ex) {
      if (ex.code === 'auth/user-not-found') userExists = false;
    });
    if (!userExists) {
      // セキュリティ上、存在しないアドレスでも成功を返す
      return res.status(200).json({ success: true });
    }

    var resetLink = await adminAuth.generatePasswordResetLink(email);

    var html = [
      '<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0d0d1a;color:#e5e7eb;border-radius:12px;">',
      '<div style="text-align:center;margin-bottom:24px;">',
      '<p style="font-size:22px;font-weight:300;letter-spacing:0.3em;color:#e8b86d;margin:0;">CAST MANAGER</p>',
      '</div>',
      '<p style="font-size:15px;font-weight:700;color:#f3f4f6;margin-bottom:8px;">パスワードのリセット</p>',
      '<p style="font-size:13px;color:#9ca3af;line-height:1.7;margin-bottom:24px;">',
      'パスワードリセットのリクエストを受け付けました。<br>以下のボタンをクリックして新しいパスワードを設定してください。',
      '</p>',
      '<div style="text-align:center;margin-bottom:24px;">',
      '<a href="' + resetLink + '" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#c9983a,#e8b86d);color:#0d0d1a;font-weight:700;font-size:14px;text-decoration:none;border-radius:8px;">パスワードをリセットする</a>',
      '</div>',
      '<p style="font-size:12px;color:#6b7280;line-height:1.7;">',
      'このリンクは1時間で期限切れになります。<br>',
      'このメールに心当たりがない場合は無視してください。<br>',
      'パスワードは変更されません。',
      '</p>',
      '<hr style="border:none;border-top:1px solid #1e2035;margin:24px 0;">',
      '<p style="font-size:11px;color:#4b5563;text-align:center;">CAST MANAGER</p>',
      '</div>',
    ].join('');

    var response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email],
        subject: '【CAST MANAGER】パスワードリセットのご案内',
        html: html,
      }),
    });

    if (!response.ok) {
      var errData = await response.json().catch(function() { return {}; });
      console.error('[send-password-reset] Resend error:', errData);
      return res.status(500).json({ error: '送信に失敗しました' });
    }

    console.log('[send-password-reset] Sent reset email to', email);
    return res.status(200).json({ success: true });
  } catch (_e) {
    console.error('[send-password-reset] Error:', _e.message);
    return res.status(500).json({ error: _e.message });
  }
}
