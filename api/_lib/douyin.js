export async function getLiveStatus(roomIdOrSecUid) {
  try {
    const url = `https://live.douyin.com/web/room/info?aid=6383&app_name=douyin_web&live_id=1&device_platform=web&language=zh-CN&browser_language=zh-CN&browser_platform=Win32&browser_name=Edge&browser_version=120.0.0.0&web_rid=${roomIdOrSecUid}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://live.douyin.com/',
        'Cookie': 'ttwid=1',
      }
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { success: false, error: '抖音返回了非JSON数据，可能被风控' };
    }
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
