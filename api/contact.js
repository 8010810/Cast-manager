import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    var email = (req.body.email || '').trim();
    var phone = (req.body.phone || '').trim();
    var message = (req.body.message || '').trim();
    var userName = (req.body.userName || '').trim();

    if (!message) {
      return res.status(400).json({ error: 'お問い合わせ内容を入力してください' });
    }
    if (!email && !phone) {
      return res.status(400).json({ error: 'メールアドレスまたは電話番号を入力してください' });
    }

    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD || !process.env.SUPPORT_EMAIL) {
      console.error('[contact] Missing GMAIL_USER, GMAIL_APP_PASSWORD, or SUPPORT_EMAIL');
      return res.status(500).json({ error: 'メール設定が未完了です' });
    }

    var body = [
      '【Cast Manager お問い合わせ】',
      '',
      '送信者名: ' + (userName || '未設定'),
      'メールアドレス: ' + (email || '未入力'),
      '電話番号: ' + (phone || '未入力'),
      '',
      '--- お問い合わせ内容 ---',
      message,
    ].join('\n');

    var transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: 'CAST MANAGER <' + process.env.GMAIL_USER + '>',
      to: process.env.SUPPORT_EMAIL,
      replyTo: email || undefined,
      subject: '【お問い合わせ】' + (userName || '匿名') + 'さんからのメッセージ',
      text: body,
    });

    console.log('[contact] Sent inquiry from', email || phone);
    return res.status(200).json({ success: true });
  } catch (_e) {
    console.error('[contact] Error:', _e.message);
    return res.status(500).json({ error: _e.message });
  }
}
