import { sendSubscribeMessage } from './_lib/wx.js';
import { getStreamerInfo, getStreamerSubscribers, getLastNotified, setLastNotified } from './_lib/db.js';

const NOTIFY_COOLDOWN_MS = 30 * 60 * 1000;
const TEMPLATE_ID = process.env.WX_TEMPLATE_ID || '';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { secUid } = req.method === 'GET' ? req.query : req.body;
  if (!secUid) return res.status(400).json({ error: '缺少 secUid' });
  try {
    const info = await getStreamerInfo(secUid);
    if (!info) return res.status(404).json({ error: '未找到该主播' });
    const subscribers = await getStreamerSubscribers(secUid);
    if (!subscribers || subscribers.length === 0) {
      return res.json({ success: true, message: '没有订阅者', sent: 0 });
    }
    let sent = 0;
    for (const openid of subscribers) {
      const lastNotified = await getLastNotified(openid, secUid);
      if (Date.now() - lastNotified < NOTIFY_COOLDOWN_MS) continue;
      if (TEMPLATE_ID) {
        const result = await sendSubscribeMessage({
          openid,
          templateId: TEMPLATE_ID,
          page: `pages/detail/detail?secUid=${secUid}`,
          data: {
            thing1: { value: (info.nickname || '').slice(0, 20) },
            thing2: { value: (info.title || '正在直播').slice(0, 20) },
            time3: { value: new Date().toLocaleString('zh-CN') },
            thing4: { value: '正在直播，快来观看！' },
          },
        });
        if (result.success) {
          await setLastNotified(openid, secUid);
          sent++;
        }
      }
    }
    return res.json({ success: true, sent, total: subscribers.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
