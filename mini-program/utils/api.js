const app = getApp();
const request = (url, method, data) => new Promise((resolve, reject) => {
  wx.request({ url: `${app.globalData.baseUrl}${url}`, method, data, header: { 'Content-Type': 'application/json' },
    success: (res) => resolve(res.data), fail: (err) => reject(err) });
});
module.exports = { request };