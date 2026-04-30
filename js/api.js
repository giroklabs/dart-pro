// DART OpenAPI Wrapper with Multi-Proxy Support
const DART_API = {
  BASE: 'https://opendart.fss.or.kr/api',

  getKey() {
    return localStorage.getItem('dart_api_key') || '144e480379d207a694b74e3d7711dcad6d37a4ea';
  },

  setKey(key) {
    localStorage.setItem('dart_api_key', key);
  },

  async _fetch(endpoint, params = {}) {
    const key = this.getKey();
    if (!key) throw new Error('API 키가 설정되지 않았습니다.');

    params.crtfc_key = key;
    const qs = new URLSearchParams(params).toString();
    const targetUrl = `${this.BASE}/${endpoint}?${qs}`;

    // 프록시 목록 (안정성 순서)
    const proxies = [
      url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
      url => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`
    ];

    let lastError = null;

    for (const getProxyUrl of proxies) {
      try {
        const res = await fetch(getProxyUrl(targetUrl));
        if (!res.ok) continue;

        const result = await res.json();
        let data;

        // allorigins는 contents 안에 JSON 문자열이 있음
        if (result.contents) {
          data = JSON.parse(result.contents);
        } else {
          data = result; // codetabs 등은 바로 JSON 반환
        }

        return this._handleData(data);
      } catch (err) {
        lastError = err;
        continue;
      }
    }

    throw new Error(`데이터 로드 실패 (프록시 모두 응답 없음): ${lastError?.message || 'Unknown'}`);
  },

  _handleData(data) {
    if (data.status && data.status !== '000') {
      const messages = {
        '010': '등록되지 않은 키입니다.',
        '011': '사용할 수 없는 키입니다.',
        '013': '조회된 데이터가 없습니다.',
        '020': '요청 제한을 초과하였습니다.',
        '800': '시스템 점검 중입니다.',
      };
      throw new Error(messages[data.status] || data.message || 'DART 서버 응답 오류');
    }
    return data;
  },

  // 기업명으로 고유번호 찾기 유틸
  findCorpCode(name) {
    const CORP_MAP = {
      "삼성전자": "00126380", "SK하이닉스": "00164779", "현대자동차": "00164742",
      "카카오": "00258801", "네이버": "00266961", "LG에너지솔루션": "01534184",
      "LG전자": "00106641", "삼성SDI": "00126362", "기아": "00106395", "셀트리온": "00305884"
    };
    return CORP_MAP[name] || name;
  },

  // 관심 종목 관리
  getWatchlist() {
    return JSON.parse(localStorage.getItem('dart_watchlist') || '[]');
  },

  addWatch(corpCode, name) {
    const list = this.getWatchlist();
    if (!list.find(i => i.code === corpCode)) {
      list.push({ code: corpCode, name: name });
      localStorage.setItem('dart_watchlist', JSON.stringify(list));
      return true;
    }
    return false;
  },

  removeWatch(corpCode) {
    const list = this.getWatchlist().filter(i => i.code !== corpCode);
    localStorage.setItem('dart_watchlist', JSON.stringify(list));
  },

  // 1. 공시검색
  async searchDisclosures(opts = {}) {
    const params = { ...opts };
    params.sort = opts.sort || 'date';
    params.sort_mth = opts.sort_mth || 'desc';
    params.page_no = opts.page_no || 1;
    params.page_count = opts.page_count || 20;
    return this._fetch('list.json', params);
  },

  // 2. 기업개황
  async getCompanyInfo(corpCode) {
    return this._fetch('company.json', { corp_code: corpCode });
  },

  // 3. 공시서류원본파일
  getDocumentUrl(rceptNo) {
    const key = this.getKey();
    return `${this.BASE}/document.xml?crtfc_key=${key}&rcept_no=${rceptNo}`;
  },

  disclosureTypes: {
    A: '정기공시', B: '주요사항보고', C: '발행공시',
    D: '지분공시', E: '기타공시', F: '외부감사관련',
    G: '펀드공시', H: '자산유동화', I: '거래소공시', J: '공정위공시',
  },

  corpClsNames: { Y: '유가증권', K: '코스닥', N: '코넥스', E: '기타' },

  pillClass(corpCls) {
    const map = { Y: 'pill-financial', K: 'pill-major', N: 'pill-equity', E: 'pill-default' };
    return map[corpCls] || 'pill-default';
  },

  formatDate(dateStr) {
    if (!dateStr || dateStr.length !== 8) return dateStr || '';
    return `${dateStr.slice(0, 4)}.${dateStr.slice(4, 6)}.${dateStr.slice(6, 8)}`;
  },

  viewerUrl(rceptNo) {
    return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`;
  }
};

window.DART_API = DART_API;
