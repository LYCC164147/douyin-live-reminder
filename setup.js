// setup.js - 在项目目录运行 node setup.js 自动创建所有文件
const fs = require('fs');
const path = require('path');

const files = {
  "package.json": `{
  "name": "douyin-live-reminder",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "vercel dev",
    "deploy": "vercel --prod"
  },
  "dependencies": {
    "@vercel/kv": "^1.0.0",
    "cheerio": "^1.0.0-rc.12"
  }
}`,

  "vercel.json": `{
  "version": 2,
  "builds": [
    { "src": "api/**/*.js", "use": "@vercel/node" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/$1" }
  ],
  "crons": [
    {
      "path": "/api/check",
      "schedule": "*/3 * * * *"
    }
  ]
}`,

  "api/_lib/douyin.js": `export async function getLiveStatus(roomIdOrSecUid) {
  try {
    const url = \`https://live.douyin.com/web/room/info?aid=6383&app_name=douyin_web&live_id=1&device_platform=web&language=zh-CN&browser_language=zh-CN&browser_platform=Win32&browser_name=Edge&browser_version=120.0.0.0&web_rid=\${roomIdOrSecUid}\`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://live.douyin.com/',
      }
    });
    const data = await res.json();
    if (data?.data?.data?.[0]) {
      const room = data.data.data[0];
      return {
        success: true, roomId: room.id_str || roomIdOrSecUid,
        title: room.title || '', nickname: room.owner?.nickname || '',
        avatar: room.owner?.avatar_thumb?.url_list?.[0] || '',
        status: room.status === 2 ? 'live' : 'offline',
        viewerCount: room.user_count || 0, secUid: room.owner?.sec_uid || ''
      };
    }
    return { success: false, error: '未找到直播间' };
  } catch (err) { return { success: false, error: err.message }; }
}

export async function searchStreamer(keyword) {
  try {
    const url = \`https://www.douyin.com/aweme/v1/web/discover/search/?keyword=\${encodeURIComponent(keyword)}&search_channel=aweme_user_web&search_source=normal_search&query_correct_type=1&is_filter_search=0&from_group_id=&offset=0&count=10&aid=6383&device_platform=webapp\`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Referer': 'https://www.douyin.com/' }
    });
    const data = await res.json();
    if (data?.user_list) {
      return { success: true, users: data.user_list.map(u => ({
        nickname: u.user_info?.nickname || '', avatar: u.user_info?.avatar_thumb?.url_list?.[0] || '',
        secUid: u.user_info?.sec_uid || '', douyinId: u.user_info?.unique_id || u.user_info?.short_id || '',
        signature: u.user_info?.signature || '', followerCount: u.user_info?.follower_count || 0
      }))};
    }
    return { success: false, error: '搜索失败' };
  } catch (err) { return { success: false, error: err.message }; }
}`,

  "api/_lib/wx.js": `const WX_APPID = process.env.WX_APPID;
const WX_SECRET = proces…RET;
let tokenCache = { token: '', expire: 0 };

export async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expire) return tokenCache.token;
  const url = \`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=\${WX_APPID}&secret=***
  const res = await fetch(url);
  const data = await res.json();
  if (data.access_token) {
    tokenCache = { token: data.access_token, expire: Date.now() + (data.expires_in - 300) * 1000 };
    return data.access_token;
  }
  throw new Error(\`获取 access_token 失败: \${data.errmsg || JSON.stringify(data)}\`);
}

export async function sendSubscribeMessage({ openid, templateId, page, data }) {
  const token = await getAccessToken();
  const url = \`https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=***
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ touser: openid, template_id: templateId, page: page || 'pages/index/index', data })
  });
  const result = await res.json();
  if (result.errcode !== 0) return { success: false, error: result.errmsg };
  return { success: true };
}`,

  "api/_lib/db.js": `import { kv } from '@vercel/kv';

export async function getUserSubscriptions(openid) {
  const secUids = await kv.smembers(\`user:\${openid}:subs\`);
  if (!secUids || secUids.length === 0) return [];
  const pipeline = kv.pipeline();
  for (const secUid of secUids) pipeline.get(\`streamer:\${secUid}\`);
  const streamers = await pipeline.exec();
  return streamers.filter(Boolean).map((s, i) => ({ ...s, secUid: secUids[i] }));
}

export async function addSubscription(openid, streamerInfo) {
  const { secUid, nickname, avatar, douyinId, roomId } = streamerInfo;
  await kv.set(\`streamer:\${secUid}\`, { nickname, avatar, douyinId, roomId: roomId || '', addedAt: Date.now() });
  await kv.set(\`streamer:\${secUid}:live_status\`, 'offline');
  await kv.sadd(\`user:\${openid}:subs\`, secUid);
  await kv.set(\`sub:\${openid}:\${secUid}\`, { addedAt: Date.now(), lastNotified: 0 });
  await kv.sadd(\`streamer:\${secUid}:subscribers\`, openid);
  return { success: true };
}

export async function removeSubscription(openid, secUid) {
  await kv.srem(\`user:\${openid}:subs\`, secUid);
  await kv.del(\`sub:\${openid}:\${secUid}\`);
  await kv.srem(\`streamer:\${secUid}:subscribers\`, openid);
  return { success: true };
}

export async function getStreamerStatus(secUid) { return await kv.get(\`streamer:\${secUid}:live_status\`); }
export async function setStreamerStatus(secUid, status) { await kv.set(\`streamer:\${secUid}:live_status\`, status); }
export async function getAllStreamerIds() {
  const keys = await kv.keys('streamer:*:live_status');
  return keys.map(k => k.replace('streamer:', '').replace(':live_status', ''));
}
export async function getStreamerInfo(secUid) { return await kv.get(\`streamer:\${secUid}\`); }
export async function updateStreamerInfo(secUid, info) {
  const existing = await kv.get(\`streamer:\${secUid}\`) || {};
  await kv.set(\`streamer:\${secUid}\`, { ...existing, ...info });
}
export async function getStreamerSubscribers(secUid) { return await kv.smembers(\`streamer:\${secUid}:subscribers\`); }
export async function setLastNotified(openid, secUid) {
  const key = \`sub:\${openid}:\${secUid}\`; const sub = await kv.get(key) || {};
  sub.lastNotified = Date.now(); await kv.set(key, sub);
}
export async function getLastNotified(openid, secUid) {
  const sub = await kv.get(\`sub:\${openid}:\${secUid}\`); return sub?.lastNotified || 0;
}`,

  "api/login.js": `const WX_APPID = process.env.WX_APPID;
const WX_SECRET = proces…RET;
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: '缺少 code' });
  try {
    const url = \`https://api.weixin.qq.com/sns/jscode2session?appid=\${WX_APPID}&secret=***&js_code=\${code}&grant_type=authorization_code\`;
    const wxRes = await fetch(url); const data = await wxRes.json();
    if (data.openid) return res.json({ success: true, openid: data.openid, sessionKey: data.session_key });
    return res.json({ success: false, error: data.errmsg || '登录失败' });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}`,

  "api/search.js": `import { searchStreamer } from './_lib/douyin.js';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { keyword } = req.query;
  if (!keyword) return res.status(400).json({ error: '请输入搜索关键词' });
  try { return res.json(await searchStreamer(keyword)); }
  catch (err) { return res.status(500).json({ error: err.message }); }
}`,

  "api/subscribe.js": `import { addSubscription, removeSubscription, getUserSubscriptions } from './_lib/db.js';
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
}`,

  "api/status.js": `import { getLiveStatus } from './_lib/douyin.js';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const { secUid, roomId, douyinId } = req.query;
  if (!secUid && !roomId && !douyinId) return res.status(400).json({ error: '缺少参数' });
  try { return res.json(await getLiveStatus(roomId || douyinId || secUid)); }
  catch (err) { return res.status(500).json({ error: err.message }); }
}`,

  "api/check.js": `import { getLiveStatus } from './_lib/douyin.js';
import { sendSubscribeMessage } from './_lib/wx.js';
import { getAllStreamerIds, getStreamerStatus, setStreamerStatus, getStreamerInfo, getStreamerSubscribers, getLastNotified, setLastNotified, updateStreamerInfo } from './_lib/db.js';

const NOTIFY_COOLDOWN_MS = 30 * 60 * 1000;
const TEMPLATE_ID = process.env.WX_TEMPLATE_ID || '';

export default async function handler(req, res) {
  if (req.headers.authorization !== \`Bearer \${process.env.CRON_SECRET}\`) return res.status(401).json({ error: 'Unauthorized' });
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
            const r = await sendSubscribeMessage({ openid, templateId: TEMPLATE_ID, page: \`pages/detail/detail?secUid=\${secUid}\`, data: { thing1: { value: info.nickname || liveInfo.nickname }, thing2: { value: (liveInfo.title||'').slice(0,20) }, time3: { value: new Date().toLocaleString('zh-CN') }, thing4: { value: '正在直播，快来观看！' } } });
            if (r.success) await setLastNotified(openid, secUid);
          }
        }
      }
    }
    return res.json({ success: true, checked: streamerIds.length, results });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}`,

  "mini-program/app.json": `{ "pages": ["pages/index/index","pages/add/add","pages/detail/detail"], "window": { "navigationBarTitleText": "开播提醒", "navigationBarBackgroundColor": "#FE2C55", "navigationBarTextStyle": "white", "backgroundColor": "#f5f5f5" }, "style": "v2", "sitemapLocation": "sitemap.json" }`,

  "mini-program/app.js": `App({
  globalData: { openid: '', baseUrl: 'https://your-project.vercel.app' },
  onLaunch() { this.login(); },
  login() {
    wx.login({ success: (res) => {
      if (res.code) {
        wx.request({ url: \`\${this.globalData.baseUrl}/api/login\`, method: 'POST', data: { code: res.code },
          success: (resp) => { if (resp.data.success) this.globalData.openid = resp.data.openid; }
        });
      }
    }});
  }
});`,

  "mini-program/app.wxss": `page { background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #333; }
.container { padding: 30rpx; }
.btn-primary { background: #FE2C55; color: #fff; border: none; border-radius: 12rpx; font-size: 30rpx; padding: 20rpx 40rpx; }
.btn-primary::after { border: none; }
.btn-secondary { background: #fff; color: #FE2C55; border: 2rpx solid #FE2C55; border-radius: 12rpx; font-size: 28rpx; padding: 16rpx 32rpx; }
.card { background: #fff; border-radius: 16rpx; padding: 24rpx; margin-bottom: 20rpx; box-shadow: 0 2rpx 12rpx rgba(0,0,0,0.05); }`,

  "mini-program/sitemap.json": `{ "desc": "关于本文件的更多信息，请参考文档", "rules": [{ "action": "allow", "page": "*" }] }`,

  "mini-program/utils/api.js": `const app = getApp();
const request = (url, method, data) => new Promise((resolve, reject) => {
  wx.request({ url: \`\${app.globalData.baseUrl}\${url}\`, method, data, header: { 'Content-Type': 'application/json' },
    success: (res) => resolve(res.data), fail: (err) => reject(err) });
});
module.exports = { request };`,

  "mini-program/pages/index/index.wxml": `<view class="container">
  <view class="header"><text class="title">我的关注</text><view class="add-btn" bindtap="goAdd">+ 添加主播</view></view>
  <view class="empty" wx:if="{{list.length === 0 && !loading}}"><text class="empty-icon">📺</text><text class="empty-text">还没有关注任何主播</text><view class="btn-primary" style="margin-top:40rpx;" bindtap="goAdd">去添加</view></view>
  <view class="streamer-list" wx:if="{{list.length > 0}}">
    <view class="streamer-card" wx:for="{{list}}" wx:key="secUid" bindtap="goDetail" data-sec-uid="{{item.secUid}}">
      <image class="avatar" src="{{item.avatar}}" mode="aspectFill" />
      <view class="info"><view class="name">{{item.nickname || '未知主播'}}</view><view class="douyin-id" wx:if="{{item.douyinId}}">抖音号: {{item.douyinId}}</view></view>
      <view class="status {{item.isLive ? 'live' : 'offline'}}">{{item.isLive ? '直播中' : '未开播'}}</view>
    </view>
  </view>
  <view class="loading" wx:if="{{loading}}"><text>加载中...</text></view>
</view>`,

  "mini-program/pages/index/index.js": `const { request } = require('../../utils/api');
Page({
  data: { list: [], loading: true },
  onShow() { this.loadSubscriptions(); },
  async loadSubscriptions() {
    const app = getApp();
    if (!app.globalData.openid) { setTimeout(() => this.loadSubscriptions(), 500); return; }
    this.setData({ loading: true });
    try {
      const res = await request(\`/api/subscribe?openid=\${app.globalData.openid}\`, 'GET');
      if (res.success) {
        const list = await Promise.all((res.data||[]).map(async s => {
          try { const r = await request(\`/api/status?secUid=\${s.secUid}\`, 'GET'); return { ...s, isLive: r.status === 'live' }; }
          catch { return { ...s, isLive: false }; }
        }));
        this.setData({ list, loading: false });
      }
    } catch { this.setData({ loading: false }); wx.showToast({ title: '加载失败', icon: 'none' }); }
  },
  goAdd() { wx.navigateTo({ url: '/pages/add/add' }); },
  goDetail(e) { wx.navigateTo({ url: \`/pages/detail/detail?secUid=\${e.currentTarget.dataset.secUid}\` }); },
  onPullDownRefresh() { this.loadSubscriptions().then(() => wx.stopPullDownRefresh()); }
});`,

  "mini-program/pages/index/index.wxss": `.header { display:flex; justify-content:space-between; align-items:center; margin-bottom:30rpx; }
.title { font-size:44rpx; font-weight:bold; }
.add-btn { background:#FE2C55; color:#fff; font-size:28rpx; padding:12rpx 24rpx; border-radius:8rpx; }
.empty { text-align:center; padding:120rpx 0; }
.empty-icon { font-size:100rpx; display:block; margin-bottom:20rpx; }
.empty-text { color:#999; font-size:30rpx; }
.streamer-card { display:flex; align-items:center; background:#fff; padding:24rpx; border-radius:16rpx; margin-bottom:16rpx; }
.avatar { width:100rpx; height:100rpx; border-radius:50%; margin-right:24rpx; background:#eee; }
.info { flex:1; }
.name { font-size:32rpx; font-weight:600; margin-bottom:6rpx; }
.douyin-id { font-size:24rpx; color:#999; }
.status { font-size:26rpx; padding:8rpx 20rpx; border-radius:20rpx; }
.status.live { background:#FE2C55; color:#fff; }
.status.offline { background:#f0f0f0; color:#999; }`,

  "mini-program/pages/index/index.json": `{ "navigationBarTitleText": "我的关注", "enablePullDownRefresh": true }`,

  "mini-program/pages/add/add.wxml": `<view class="container">
  <view class="search-bar"><input class="search-input" placeholder="输入抖音号或主播昵称" bindinput="onInput" value="{{keyword}}" /><view class="btn-primary search-btn" bindtap="doSearch">搜索</view></view>
  <view class="results" wx:if="{{results.length > 0}}">
    <view class="result-card" wx:for="{{results}}" wx:key="secUid">
      <image class="avatar" src="{{item.avatar}}" mode="aspectFill" />
      <view class="info"><view class="name">{{item.nickname}}</view><view class="desc">抖音号: {{item.douyinId || '未知'}}</view></view>
      <view class="add-btn-wrap"><view class="btn-primary add-btn" bindtap="subscribe" data-index="{{index}}">{{item.subscribed ? '已关注' : '关注'}}</view></view>
    </view>
  </view>
  <view class="empty" wx:if="{{searched && results.length === 0 && !searching}}"><text class="empty-text">未找到相关主播</text></view>
  <view class="loading" wx:if="{{searching}}"><text>搜索中...</text></view>
  <view class="manual-add card">
    <view class="section-title">手动添加</view>
    <view class="form-item"><text class="label">直播间号</text><input class="input" placeholder="输入直播间ID" bindinput="onRoomIdInput" value="{{roomId}}" /></view>
    <view class="form-item"><text class="label">主播昵称</text><input class="input" placeholder="输入主播昵称（选填）" bindinput="onNickInput" value="{{nickName}}" /></view>
    <view class="btn-primary" style="margin-top:20rpx;" bindtap="manualAdd">添加关注</view>
  </view>
</view>`,

  "mini-program/pages/add/add.js": `const { request } = require('../../utils/api');
Page({
  data: { keyword:'', roomId:'', nickName:'', results:[], searched:false, searching:false },
  onInput(e) { this.setData({ keyword: e.detail.value }); },
  onRoomIdInput(e) { this.setData({ roomId: e.detail.value }); },
  onNickInput(e) { this.setData({ nickName: e.detail.value }); },
  async doSearch() {
    if (!this.data.keyword.trim()) { wx.showToast({ title:'请输入关键词', icon:'none' }); return; }
    this.setData({ searching:true, searched:false });
    try {
      const res = await request(\`/api/search?keyword=\${encodeURIComponent(this.data.keyword)}\`, 'GET');
      if (res.success) this.setData({ results:(res.users||[]).map(u=>({...u,subscribed:false})), searched:true });
      else wx.showToast({ title:res.error||'搜索失败', icon:'none' });
    } catch { wx.showToast({ title:'网络错误', icon:'none' }); }
    finally { this.setData({ searching:false }); }
  },
  async subscribe(e) {
    const i = e.currentTarget.dataset.index, s = this.data.results[i], app = getApp();
    if (s.subscribed) return;
    wx.requestSubscribeMessage({ tmplIds:[app.globalData.templateId||''], success(){}, fail(){} });
    try {
      const res = await request('/api/subscribe','POST',{ openid:app.globalData.openid, secUid:s.secUid, nickname:s.nickname, avatar:s.avatar, douyinId:s.douyinId });
      if (res.success) { this.setData({ [\`results[\${i}].subscribed\`]:true }); wx.showToast({ title:'关注成功', icon:'success' }); }
      else wx.showToast({ title:res.error||'关注失败', icon:'none' });
    } catch { wx.showToast({ title:'网络错误', icon:'none' }); }
  },
  async manualAdd() {
    if (!this.data.roomId.trim()) { wx.showToast({ title:'请输入直播间号', icon:'none' }); return; }
    const app = getApp();
    wx.requestSubscribeMessage({ tmplIds:[app.globalData.templateId||''], success(){}, fail(){} });
    try {
      const res = await request('/api/subscribe','POST',{ openid:app.globalData.openid, secUid:this.data.roomId, nickname:this.data.nickName||'未命名主播', roomId:this.data.roomId });
      if (res.success) { wx.showToast({ title:'添加成功', icon:'success' }); setTimeout(()=>wx.navigateBack(),1000); }
      else wx.showToast({ title:res.error||'添加失败', icon:'none' });
    } catch { wx.showToast({ title:'网络错误', icon:'none' }); }
  }
});`,

  "mini-program/pages/add/add.wxss": `.search-bar { display:flex; gap:16rpx; margin-bottom:30rpx; }
.search-input { flex:1; background:#fff; padding:16rpx 24rpx; border-radius:12rpx; font-size:28rpx; }
.search-btn { padding:16rpx 32rpx; font-size:28rpx; }
.result-card { display:flex; align-items:center; background:#fff; padding:24rpx; border-radius:16rpx; margin-bottom:16rpx; }
.result-card .avatar { width:80rpx; height:80rpx; border-radius:50%; margin-right:20rpx; background:#eee; }
.result-card .info { flex:1; }
.result-card .name { font-size:30rpx; font-weight:600; }
.result-card .desc { font-size:24rpx; color:#999; margin-top:4rpx; }
.add-btn-wrap .add-btn { font-size:24rpx; padding:10rpx 24rpx; }
.manual-add { margin-top:40rpx; }
.section-title { font-size:32rpx; font-weight:600; margin-bottom:20rpx; }
.form-item { display:flex; align-items:center; margin-bottom:16rpx; }
.label { width:160rpx; font-size:28rpx; color:#666; }
.input { flex:1; background:#f5f5f5; padding:16rpx 20rpx; border-radius:8rpx; font-size:28rpx; }`,

  "mini-program/pages/add/add.json": `{ "navigationBarTitleText": "添加主播" }`,

  "mini-program/pages/detail/detail.wxml": `<view class="container">
  <view class="profile card">
    <image class="avatar" src="{{streamer.avatar}}" mode="aspectFill" />
    <view class="info"><view class="name">{{streamer.nickname || '未知主播'}}</view><view class="douyin-id" wx:if="{{streamer.douyinId}}">抖音号: {{streamer.douyinId}}</view></view>
    <view class="status {{isLive ? 'live' : 'offline'}}">{{isLive ? '🔴 直播中' : '⚫ 未开播'}}</view>
  </view>
  <view class="card" wx:if="{{isLive}}">
    <view class="section-title">直播信息</view>
    <view class="info-row"><text class="info-label">标题</text><text class="info-value">{{liveTitle || '暂无'}}</text></view>
    <view class="info-row"><text class="info-label">观看人数</text><text class="info-value">{{viewerCount || 0}}</text></view>
  </view>
  <view class="actions">
    <button class="btn-primary" open-type="share">分享给朋友</button>
    <button class="btn-secondary" style="margin-top:20rpx;" bindtap="removeSub">取消关注</button>
  </view>
</view>`,

  "mini-program/pages/detail/detail.js": `const { request } = require('../../utils/api');
Page({
  data: { secUid:'', streamer:{}, isLive:false, liveTitle:'', viewerCount:0 },
  onLoad(options) { this.setData({ secUid:options.secUid }); this.loadDetail(); },
  async loadDetail() {
    const app = getApp();
    try {
      const subs = await request(\`/api/subscribe?openid=\${app.globalData.openid}\`, 'GET');
      if (subs.success) { const s = subs.data.find(x => x.secUid === this.data.secUid); if (s) this.setData({ streamer:s }); }
      const st = await request(\`/api/status?secUid=\${this.data.secUid}\`, 'GET');
      if (st.success) this.setData({ isLive:st.status==='live', liveTitle:st.title||'', viewerCount:st.viewerCount||0 });
    } catch {}
  },
  async removeSub() {
    const app = getApp();
    wx.showModal({ title:'确认取消关注', content:'取消后将不再收到该主播的开播提醒',
      success: async (r) => {
        if (r.confirm) {
          try { const res = await request('/api/subscribe','DELETE',{ openid:app.globalData.openid, secUid:this.data.secUid });
            if (res.success) { wx.showToast({ title:'已取消关注', icon:'success' }); setTimeout(()=>wx.navigateBack(),1000); }
          } catch { wx.showToast({ title:'操作失败', icon:'none' }); }
        }
      }
    });
  },
  onShareAppMessage() { return { title:\`快来关注 \${this.data.streamer.nickname} 的直播！\`, path:\`/pages/detail/detail?secUid=\${this.data.secUid}\` }; }
});`,

  "mini-program/pages/detail/detail.wxss": `.profile { display:flex; align-items:center; }
.avatar { width:120rpx; height:120rpx; border-radius:50%; margin-right:24rpx; background:#eee; }
.info { flex:1; }
.name { font-size:36rpx; font-weight:bold; }
.douyin-id { font-size:24rpx; color:#999; margin-top:4rpx; }
.status { font-size:26rpx; padding:8rpx 20rpx; border-radius:20rpx; }
.status.live { background:#FE2C55; color:#fff; }
.status.offline { background:#f0f0f0; color:#999; }
.section-title { font-size:30rpx; font-weight:600; margin-bottom:16rpx; }
.info-row { display:flex; justify-content:space-between; padding:12rpx 0; border-bottom:1rpx solid #f0f0f0; }
.info-label { color:#666; font-size:28rpx; }
.info-value { font-size:28rpx; }
.actions { margin-top:40rpx; }`,

  "mini-program/pages/detail/detail.json": `{ "navigationBarTitleText": "主播详情" }`,

  "mini-program/project.config.json": `{
  "description": "抖音开播提醒小程序",
  "setting": { "es6": true, "postcss": true, "minified": true, "enhance": true, "minifyWXSS": true, "minifyWXML": true },
  "compileType": "miniprogram", "libVersion": "3.3.4", "appid": "YOUR_APPID", "projectname": "douyin-live-reminder"
}`
};

for (const [filePath, content] of Object.entries(files)) {
  const fullPath = path.join(__dirname, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  console.log(`✅ ${filePath}`);
}
console.log('\n🎉 所有文件创建完成！');