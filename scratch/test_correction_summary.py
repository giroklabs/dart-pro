import re
import sys
import os

sys.path.append(os.path.abspath("lean_engine"))

def _extract_correction_info(raw_text: str):
    if not raw_text:
        return None, None
    
    correction_item = None
    correction_reason = None
    
    lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
    
    # 1. 키-밸류 형태의 테이블 및 일반 텍스트 분석
    for idx, line in enumerate(lines):
        if '|' in line:
            parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
            if len(parts) >= 2:
                k = parts[0].replace(" ", "")
                v = parts[1].strip()
                
                # 숫자가 섞인 '3.정정사유' 같은 포맷 대응
                if '정정사유' in k or '정정의사유' in k:
                    if len(v) >= 2 and v != '-':
                        correction_reason = v
        
        # 정정 전/후 비교 테이블 시작 라인 감지
        if '|' in line and '정정항목' in line and ('정정전' in line or '정정후' in line):
            if idx + 1 < len(lines):
                next_line = lines[idx + 1]
                if '|' in next_line:
                    next_parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in next_line.split('|')]
                    if len(next_parts) >= 3:
                        correction_item = next_parts[0]
                        
    # 정정사유 정밀 Fallback 정규식
    if not correction_reason:
        reason_patterns = [
            r"(?:정정\s*사유)\s*[:：\-\[\]\s]+(.*?)(?=(?:정정\s*전후|정정\s*일자|\d\.\s*정정|\[|$))",
            r"\[\s*(?:정정\s*사유)\s*\]\s*(.*?)(?=(?:정정\s*전후|정정\s*일자|\d\.\s*정정|\[|$))"
        ]
        for p in reason_patterns:
            for m in re.finditer(p, raw_text, re.DOTALL | re.IGNORECASE):
                val = m.group(1).strip()
                val = re.sub(r'<[^>]*>', '', val)
                val = re.sub(r'\s+', ' ', val).strip()
                if val and len(val) >= 2:
                    val_clean = val.replace(' ', '')
                    if "|" in val or "정정전" in val_clean or "정정후" in val_clean or len(val) < 5:
                        continue
                    correction_reason = val
                    break
            if correction_reason:
                break
                
    # 후처리
    if correction_item:
        correction_item = re.sub(r'<[^>]*>', '', correction_item)
        correction_item = re.sub(r'\s+', ' ', correction_item).strip()
        if len(correction_item) > 200:
            correction_item = correction_item[:197] + "..."
    if correction_reason:
        correction_reason = re.sub(r'<[^>]*>', '', correction_reason)
        correction_reason = re.sub(r'\s+', ' ', correction_reason).strip()
        if len(correction_reason) > 300:
            correction_reason = correction_reason[:297] + "..."
            
    return correction_item, correction_reason

# 테스트 실행을 위한 실데이터 시뮬레이션
from core_engine import DartLeanEngine
engine = DartLeanEngine()

rcept_nos = ['20260520800004', '20260520900719']

for rcept_no in rcept_nos:
    cur = engine.conn.cursor()
    cur.execute("SELECT raw_text, report_nm, corp_code FROM filings WHERE rcept_no = ?", (rcept_no,))
    row = cur.fetchone()
    if not row:
        continue
        
    raw_text, report_nm, corp_code = row
    corp_name = "DL이앤씨" if rcept_no == '20260520800004' else "공구우먼"
    
    corr_item, corr_reason = _extract_correction_info(raw_text)
    
    print("="*60)
    print(f"[{corp_name}] 공시번호: {rcept_no}")
    print(f"추출된 정정항목: {corr_item}")
    print(f"추출된 정정사유: {corr_reason}")
    print("-" * 40)
    
    # 요약 구성 시뮬레이션
    header = f"{corp_name} - 정정 공시 안내"
    body_parts = []
    
    if corr_reason:
        body_parts.append(f"▪ 정정사유 : {corr_reason}")
        
    is_complex = False
    if corr_item:
        if len(corr_item) >= 40 or "|" in corr_item or "[" in corr_item:
            is_complex = True
            
    if corr_item and not is_complex:
        body_parts.append(f"▪ 정정항목 : {corr_item}")
        
    if not body_parts:
        body_parts.append("▪ 정정사유 : 세부 사항은 본문(상세보기)에서 확인하실 수 있습니다.")
        
    body = "\n".join(body_parts)
    print("빌드된 요약본:")
    print(f"{header}\n\n{body}")
    print("="*60)

engine.close()
