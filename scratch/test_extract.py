import re
import sqlite3

def _extract_correction_info(raw_text: str):
    if not raw_text:
        return None, None
    
    correction_item = None
    correction_reason = None
    
    # 0. 테이블 형식 정밀 파싱
    lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
    for idx, line in enumerate(lines):
        if '|' in line and ('항목' in line or '항  목' in line) and '정정사유' in line:
            header_parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip().replace(' ', '') for p in line.split('|')]
            try:
                item_col_idx = -1
                reason_col_idx = -1
                for col_idx, part in enumerate(header_parts):
                    if '항목' in part:
                        item_col_idx = col_idx
                    elif '정정사유' in part:
                        reason_col_idx = col_idx
                
                if item_col_idx != -1 and reason_col_idx != -1 and idx + 1 < len(lines):
                    next_line = lines[idx + 1]
                    if '|' in next_line:
                        data_parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in next_line.split('|')]
                        if len(data_parts) > max(item_col_idx, reason_col_idx):
                            raw_item = data_parts[item_col_idx]
                            raw_reason = data_parts[reason_col_idx]
                            
                            raw_item = re.sub(r'<[^>]*>', '', raw_item)
                            raw_item = re.sub(r'\s+', ' ', raw_item).strip()
                            
                            raw_reason = re.sub(r'<[^>]*>', '', raw_reason)
                            raw_reason = re.sub(r'\s+', ' ', raw_reason).strip()
                            
                            clean_item = raw_item.replace(' ', '')
                            clean_reason = raw_reason.replace(' ', '')
                            
                            invalid_keywords = ['정정전', '정정후', '정정사유', '항목', '정정대상']
                            if not any(k in clean_item for k in invalid_keywords) and len(raw_item) >= 2:
                                correction_item = raw_item
                            if not any(k in clean_reason for k in invalid_keywords) and len(raw_reason) >= 2:
                                correction_reason = raw_reason
                                
                            if correction_item or correction_reason:
                                return correction_item, correction_reason
            except Exception as ex:
                print("Table parsing failed:", ex)
                
    # 1. 정정항목 정밀 추출 (정규식 기반 멀티 매칭) - Fallback
    item_patterns = [
        r"(?:정정\s*대상\s*항목|정정\s*항목)\s*[:：\-\[\]\s]+(.*?)(?=(?:정정\s*사유|정정\s*전후|정정\s*후|\d\.\s*정정|\[|$))",
        r"\[\s*(?:정정\s*대상\s*항목|정정\s*항목)\s*\]\s*(.*?)(?=(?:정정\s*사유|정정\s*전후|정정\s*후|\d\.\s*정정|\[|$))"
    ]
    for p in item_patterns:
        for m in re.finditer(p, raw_text, re.DOTALL | re.IGNORECASE):
            val = m.group(1).strip()
            val = re.sub(r'<[^>]*>', '', val)
            val = re.sub(r'\s+', ' ', val).strip()
            if val and len(val) >= 2:
                # 공백 제거 후 "정정전", "정정후" 키워드가 포함되었거나 vertical bar가 있다면 노이즈로 보고 제외
                val_clean = val.replace(' ', '')
                if "|" in val or "정정전" in val_clean or "정정후" in val_clean or len(val) < 5:
                    continue
                correction_item = val
                break
        if correction_item:
            break
    
    # 2. 정정사유 정밀 추출 - Fallback
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
                
    # 후처리 및 글자수 제한
    if correction_item and len(correction_item) > 200:
        correction_item = correction_item[:197] + "..."
    if correction_reason and len(correction_reason) > 300:
        correction_reason = correction_reason[:297] + "..."
        
    return correction_item, correction_reason

conn = sqlite3.connect('/Users/greego/Desktop/dart pro/lean_engine.db')
for rcept_no in ['20260520000183', '20260520000186', '20260520000190']:
    raw_text = conn.execute('SELECT raw_text FROM filings WHERE rcept_no = ?', (rcept_no,)).fetchone()[0]
    item, reason = _extract_correction_info(raw_text)
    print(f'[{rcept_no}]')
    print('  item:', repr(item))
    print('  reason:', repr(reason))
