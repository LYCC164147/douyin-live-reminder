App({
  globalData: { openid: '', baseUrl: 'https://your-project.vercel.app' },
  onLaunch() { this.login(); },
  login() {
    wx.login({ success: (res) => {
      if (res.code) {
        wx.request({ url: `${this.globalData.baseUrl}/api/login`, method: 'POST', data: { code: res.code },
          success: (resp) => { if (resp.data.success) this.globalData.openid = resp.data.openid; }
        });
      }
    }});
  }
});