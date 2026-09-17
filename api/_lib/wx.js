const WX_APPID = process.env.WX_APPID;
const WX_SECRET = proces…RET;
let tokenCache = { token: '', expire: 0 };

export async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expire) return tokenCache.token;
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${WX_APPID}&secret=***
  const res = await fetch(url);
  const data = await res.json();
  if (data.access_token) {
    tokenCache = { token: data.access_token, expire: Date.now() + (data.expires_in - 300) * 1000 };
    return data.access_token;
  }
  throw new Error(`获取 access_token 失败: ${data.errmsg || JSON.stringify(data)}`);
}

export async function sendSubscribeMessage({ openid, templateId, page, data }) {
  const token = await getAccessToken();
  const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=***
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ touser: openid, template_id: templateId, page: page || 'pages/index/index', data })
  });
  const result = await res.json();
  if (result.errcode !== 0) return { success: false, error: result.errmsg };
  return { success: true };
}