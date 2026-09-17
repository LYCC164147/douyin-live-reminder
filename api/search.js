import { searchStreamer } from './_lib/douyin.js';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { keyword } = req.query;
  if (!keyword) return res.status(400).json({ error: '请输入搜索关键词' });
  try { return res.json(await searchStreamer(keyword)); }
  catch (err) { return res.status(500).json({ error: err.message }); }
}