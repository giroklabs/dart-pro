// DART OpenAPI Wrapper
// 백엔드(BFF) 연동 모드로 작동합니다. 모든 외부 API 통신은 서버를 거칩니다.
const _IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
// 배포 시 발급받은 실제 백엔드 도메인으로 변경해야 합니다. (예: https://my-dart-backend.duckdns.org)
const BACKEND_URL = _IS_LOCAL ? 'http://localhost:3000' : 'https://dartpro.duckdns.org';

const api = {
  BASE: `${BACKEND_URL}/api/dart`,
  GEMINI_BASE: `${BACKEND_URL}/api/ai`,
  
  // 상태 관리
  _corpDb: null,
  
  // Firebase Auth에서 발급한 ID Token을 가져오는 헬퍼 함수
  async _getAuthToken() {
    if (window.FB_AUTH && window.FB_AUTH.currentUser) {
      try {
        return await window.FB_AUTH.currentUser.getIdToken(true);
      } catch (e) {
        console.error('Failed to get Firebase token', e);
      }
    }
    return null;
  },

  async _fetch(endpoint, params = {}) {
    const cleanParams = {};
    Object.keys(params).forEach(k => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        cleanParams[k] = params[k];
      }
    });

    const query = new URLSearchParams(cleanParams).toString();
    const targetUrl = `${this.BASE}/${endpoint}?${query}`;

    try {
      // 프록시 서버 호출 (서버에서 DART API 키를 알아서 붙여줌)
      const res = await fetch(targetUrl, { 
        cache: 'no-store',
        signal: AbortSignal.timeout(30000)
      });
      
      if (!res.ok) throw new Error(`서버 응답 오류: ${res.status}`);
      
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
         // 바이너리(ZIP) 등 JSON이 아닌 경우 그냥 반환
         return res;
      }

      const data = await res.json();
      
      // DART API 포맷의 에러 검출
      if (data.status && data.status !== '000') {
        return this._handleData(data); // 에러 파싱 후 throw
      }
      return data;
    } catch (err) {
      if (err.message.includes('DART') || err.message.includes('부적절한 값') || err.message.includes('서버 점검')) {
        throw err;
      }
      throw new Error(`데이터 로드 실패: ${err.message}`);
    }
  },

  _handleData(data) {
    if (data.status === '013') {
      return { ...data, list: [] }; // 에러가 아닌 빈 리스트로 정상 처리
    }
    if (data.status && data.status !== '000') {
      const messages = {
        '010': '등록되지 않은 키입니다. (서버 확인 필요)',
        '011': '사용할 수 없는 키입니다. (서버 확인 필요)',
        '020': '요청 제한을 초과하였습니다. 잠시 후 다시 시도하세요.',
        '800': 'DART 시스템 점검 중입니다.',
      };
      throw new Error(messages[data.status] || data.message || 'DART 서버 응답 오류');
    }
    return data;
  },

  // 기업 DB 초기화 (로컬 corps.json 우선)
  async initCorpCodes() {
    if (this._corpDb && this._corpDb.data) return this._corpDb.data;
    
    try {
      // 1. 서버의 corps.json 시도 (가장 권장)
      const res = await fetch('corps.json');
      if (res.ok) {
        const data = await res.json();
        this._corpDb = { data };
        console.log('[DART] Local corps.json loaded.');
        return data; // 데이터 내용물 반환
      }
    } catch (err) {
      console.warn("[DART] Local DB fetch failed:", err);
    }

    return {};
  },

  // 고유번호로 회사 이름 찾기 (INTERNAL_MAP 우선)
  async getCorpName(code) {
    const INTERNAL_MAP = {
      "00126380": "삼성전자", "00164779": "SK하이닉스", "00164742": "현대자동차",
      "00111722": "미래에셋증권", "01042775": "HL만도", "00547583": "하나금융지주",
      "00570387": "빌리앙뜨", "00258838": "카카오", "00266961": "NAVER",
      "00305884": "에코프로", "00126431": "대한항공", "00155167": "한화솔루션",
      "00159109": "한국전력공사"
    };
    if (INTERNAL_MAP[code]) return INTERNAL_MAP[code];
    const db = await this.initCorpCodes();
    return db[code] || code;
  },


  async findCorpCode(name) {
    const q = name.replace(/\s/g, '').toLowerCase();
    
    // 1. IndexedDB 먼저 확인
    try {
      const db = await this._getDb();
      const tx = db.transaction('corps', 'readonly');
      const store = tx.objectStore('corps');
      const req = store.get(name);
      const res = await new Promise(r => req.onsuccess = () => r(req.result));
      if (res) return res.code;
    } catch(e) {}

    // 2. 내장 맵 및 캐시 확인
    const CORP_MAP = { "삼성전자": "00126380", "SK하이닉스": "00164779", "현대자동차": "00164742", "미래에셋증권": "00155255", "HL만도": "00155219" };
    if (CORP_MAP[name]) return CORP_MAP[name];
    
    return null;
  },

  async searchCorpCodes(query, limit = 10) {
    if (!query || query.length < 2) return [];
    const results = [];
    const q = query.replace(/\s/g, '').toLowerCase();
    const isNumber = /^\d+$/.test(q);

    // 1. 내장 맵 우선 검색 (가장 빠르고 확실함)
    const INTERNAL_MAP = { 
      "삼성전자": "00126380", "SK하이닉스": "00164779", "현대자동차": "00164742", "현대차": "00164742", 
      "미래에셋증권": "00111722", "미래에셋": "00111722", "HL만도": "01042775", "에이치엘만도": "01042775",
      "하나금융지주": "00570387", "하나금융": "00570387", "카카오": "00258838", "네이버": "00266961", "에코프로": "00305884",
      "대한항공": "00126431", "한화솔루션": "00155167", "한국전력공사": "00159109", "한국전력": "00159109"
    };

    for (const [name, code] of Object.entries(INTERNAL_MAP)) {
      const matchName = name.toLowerCase().includes(q);
      const matchCode = code.includes(q);
      if (matchName || matchCode) {
        results.push({ name, code });
      }
    }

    // 2. 메모리 캐시 검색 (전수 데이터가 로드된 경우)
    const dbData = await this.initCorpCodes();
    if (dbData) {
      for (const [key, val] of Object.entries(dbData)) {
        if (results.length >= limit * 3) break;
        // 번호(key)로 찾거나 이름(val)으로 찾기 (양방향 매핑 활용)
        const isCode = /^\d{8}$/.test(key);
        if (isCode) {
          const name = val;
          const code = key;
          if (code.includes(q) || name.toLowerCase().includes(q)) {
            if (!results.find(r => r.code === code)) {
              results.push({ name, code });
            }
          }
        }
      }
    }

    // 정렬: 번호가 정확히 일치하거나 이름이 정확히 일치하는 항목 우선
    return results.sort((a, b) => {
      if (isNumber) {
        if (a.code === q) return -1;
        if (b.code === q) return 1;
      }
      if (a.name === query) return -1;
      if (b.name === query) return 1;
      return 0;
    }).slice(0, limit);
  },

  // 관심 종목 관리 (문자열 배열 기반)
  getWatchlist() {
    const raw = JSON.parse(localStorage.getItem('dart_watchlist') || '[]');
    if (!Array.isArray(raw)) return [];
    
    const cleaned = raw.map(i => {
      if (typeof i === 'object' && i !== null) return i.code || i.corp_code;
      return String(i);
    }).filter(code => {
      const isValid = /^[0-9]{8}$/.test(code);
      if (!isValid && code !== '[]') console.warn('[API] Junk data filtered out:', code);
      return isValid;
    });

    return cleaned;
  },

  addWatch(corpCode) {
    const list = this.getWatchlist();
    if (!list.includes(corpCode)) {
      list.push(corpCode);
      localStorage.setItem('dart_watchlist', JSON.stringify(list));
      if (window.FB_AUTH && typeof window.FB_AUTH.saveInterestsToCloud === 'function') {
        window.FB_AUTH.saveInterestsToCloud();
      }
      return true;
    }
    return false;
  },

  removeWatch(corpCode) {
    const list = this.getWatchlist().filter(c => c !== corpCode);
    localStorage.setItem('dart_watchlist', JSON.stringify(list));
    if (window.FB_AUTH && typeof window.FB_AUTH.saveInterestsToCloud === 'function') {
      window.FB_AUTH.saveInterestsToCloud();
    }
  },

  clearWatchlist() {
    localStorage.setItem('dart_watchlist', '[]');
    if (window.FB_AUTH && typeof window.FB_AUTH.saveInterestsToCloud === 'function') {
      window.FB_AUTH.saveInterestsToCloud();
    }
  },

  async getGeminiAnalysis(corpName, reportNm, rceptNo = null) {
    if (!corpName || !reportNm) {
      console.warn('[Gemini] 필수 파라미터 누락:', { corpName, reportNm, rceptNo });
      return null;
    }

    if (this._geminiRateLimitUntil && Date.now() < this._geminiRateLimitUntil) {
      throw new Error(`할당량 초과 (429): 분당 요청 제한에 걸렸습니다. 잠시 후 다시 시도하세요.`);
    }

    const cacheKey = rceptNo ? `gemini_cache_${rceptNo}` : `gemini_cache_${corpName}_${reportNm}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch (e) { localStorage.removeItem(cacheKey); }
    }

    try {
      const token = await this._getAuthToken();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${this.GEMINI_BASE}/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ corpName, reportName: reportNm, rceptNo })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData?.error?.message || errData?.error || errData?.message || res.statusText || 'Unknown';
        
        if (res.status === 429) {
          this._geminiRateLimitUntil = Date.now() + 60000;
        }
        throw new Error(`분석 요청 실패 (${res.status}): ${errMsg}`);
      }

      const data = await res.json();
      const stripMd = (s) => typeof s === 'string' ? s.replace(/\*\*|\*/g, '').trim() : s;
      
      if (data && data.insight) {
        data.insight = stripMd(data.insight);
        data.impact = stripMd(data.impact);
        if (Array.isArray(data.points)) {
          data.points = data.points.map(p => stripMd(p));
        }
        localStorage.setItem(cacheKey, JSON.stringify(data));
        return data;
      }
      
      throw new Error("AI 분석 결과를 파싱할 수 없습니다.");
    } catch (err) {
      console.error('Gemini Analysis Critical Error:', err);
      throw err;
    }
  },

  // 1. 공시검색
  async searchDisclosures(opts = {}) {
    const params = { ...opts };
    
    // corp_code 유효성 검사 및 정제
    if (params.corp_code) {
      const sanitized = params.corp_code
        .split(',')
        .map(c => c.trim())
        .filter(c => /^[0-9]{8}$/.test(c))
        .join(',');
      
      if (sanitized) {
        params.corp_code = sanitized;
      } else {
        delete params.corp_code;
      }
    } else {
      delete params.corp_code;
    }

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
    return `${this.BASE}/document.xml?rcept_no=${rceptNo}`;
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

window.DART_API = api;
window.api = api;
