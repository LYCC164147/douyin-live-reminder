const WX_APPID = process.env.WX_APPID;
const WX_SECRET = proces…RET;
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: '缺少 code' });
  try {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${WX_APPID}&secret=***&js_code=${code}&grant_type=authorization_code`;
    const wxRes = await fetch(url); const data = await wxRes.json();
    if (data.openid) return res.json({ success: true, openid: data.openid, sessionKey: data.session_key });
    return res.json({ success: false, error: data.errmsg || '登录失败' });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}