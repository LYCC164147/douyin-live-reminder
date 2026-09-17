import { addSubscription, removeSubscription, getUserSubscriptions } from './_lib/db.js';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { openid, secUid, nickname, avatar, douyinId, roomId } = req.method === 'GET' ? req.query : req.body;
  if (!openid) return res.status(400).json({ error: '缺少 openid' });
  try {
    switch (req.method) {
      case 'GET': return res.json({ success: true, data: await getUserSubscriptions(openid) });
      case 'POST': {
        if (!secUid) return res.status(400).json({ error: '缺少 secUid' });
        return res.json(await addSubscription(openid, { secUid, nickname: nickname||'', avatar: avatar||'', douyinId: douyinId||'', roomId: roomId||'' }));
      }
      case 'DELETE': {
        if (!secUid) return res.status(400).json({ error: '缺少 secUid' });
        return res.json(await removeSubscription(openid, secUid));
      }
      default: return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err) { return res.status(500).json({ error: err.message }); }
}