import { getLiveStatus } from './_lib/douyin.js';
import { sendSubscribeMessage } from './_lib/wx.js';
import { getAllStreamerIds, getStreamerStatus, setStreamerStatus, getStreamerInfo, getStreamerSubscribers, getLastNotified, setLastNotified, updateStreamerInfo } from './_lib/db.js';

const NOTIFY_COOLDOWN_MS = 30 * 60 * 1000;
const TEMPLATE_ID = process.env.WX_TEMPLATE_ID || '';

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const streamerIds = await getAllStreamerIds();
    const results = [];
    for (const secUid of streamerIds) {
      const info = await getStreamerInfo(secUid);
      if (!info) continue;
      const liveInfo = info.roomId ? await getLiveStatus(info.roomId) : await getLiveStatus(info.douyinId || secUid);
      if (!liveInfo.success) { results.push({ secUid, status: 'error', error: liveInfo.error }); continue; }
      if (liveInfo.roomId && !info.roomId) await updateStreamerInfo(secUid, { roomId: liveInfo.roomId });
      const oldStatus = await getStreamerStatus(secUid);
      const newStatus = liveInfo.status;
      if (oldStatus === newStatus) { results.push({ secUid, status: newStatus, changed: false }); continue; }
      await setStreamerStatus(secUid, newStatus);
      results.push({ secUid, status: newStatus, changed: true });
      if (newStatus === 'live' && oldStatus !== 'live') {
        const subscribers = await getStreamerSubscribers(secUid);
        for (const openid of subscribers) {
          if (Date.now() - (await getLastNotified(openid, secUid)) < NOTIFY_COOLDOWN_MS) continue;
          if (TEMPLATE_ID) {
            const r = await sendSubscribeMessage({ openid, templateId: TEMPLATE_ID, page: `pages/detail/detail?secUid=${secUid}`, data: { thing1: { value: info.nickname || liveInfo.nickname }, thing2: { value: (liveInfo.title||'').slice(0,20) }, time3: { value: new Date().toLocaleString('zh-CN') }, thing4: { value: '正在直播，快来观看！' } } });
            if (r.success) await setLastNotified(openid, secUid);
          }
        }
      }
    }
    return res.json({ success: true, checked: streamerIds.length, results });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}