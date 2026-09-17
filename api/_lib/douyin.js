export async function getLiveStatus(roomIdOrSecUid) {
  try {
    const url = `https://live.douyin.com/web/room/info?aid=6383&app_name=douyin_web&live_id=1&device_platform=web&language=zh-CN&browser_language=zh-CN&browser_platform=Win32&browser_name=Edge&browser_version=120.0.0.0&web_rid=${roomIdOrSecUid}`;
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
    const url = `https://www.douyin.com/aweme/v1/web/discover/search/?keyword=${encodeURIComponent(keyword)}&search_channel=aweme_user_web&search_source=normal_search&query_correct_type=1&is_filter_search=0&from_group_id=&offset=0&count=10&aid=6383&device_platform=webapp`;
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
}