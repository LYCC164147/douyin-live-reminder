import { getLiveStatus } from './_lib/douyin.js';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { secUid, roomId, douyinId } = req.query;
  if (!secUid && !roomId && !douyinId) return res.status(400).json({ error: '缺少参数' });
  try { return res.json(await getLiveStatus(roomId || douyinId || secUid)); }
  catch (err) { return res.status(500).json({ error: err.message }); }
}