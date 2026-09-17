import { kv } from '@vercel/kv';

export async function getUserSubscriptions(openid) {
  const secUids = await kv.smembers(`user:${openid}:subs`);
  if (!secUids || secUids.length === 0) return [];
  const pipeline = kv.pipeline();
  for (const secUid of secUids) pipeline.get(`streamer:${secUid}`);
  const streamers = await pipeline.exec();
  return streamers.filter(Boolean).map((s, i) => ({ ...s, secUid: secUids[i] }));
}

export async function addSubscription(openid, streamerInfo) {
  const { secUid, nickname, avatar, douyinId, roomId } = streamerInfo;
  await kv.set(`streamer:${secUid}`, { nickname, avatar, douyinId, roomId: roomId || '', addedAt: Date.now() });
  await kv.set(`streamer:${secUid}:live_status`, 'offline');
  await kv.sadd(`user:${openid}:subs`, secUid);
  await kv.set(`sub:${openid}:${secUid}`, { addedAt: Date.now(), lastNotified: 0 });
  await kv.sadd(`streamer:${secUid}:subscribers`, openid);
  return { success: true };
}

export async function removeSubscription(openid, secUid) {
  await kv.srem(`user:${openid}:subs`, secUid);
  await kv.del(`sub:${openid}:${secUid}`);
  await kv.srem(`streamer:${secUid}:subscribers`, openid);
  return { success: true };
}

export async function getStreamerStatus(secUid) { return await kv.get(`streamer:${secUid}:live_status`); }
export async function setStreamerStatus(secUid, status) { await kv.set(`streamer:${secUid}:live_status`, status); }
export async function getAllStreamerIds() {
  const keys = await kv.keys('streamer:*:live_status');
  return keys.map(k => k.replace('streamer:', '').replace(':live_status', ''));
}
export async function getStreamerInfo(secUid) { return await kv.get(`streamer:${secUid}`); }
export async function updateStreamerInfo(secUid, info) {
  const existing = await kv.get(`streamer:${secUid}`) || {};
  await kv.set(`streamer:${secUid}`, { ...existing, ...info });
}
export async function getStreamerSubscribers(secUid) { return await kv.smembers(`streamer:${secUid}:subscribers`); }
export async function setLastNotified(openid, secUid) {
  const key = `sub:${openid}:${secUid}`; const sub = await kv.get(key) || {};
  sub.lastNotified = Date.now(); await kv.set(key, sub);
}
export async function getLastNotified(openid, secUid) {
  const sub = await kv.get(`sub:${openid}:${secUid}`); return sub?.lastNotified || 0;
}