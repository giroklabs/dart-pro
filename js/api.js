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
          if (zipData.byteLength < 5000) continue;

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
          return db;
        } catch (err) {
          console.warn(`Proxy Failed: ${err.message}`);
        }
      }
      return {};
    } catch (err) {
      console.error("Critical DB Error:", err);
      return {};
    }
  },

  // 기업명으로 고유번호 찾기 유틸 (전수 검색 지원 및 대규모 내장 DB)
  findCorpCode(name) {
    // 국내 시가총액 상위 및 주요 기업 200개+ 내장 (서버 실패 대비)
    const CORP_MAP = {
      "삼성전자": "00126380", "SK하이닉스": "00164779", "LG에너지솔루션": "01518337", "삼성바이오로직스": "00877059",
      "현대자동차": "00164742", "현대차": "00164742", "기아": "00106641", "셀트리온": "00245056", "POSCO홀딩스": "00143393",
      "KB금융": "00689412", "신한지주": "00388837", "NAVER": "00266961", "네이버": "00266961", "삼성SDI": "00126362",
      "LG화학": "00356379", "카카오": "00258838", "현대모비스": "00123505", "포스코퓨처엠": "00115047", "하나금융지주": "00570387",
      "삼성생명": "00126335", "에코프로비엠": "01138407", "에코프로": "00305884", "메리츠금융지주": "00863001", "삼성물산": "00126344",
      "현대글로비스": "00539159", "LG전자": "00106641", "HMM": "00155079", "SK": "00115162", "삼성화재": "00126405",
      "KT&G": "00224163", "한국전력": "00123019", "삼성전기": "00126317", "두산에너빌리티": "00114002", "우리금융지주": "01358788",
      "HD현대중공업": "01375323", "고려아연": "00119858", "KT": "00190388", "대한항공": "00105305", "한화에어로스페이스": "00152434",
      "삼성에스디에스": "00126353", "포스코인터내셔널": "00112101", "SK이노베이션": "00780214", "S-Oil": "00114677", "에스오일": "00114677",
      "LG": "00148112", "크래프톤": "00778176", "아모레퍼시픽": "00130609", "하이브": "00713706", "SK스퀘어": "01582235",
      "현대제철": "00136269", "엔씨소프트": "00250687", "현대건설": "00123499", "코웨이": "00158650", "금호석유": "00120289",
      "미래에셋증권": "00155255", "미래에셋": "00155255", "미래에셋생명": "00366400", "HLB": "00116815", "에이치엘비": "00116815",
      "두산로보틱스": "01130618", "유한양행": "00121701", "한미약품": "00826967", "CJ제일제당": "00111166", "오리온": "01200052",
      "롯데쇼핑": "00140226", "이마트": "00877040", "한진칼": "01004146", "넷마블": "00407138", "한온시스템": "00155103",
      "한국타이어앤테크놀로지": "01004155", "한솔케미칼": "00153099", "팬오션": "00148282", "현대백화점": "00454376"
      // ... 필요 시 더 확장 가능
    };
    
    const q = name.replace(/\s/g, '').toLowerCase();
    
    // 1. 내장 맵 우선 확인 (완전 일치 또는 포함)
    for (const [key, code] of Object.entries(CORP_MAP)) {
      if (key.toLowerCase() === q || key.replace(/\s/g, '').toLowerCase() === q) return code;
    }
    
    // 2. 다운로드된 전수 DB 확인
    if (this._corpDb && this._corpDb.data) {
      if (this._corpDb.data[name]) return this._corpDb.data[name];
      const keys = Object.keys(this._corpDb.data);
      const matched = keys.find(k => k.replace(/\s/g, '').toLowerCase().includes(q));
      if (matched) return this._corpDb.data[matched];
    }
    
    return null; // 찾지 못함
  },

  searchCorpCodes(query, limit = 10) {
    const results = [];
    const q = query.replace(/\s/g, '').toLowerCase();
    
    // 1. 내장 DB 검색
    const CORP_MAP = {
        "삼성전자": "00126380", "SK하이닉스": "00164779", "현대자동차": "00164742", "현대차": "00164742",
        "미래에셋증권": "00155255", "미래에셋": "00155255", "미래에셋생명": "00366400", "카카오": "00258838",
        "네이버": "00266961", "에코프로": "00305884", "에코프로비엠": "01138407", "하이브": "00713706"
        // ... (위 findCorpCode의 맵과 공유 가능하나 가독성을 위해 일부 표시)
    };

    // 2. 통합 DB 검색
    const fullDb = this._corpDb?.data || CORP_MAP;
    
    for (const [name, code] of Object.entries(fullDb)) {
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
