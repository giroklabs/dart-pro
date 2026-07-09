const express = require('express');
const router = express.Router();

// Mock data for AI Reports
const mockReports = [
  {
    id: '1',
    title: '삼성전자 2026년 2분기 잠정실적 분석: 어닝 서프라이즈의 배경',
    category: '실적발표',
    corp_name: '삼성전자',
    publish_date: '2026.07.08',
    summary: '매출 74조, 영업이익 10.4조로 시장 컨센서스를 대폭 상회했습니다. HBM 메모리 출하량 증가 및 파운드리 수율 안정화가 주요 원인으로 분석됩니다. 향후 AI 반도체 수요 증가에 따른 하반기 실적 전망을 심층 분석합니다.',
    content: '<p><strong>[서론]</strong></p><p>이번 분기 실적은 단순히 수치의 상승을 넘어, 미래 성장 동력이 본격적으로 가동되고 있음을 보여줍니다.</p><p><strong>[본론]</strong></p><p>주요 요인은 다음과 같습니다. 첫째, HBM 메모리의 폭발적인 수요 증가... 둘째, 원가 절감을 통한 수익성 개선...</p><p><strong>[결론]</strong></p><p>따라서, 향후 3분기 실적에도 긍정적인 가이던스가 예상되며 견조한 상승세가 지속될 것으로 평가됩니다.</p>'
  },
  {
    id: '2',
    title: '현대차 4조원대 인도시장 배터리 공급 계약 체결 의미',
    category: '공급계약',
    corp_name: '현대자동차',
    publish_date: '2026.07.05',
    summary: '현지화 전략의 핵심인 인도 시장 점유율 확대를 위한 대규모 배터리 패키징 라인 구축. 전기차(EV) 전환 모멘텀 확보 및 향후 재무 제표에 미치는 영향을 전망합니다.',
    content: '<p><strong>[서론]</strong></p><p>인도 시장은 글로벌 전기차 시장의 새로운 블루오션입니다.</p><p><strong>[본론]</strong></p><p>이번 4조원 규모의 공급 계약은 단일 계약으로는 역대 최대 규모이며, 현지 생산 거점을 확고히 다지는 계기가 될 것입니다.</p><p><strong>[결론]</strong></p><p>수익성 악화 우려를 씻어내고 본격적인 글로벌 확장 국면에 진입했습니다.</p>'
  }
];

// GET /api/reports - 리포트 목록 조회
router.get('/', async (req, res) => {
  try {
    // 리스트 반환 시에는 content 제외 (데이터 절약)
    const list = mockReports.map(r => {
      const { content, ...rest } = r;
      return rest;
    });
    res.json({ success: true, data: list });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch reports' });
  }
});

// GET /api/reports/:id - 개별 리포트 상세 조회
router.get('/:id', async (req, res) => {
  try {
    const reportId = req.params.id;
    const report = mockReports.find(r => r.id === reportId);
    
    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' });
    }
    
    res.json({ success: true, data: report });
  } catch (error) {
    console.error('Error fetching report detail:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch report detail' });
  }
});

module.exports = router;
