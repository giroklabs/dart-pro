const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { sendPushNotification } = require('./fcm');

const DART_LIST_URL = 'https://opendart.fss.or.kr/api/list.json';
const STATE_FILE = path.join(__dirname, '../data/poll_state.json');
const SUBS_FILE = path.join(__dirname, '../data/subscriptions.json');

let lastRceptNo = null;

// 상태 로드
if (fs.existsSync(STATE_FILE)) {
  const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  lastRceptNo = state.lastRceptNo;
}

const pollDisclosures = async () => {
  try {
    const apiKey = process.env.DART_API_KEY;
    if (!apiKey) return;

    // 최근 1시간 내 공시 검색
    const response = await axios.get(DART_LIST_URL, {
      params: { crtfc_key: apiKey, page_count: 30 }
    });

    if (response.data.status !== '000') return;

    const list = response.data.list || [];
    if (list.length === 0) return;

    // 새로운 공시 필터링 (rcept_no 기준)
    const newItems = lastRceptNo 
      ? list.filter(item => item.rcept_no > lastRceptNo).reverse()
      : [list[0]]; // 처음 시작 시 가장 최근 것 하나만

    if (newItems.length > 0) {
      console.log(`[Polling] Found ${newItems.length} new disclosures.`);
      
      // 구독 정보 로드
      const subs = fs.existsSync(SUBS_FILE) ? JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8')) : {};
      
      for (const item of newItems) {
        // 관심 종목 구독자 찾기
        // subs 구조: { corp_code: [fcm_token1, fcm_token2], ... }
        const tokens = subs[item.corp_code] || [];
        
        if (tokens.length > 0) {
          const title = `[공시] ${item.corp_name}`;
          const body = item.report_nm;
          const data = { rcept_no: item.rcept_no, corp_code: item.corp_code };
          
          for (const token of tokens) {
            await sendPushNotification(token, title, body, data);
          }
        }
        lastRceptNo = item.rcept_no;
      }

      // 상태 저장
      fs.writeFileSync(STATE_FILE, JSON.stringify({ lastRceptNo, updatedAt: new Date().toISOString() }));
    }
  } catch (error) {
    console.error('[Polling] Error:', error.message);
  }
};

// 1분마다 폴링 시작
const startPolling = (intervalMs = 60000) => {
  console.log(`[Polling] Started disclosure polling every ${intervalMs / 1000}s`);
  setInterval(pollDisclosures, intervalMs);
};

module.exports = { startPolling };
