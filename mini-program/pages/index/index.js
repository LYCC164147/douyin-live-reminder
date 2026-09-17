const { request } = require('../../utils/api');
Page({
  data: { list: [], loading: true },
  onShow() { this.loadSubscriptions(); },
  async loadSubscriptions() {
    const app = getApp();
    if (!app.globalData.openid) { setTimeout(() => this.loadSubscriptions(), 500); return; }
    this.setData({ loading: true });
    try {
      const res = await request(`/api/subscribe?openid=${app.globalData.openid}`, 'GET');
      if (res.success) {
        const list = await Promise.all((res.data||[]).map(async s => {
          try { const r = await request(`/api/status?secUid=${s.secUid}`, 'GET'); return { ...s, isLive: r.status === 'live' }; }
          catch { return { ...s, isLive: false }; }
        }));
        this.setData({ list, loading: false });
      }
    } catch { this.setData({ loading: false }); wx.showToast({ title: '加载失败', icon: 'none' }); }
  },
  goAdd() { wx.navigateTo({ url: '/pages/add/add' }); },
  goDetail(e) { wx.navigateTo({ url: `/pages/detail/detail?secUid=${e.currentTarget.dataset.secUid}` }); },
  onPullDownRefresh() { this.loadSubscriptions().then(() => wx.stopPullDownRefresh()); }
});