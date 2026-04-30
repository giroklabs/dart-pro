// DART OpenAPI Wrapper with Multi-Proxy Support
const DART_API = {
  BASE: 'https://opendart.fss.or.kr/api',

  getKey() {
    return localStorage.getItem('dart_api_key') || '';
  },

  getGeminiKey() {
    return localStorage.getItem('gemini_api_key') || '';
  },

  setKey(key) {
    localStorage.setItem('dart_api_key', key);
  },

  setGeminiKey(key) {
    localStorage.setItem('gemini_api_key', key);
  },

  async _fetch(endpoint, params = {}) {
    const key = this.getKey();
    if (!key) throw new Error('API 키가 설정되지 않았습니다.');

    // 파라미터 정제 (undefined, null, 빈 문자열 제거)
    const cleanParams = { crtfc_key: key };
    Object.keys(params).forEach(k => {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        cleanParams[k] = params[k];
      }
    });

    const query = new URLSearchParams(cleanParams).toString();
    const targetUrl = `${this.BASE}/${endpoint}?${query}`;

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

        if (result.contents) {
          data = JSON.parse(result.contents);
        } else {
          data = result;
        }

        // DART 서버에서 에러를 반환한 경우 (프록시 문제가 아님)
        if (data.status && data.status !== '000') {
          return this._handleData(data); // 여기서 에러 throw
        }

        return data;
      } catch (err) {
        // DART 서버 에러(status !== '000')인 경우 루프 중단하고 즉시 throw
        if (err.message.includes('DART 서버 응답 오류') || err.message.includes('부적절한 값')) {
          throw err;
        }
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

  // 기업 DB 초기화 (DART에서 전체 리스트 다운로드)
  async initCorpCodes() {
    if (this._corpDb) return this._corpDb;
    
    // 캐시 확인
    const cached = localStorage.getItem('dart_corp_db');
    if (cached) {
      this._corpDb = JSON.parse(cached);
      if (Date.now() - this._corpDb.timestamp < 86400000 * 7) { // 7일간 유효
        return this._corpDb.data;
      }
    }

    try {
      const key = this.getKey();
      const url = `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${key}`;
      
    // 멀티 프록시 폴백 시스템
    const proxies = [
      u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
      u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`
    ];

    for (const getProxyUrl of proxies) {
      try {
        const proxyUrl = getProxyUrl(url);
        const res = await fetch(proxyUrl);
        if (!res.ok) continue;
        
        const zipData = await res.arrayBuffer();
        // ZIP 파일은 최소 수만 바이트 이상이어야 함 (에러 HTML 방지)
        if (zipData.byteLength < 5000) {
          console.warn(`Proxy ${proxyUrl} returned too small data, likely error page.`);
          continue;
        }

        const zip = await JSZip.loadAsync(zipData);
        const xmlFile = zip.file("CORPCODE.xml");
        if (!xmlFile) continue;
        
        const xmlText = await xmlFile.async("string");
        const parser = new DOMParser();
        const xml = parser.parseFromString(xmlText, "text/xml");
        const list = xml.getElementsByTagName("list");
        
        const db = {};
        for (let i = 0; i < list.length; i++) {
          const name = list[i].getElementsByTagName("corp_name")[0].textContent;
          const code = list[i].getElementsByTagName("corp_code")[0].textContent;
          db[name] = code;
        }
        
        this._corpDb = { timestamp: Date.now(), data: db };
        localStorage.setItem('dart_corp_db', JSON.stringify(this._corpDb));
        console.log(`Corp DB Successfully Loaded via: ${proxyUrl}`);
        return db;
      } catch (err) {
        console.warn(`Proxy Attempt Failed (${getProxyUrl(url)}):`, err.message);
      }
    }
      
      console.error("All proxies failed to load Corp DB.");
      return {};
    } catch (err) {
      console.error("Corp DB Critical Error:", err);
      return {};
    }
  },

  // 기업명으로 고유번호 찾기 유틸 (전수 검색 지원)
  findCorpCode(name) {
    const CORP_MAP = {
      "삼성전자": "00126380", "SK하이닉스": "00164779", "현대자동차": "00164742", "현대차": "00164742",
      "카카오": "00258801", "네이버": "00266961", "LG에너지솔루션": "01534184",
      "LG전자": "00106641", "삼성SDI": "00126362", "기아": "00106395", "셀트리온": "00305884"
    };
    
    // 1. 하드코딩된 맵 우선 확인
    if (CORP_MAP[name]) return CORP_MAP[name];
    
    // 2. 다운로드된 전수 DB에서 확인
    if (this._corpDb && this._corpDb.data) {
      // 정확히 일치하는 경우
      if (this._corpDb.data[name]) return this._corpDb.data[name];
      
      // 유사 검색 (포함 관계)
      const keys = Object.keys(this._corpDb.data);
      const matched = keys.find(k => k.includes(name) || name.includes(k));
      if (matched) return this._corpDb.data[matched];
    }
    
    return name;
  },

  // 자동완성을 위한 다중 검색 결과 반환
  searchCorpCodes(query, limit = 10) {
    if (!this._corpDb || !this._corpDb.data) return [];
    
    const results = [];
    const q = query.toLowerCase();
    
    for (const [name, code] of Object.entries(this._corpDb.data)) {
      if (name.toLowerCase().includes(q) || code.includes(q)) {
        results.push({ name, code });
        if (results.length >= limit) break;
      }
    }
    
    return results;
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

  async getGeminiAnalysis(corpName, reportNm) {
    const key = this.getGeminiKey();
    if (!key) return null;

    try {
      // 1. 가용 모델 리스트 조회 (권한 및 유효 모델 확인)
      const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
      const listRes = await fetch(listUrl);
      if (!listRes.ok) {
        const err = await listRes.json();
        throw new Error(`API 권한 오류 (${listRes.status}): ${err.error?.message || '접근 거부'}`);
      }
      
      const listData = await listRes.json();
      const availableModels = listData.models || [];
      
      // 사용자 요청에 따라 Flash 모델을 최우선적으로 검색
      let targetModel = availableModels.find(m => 
        m.name.toLowerCase().includes('flash') && 
        m.supportedGenerationMethods.includes('generateContent')
      );

      // 만약 Flash가 없다면 Pro 계열 중 가용한 것을 차선책으로 검색
      if (!targetModel) {
        targetModel = availableModels.find(m => 
          m.name.toLowerCase().includes('pro') && 
          m.supportedGenerationMethods.includes('generateContent')
        );
      }

      if (!targetModel) {
        throw new Error("Gemini Flash 모델을 찾을 수 없습니다. API 키의 모델 권한을 확인하세요.");
      }

      const modelId = targetModel.name.split('/').pop();
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`;
      
      const prompt = `당신은 전문 주식 투자 분석가입니다. 다음 공시 정보를 바탕으로 투자자에게 도움이 될 만한 '인사이트 요약'과 '시장 영향력'을 한국어로 작성해 주세요. 
반드시 다음 JSON 형식으로만 응답하세요:
{ "insight": "공시의 핵심 의미 요약", "impact": "긍정적/부정적/정보확인 중 하나", "points": ["포인트1", "포인트2", "포인트3"] }

공시 정보:
기업명: ${corpName}
공시제목: ${reportNm}`;

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      if (!res.ok) {
        const errData = await res.json();
        const msg = errData.error?.message || '';
        if (res.status === 429 && msg.includes('limit: 0')) {
          throw new Error(`할당량 부족 (429): 현재 모델(${modelId})에 대한 무료 쿼터가 없습니다. Flash 모델로 변경하거나 결제 정보를 등록하세요.`);
        }
        throw new Error(`분석 요청 실패 (${res.status}): ${msg || 'Unknown'}`);
      }

      const data = await res.json();
      if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        const text = data.candidates[0].content.parts[0].text;
        const cleanedText = text.replace(/```json|```/g, '').trim();
        return JSON.parse(cleanedText);
      }
    } catch (err) {
      console.error('Gemini Analysis Critical Error:', err);
      throw err; // 상세 에러를 UI로 전달
    }
    return null;
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
      // corp_code가 아예 없거나 null/undefined인 경우 확실히 삭제
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
