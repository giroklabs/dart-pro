// DART OpenAPI Wrapper with CORS Proxy
const DART_API = {
  BASE: 'https://opendart.fss.or.kr/api',
  PROXY: 'https://api.allorigins.win/raw?url=',

  getKey() {
    return localStorage.getItem('dart_api_key') || '';
  },

  setKey(key) {
    localStorage.setItem('dart_api_key', key);
  },

  async _fetch(endpoint, params = {}) {
    const key = this.getKey();
    if (!key) throw new Error('API 키가 설정되지 않았습니다. 설정 페이지에서 키를 입력해주세요.');

    params.crtfc_key = key;
    const qs = new URLSearchParams(params).toString();
    const targetUrl = `${this.BASE}/${endpoint}?${qs}`;
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;

    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error(`프록시 에러: ${res.status}`);

    const wrapper = await res.json();
    if (!wrapper.contents) throw new Error('응답 데이터가 비어있습니다.');
    
    const data = JSON.parse(wrapper.contents);
    if (data.status && data.status !== '000') {
      const messages = {
        '010': '등록되지 않은 키입니다.',
        '011': '사용할 수 없는 키입니다.',
        '013': '조회된 데이터가 없습니다.',
        '020': '요청 제한을 초과하였습니다.',
        '100': '필드의 부적절한 값입니다.',
        '800': '시스템 점검 중입니다.',
      };
      throw new Error(messages[data.status] || data.message || '알 수 없는 오류');
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
    return CORP_MAP[name] || name; // 매핑 없으면 입력값 그대로 반환
  },

  // 1. 공시검색
  async searchDisclosures(opts = {}) {
    const params = {};
    if (opts.corp_code) params.corp_code = opts.corp_code;
    if (opts.bgn_de) params.bgn_de = opts.bgn_de;
    if (opts.end_de) params.end_de = opts.end_de;
    if (opts.last_reprt_at) params.last_reprt_at = opts.last_reprt_at;
    if (opts.pblntf_ty) params.pblntf_ty = opts.pblntf_ty;
    if (opts.corp_cls) params.corp_cls = opts.corp_cls;
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

  // 3. 공시서류원본파일 (ZIP 다운로드 URL 반환)
  getDocumentUrl(rceptNo) {
    const key = this.getKey();
    return `${this.BASE}/document.xml?crtfc_key=${key}&rcept_no=${rceptNo}`;
  },

  // 유틸: 공시유형 한글 매핑
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

  // DART 공시 뷰어 URL
  viewerUrl(rceptNo) {
    return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rceptNo}`;
  }
};

window.DART_API = DART_API;
