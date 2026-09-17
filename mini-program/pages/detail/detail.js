const { request } = require('../../utils/api');
Page({
  data: { secUid:'', streamer:{}, isLive:false, liveTitle:'', viewerCount:0 },
  onLoad(options) { this.setData({ secUid:options.secUid }); this.loadDetail(); },
  async loadDetail() {
    const app = getApp();
    try {
      const subs = await request(`/api/subscribe?openid=${app.globalData.openid}`, 'GET');
      if (subs.success) { const s = subs.data.find(x => x.secUid === this.data.secUid); if (s) this.setData({ streamer:s }); }
      const st = await request(`/api/status?secUid=${this.data.secUid}`, 'GET');
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
  onShareAppMessage() { return { title:`快来关注 ${this.data.streamer.nickname} 的直播！`, path:`/pages/detail/detail?secUid=${this.data.secUid}` }; }
});