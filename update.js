const fs = require('fs');
const path = require('path');

const files = {
  "api/setting.js": `import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    if (req.method === 'GET') {
      const settings = await kv.get('monitor:settings');
      return res.json({ success: true, data: settings || { startHour: 8, endHour: 23 } });
    }
    if (req.method === 'POST') {
      const { openid, startHour, endHour } = req.body;
      if (startHour === undefined || endHour === undefined) return res.status(400).json({ error: '缺少时间参数' });
      if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23) return res.status(400).json({ error: '时间范围无效' });
      if (startHour >= endHour) return res.status(400).json({ error: '开始时间必须早于结束时间' });
      await kv.set('monitor:settings', { startHour, endHour });
      return res.json({ success: true });
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}`,

  "api/check.js": `import { kv } from '@vercel/kv';
import { getLiveStatus } from './_lib/douyin.js';
import { sendSubscribeMessage } from './_lib/wx.js';
import { getAllStreamerIds, getStreamerStatus, setStreamerStatus, getStreamerInfo, getStreamerSubscribers, getLastNotified, setLastNotified, updateStreamerInfo } from './_lib/db.js';

const NOTIFY_COOLDOWN_MS = 30 * 60 * 1000;
const TEMPLATE_ID = process.env.WX_TEMPLATE_ID || '';

export default async function handler(req, res) {
  if (req.headers.authorization !== \`Bearer \${process.env.CRON_SECRET}\`) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const settings = await kv.get('monitor:settings');
    const startHour = settings?.startHour ?? 8;
    const endHour = settings?.endHour ?? 23;
    const now = new Date();
    const bjHour = (now.getUTCHours() + 8) % 24;
    if (bjHour < startHour || bjHour >= endHour) {
      return res.json({ success: true, skipped: true, reason: \`当前时间 \${bjHour}:00 不在监控时间段 \${startHour}:00-\${endHour}:00 内\`, checked: 0 });
    }
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

  "mini-program/app.json": `{
  "pages": ["pages/index/index", "pages/add/add", "pages/detail/detail", "pages/setting/setting"],
  "window": { "navigationBarTitleText": "开播提醒", "navigationBarBackgroundColor": "#FE2C55", "navigationBarTextStyle": "white", "backgroundColor": "#f5f5f5" },
  "style": "v2",
  "sitemapLocation": "sitemap.json"
}`,

  "mini-program/pages/index/index.wxml": `<view class="container">
  <view class="header">
    <text class="title">我的关注</text>
    <view class="header-btns">
      <view class="setting-btn" bindtap="goSetting">设置</view>
      <view class="add-btn" bindtap="goAdd">+ 添加主播</view>
    </view>
  </view>
  <view class="empty" wx:if="{{list.length === 0 && !loading}}">
    <text class="empty-icon">📺</text>
    <text class="empty-text">还没有关注任何主播</text>
    <view class="btn-primary" style="margin-top:40rpx;" bindtap="goAdd">去添加</view>
  </view>
  <view class="streamer-list" wx:if="{{list.length > 0}}">
    <view class="streamer-card" wx:for="{{list}}" wx:key="secUid" bindtap="goDetail" data-sec-uid="{{item.secUid}}">
      <image class="avatar" src="{{item.avatar}}" mode="aspectFill" />
      <view class="info">
        <view class="name">{{item.nickname || '未知主播'}}</view>
        <view class="douyin-id" wx:if="{{item.douyinId}}">抖音号: {{item.douyinId}}</view>
      </view>
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
  goSetting() { wx.navigateTo({ url: '/pages/setting/setting' }); },
  goDetail(e) { wx.navigateTo({ url: \`/pages/detail/detail?secUid=\${e.currentTarget.dataset.secUid}\` }); },
  onPullDownRefresh() { this.loadSubscriptions().then(() => wx.stopPullDownRefresh()); }
});`,

  "mini-program/pages/index/index.wxss": `.header { display:flex; justify-content:space-between; align-items:center; margin-bottom:30rpx; }
.title { font-size:44rpx; font-weight:bold; }
.header-btns { display:flex; gap:16rpx; align-items:center; }
.add-btn { background:#FE2C55; color:#fff; font-size:28rpx; padding:12rpx 24rpx; border-radius:8rpx; }
.setting-btn { background:#fff; color:#666; font-size:28rpx; padding:12rpx 24rpx; border-radius:8rpx; border:1rpx solid #ddd; }
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

  "mini-program/pages/setting/setting.json": `{ "navigationBarTitleText": "设置" }`,

  "mini-program/pages/setting/setting.wxml": `<view class="container">
  <view class="card">
    <view class="section-title">监控时间段</view>
    <view class="desc">设置每天自动检测开播的时间范围，时间段外不会检测和推送</view>
    <view class="form-item">
      <text class="label">开始时间</text>
      <picker mode="time" value="{{startTime}}" bindchange="onStartChange">
        <view class="picker-value">{{startTime}}</view>
      </picker>
    </view>
    <view class="form-item">
      <text class="label">结束时间</text>
      <picker mode="time" value="{{endTime}}" bindchange="onEndChange">
        <view class="picker-value">{{endTime}}</view>
      </picker>
    </view>
    <view class="tip"><text>当前设置：每天 {{startTime}} - {{endTime}} 监控开播</text></view>
    <button class="btn-primary save-btn" bindtap="saveSettings">保存设置</button>
  </view>
  <view class="card">
    <view class="section-title">关于</view>
    <view class="about-item"><text class="about-label">检测频率</text><text class="about-value">每3分钟一次</text></view>
    <view class="about-item"><text class="about-label">推送冷却</text><text class="about-value">同一主播30分钟内不重复推送</text></view>
  </view>
</view>`,

  "mini-program/pages/setting/setting.js": `const { request } = require('../../utils/api');
Page({
  data: { startTime: '08:00', endTime: '23:00' },
  onLoad() { this.loadSettings(); },
  async loadSettings() {
    try {
      const res = await request('/api/setting', 'GET');
      if (res.success && res.data) {
        this.setData({
          startTime: res.data.startHour !== undefined ? \`\${String(res.data.startHour).padStart(2,'0')}:00\` : '08:00',
          endTime: res.data.endHour !== undefined ? \`\${String(res.data.endHour).padStart(2,'0')}:00\` : '23:00'
        });
      }
    } catch {}
  },
  onStartChange(e) { this.setData({ startTime: e.detail.value }); },
  onEndChange(e) { this.setData({ endTime: e.detail.value }); },
  async saveSettings() {
    const { startTime, endTime } = this.data;
    const startHour = parseInt(startTime.split(':')[0]);
    const endHour = parseInt(endTime.split(':')[0]);
    if (startHour >= endHour) { wx.showToast({ title: '开始时间必须早于结束时间', icon: 'none' }); return; }
    try {
      const res = await request('/api/setting', 'POST', { startHour, endHour });
      if (res.success) wx.showToast({ title: '保存成功', icon: 'success' });
      else wx.showToast({ title: res.error || '保存失败', icon: 'none' });
    } catch { wx.showToast({ title: '网络错误', icon: 'none' }); }
  }
});`,

  "mini-program/pages/setting/setting.wxss": `.desc { font-size:26rpx; color:#999; margin-bottom:30rpx; line-height:1.5; }
.section-title { font-size:32rpx; font-weight:600; margin-bottom:16rpx; }
.form-item { display:flex; align-items:center; justify-content:space-between; padding:24rpx 0; border-bottom:1rpx solid #f0f0f0; }
.label { font-size:30rpx; color:#333; }
.picker-value { font-size:30rpx; color:#FE2C55; padding:8rpx 24rpx; background:#fff5f7; border-radius:8rpx; }
.tip { margin-top:24rpx; padding:16rpx 20rpx; background:#f8f8f8; border-radius:8rpx; font-size:26rpx; color:#666; }
.save-btn { margin-top:40rpx; width:100%; }
.about-item { display:flex; justify-content:space-between; padding:16rpx 0; border-bottom:1rpx solid #f0f0f0; }
.about-label { font-size:28rpx; color:#666; }
.about-value { font-size:28rpx; color:#333; }`
};

for (const [filePath, content] of Object.entries(files)) {
  const fullPath = path.join(__dirname, filePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
  console.log(`✅ ${filePath}`);
}
console.log('\n🎉 所有文件更新完成！');
console.log('\n下一步：把更新后的文件上传到 GitHub');