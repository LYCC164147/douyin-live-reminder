const { request } = require('../../utils/api');
Page({
  data: { keyword:'', roomId:'', nickName:'', results:[], searched:false, searching:false },
  onInput(e) { this.setData({ keyword: e.detail.value }); },
  onRoomIdInput(e) { this.setData({ roomId: e.detail.value }); },
  onNickInput(e) { this.setData({ nickName: e.detail.value }); },
  async doSearch() {
    if (!this.data.keyword.trim()) { wx.showToast({ title:'请输入关键词', icon:'none' }); return; }
    this.setData({ searching:true, searched:false });
    try {
      const res = await request(`/api/search?keyword=${encodeURIComponent(this.data.keyword)}`, 'GET');
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
      if (res.success) { this.setData({ [`results[${i}].subscribed`]:true }); wx.showToast({ title:'关注成功', icon:'success' }); }
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
});