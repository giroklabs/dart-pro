import re

def extract_correction_info(raw_text: str):
    if not raw_text:
        return None, None
    
    correction_items = []
    correction_reasons = []
    
    lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
    
    for idx, line in enumerate(lines):
        if '|' in line:
            parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
            
            # 1. 2열 키-밸류 구조
            if len(parts) == 2:
                k = parts[0].replace(" ", "")
                v = parts[1].strip()
                if '정정사유' in k or '정정의사유' in k:
                    if len(v) >= 2 and v != '-':
                        if v not in correction_reasons:
                            correction_reasons.append(v)
                        
            # 2. 다열 테이블 구조
            elif len(parts) >= 3:
                clean_parts = [p.replace(" ", "") for p in parts]
                
                has_item_header = any(k in p for p in clean_parts for k in ['항목', '정정항목'])
                has_reason_header = any('정정사유' in p for p in clean_parts)
                
                if has_item_header or has_reason_header:
                    item_idx = -1
                    reason_idx = -1
                    for i, p in enumerate(clean_parts):
                        if any(k in p for k in ['항목', '정정항목']):
                            item_idx = i
                        elif '정정사유' in p:
                            reason_idx = i
                    
                    curr_idx = idx + 1
                    while curr_idx < len(lines):
                        next_line = lines[curr_idx]
                        if '|' not in next_line:
                            break
                        
                        if '정정전' in next_line or '정정후' in next_line or '정정사유' in next_line:
                            curr_idx += 1
                            continue
                            
                        next_parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in next_line.split('|')]
                        if len(next_parts) > max(item_idx, reason_idx):
                            if item_idx != -1:
                                item_val = next_parts[item_idx]
                                if item_val and item_val != '-' and item_val not in correction_items:
                                    item_val = re.sub(r'<[^>]*>', '', item_val)
                                    item_val = re.sub(r'\s+', ' ', item_val).strip()
                                    correction_items.append(item_val)
                            if reason_idx != -1:
                                reason_val = next_parts[reason_idx]
                                if reason_val and reason_val != '-' and reason_val not in correction_reasons:
                                    reason_val = re.sub(r'<[^>]*>', '', reason_val)
                                    reason_val = re.sub(r'\s+', ' ', reason_val).strip()
                                    correction_reasons.append(reason_val)
                        curr_idx += 1
                        
    if not correction_reasons:
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
                    if val not in correction_reasons:
                        correction_reasons.append(val)
                    break
            if correction_reasons:
                break
                
    corr_item = None
    corr_reason = None
    
    if correction_items:
        corr_item = ", ".join(correction_items)
        if len(corr_item) > 200:
            corr_item = corr_item[:197] + "..."
    if correction_reasons:
        corr_reason = ", ".join(correction_reasons)
        if len(correction_reasons) > 300:
            corr_reason = corr_reason[:297] + "..."
            
    return corr_item, corr_reason

def parse_correction_details(raw_text: str):
    lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
    
    before_sections = []
    after_sections = []
    
    current_section = None
    section_lines = []
    
    for line in lines:
        line_clean = line.replace(" ", "")
        if '정정전' in line_clean or '정정의전' in line_clean:
            if current_section and section_lines:
                if current_section == 'before':
                    before_sections.append(section_lines)
                else:
                    after_sections.append(section_lines)
            current_section = 'before'
            section_lines = []
        elif '정정후' in line_clean or '정정의후' in line_clean:
            if current_section and section_lines:
                if current_section == 'before':
                    before_sections.append(section_lines)
                else:
                    after_sections.append(section_lines)
            current_section = 'after'
            section_lines = []
        else:
            if current_section:
                section_lines.append(line)
                
    if current_section and section_lines:
        if current_section == 'before':
            before_sections.append(section_lines)
        else:
            after_sections.append(section_lines)
            
    details = []
    
    # 1. '계' 행 비교 방식
    for b_sec in before_sections:
        b_totals = []
        for line in b_sec:
            if '|' in line and ('계' in line or '합계' in line or '소계' in line):
                parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
                parts = [p for p in parts if p]
                if parts:
                    b_totals.append(parts)
        
        for a_sec in after_sections:
            a_totals = []
            for line in a_sec:
                if '|' in line and ('계' in line or '합계' in line or '소계' in line):
                    parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
                    parts = [p for p in parts if p]
                    if parts:
                        a_totals.append(parts)
                        
            # 매칭 및 비교
            for b_parts in b_totals:
                for a_parts in a_totals:
                    if b_parts[0] == a_parts[0] and len(b_parts) == len(a_parts):
                        for i in range(1, len(b_parts)):
                            b_val = b_parts[i]
                            a_val = a_parts[i]
                            if b_val != a_val:
                                b_val_clean = re.sub(r'<[^>]*>', '', b_val).strip()
                                a_val_clean = re.sub(r'<[^>]*>', '', a_val).strip()
                                if b_val_clean != a_val_clean and b_val_clean != '-' and a_val_clean != '-':
                                    if b_val_clean.replace(" ", "") == a_val_clean.replace(" ", ""):
                                        continue
                                    change_str = ""
                                    try:
                                        b_num = float(b_val_clean.replace(',', '').replace('원', '').replace('주', '').strip())
                                        a_num = float(a_val_clean.replace(',', '').replace('원', '').replace('주', '').strip())
                                        diff = a_num - b_num
                                        if b_num != 0:
                                            pct = (diff / b_num) * 100
                                            change_str = f" (변동: {diff:+,.0f}, {pct:+.2f}%)"
                                    except ValueError:
                                        pass
                                    
                                    detail_msg = f"▪ 변경사항: {b_val_clean} ➔ {a_val_clean}{change_str}"
                                    if detail_msg not in details:
                                        details.append(detail_msg)
                                        
    # 2. '정정항목 | 정정전 | 정정후' 형태의 직접 테이블 추출 방식
    direct_details = []
    for idx, line in enumerate(lines):
        line_clean = line.replace(" ", "")
        if '정정항목' in line_clean and '정정전' in line_clean and '정정후' in line_clean:
            curr_idx = idx + 1
            while curr_idx < len(lines):
                next_line = lines[curr_idx]
                if '|' not in next_line:
                    break
                next_parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in next_line.split('|')]
                if len(next_parts) >= 3:
                    item = next_parts[0]
                    before = next_parts[1]
                    after = next_parts[2]
                    if item and before and after and before != '-' and after != '-':
                        if before.replace(" ", "") == after.replace(" ", ""):
                            curr_idx += 1
                            continue
                            
                        change_str = ""
                        try:
                            # 콤마, 원, 주, % 등 기호 제거 후 수치형 변환 시도
                            b_num = float(before.replace(',', '').replace('원', '').replace('주', '').replace('%', '').strip())
                            a_num = float(after.replace(',', '').replace('원', '').replace('주', '').replace('%', '').strip())
                            diff = a_num - b_num
                            if b_num != 0:
                                pct = (diff / b_num) * 100
                                change_str = f" (변동: {diff:+,.2f}, {pct:+.2f}%)"
                        except ValueError:
                            pass
                        
                        msg = f"▪ 변경사항({item}): {before} ➔ {after}{change_str}"
                        if msg not in direct_details:
                            direct_details.append(msg)
                curr_idx += 1
                
    if direct_details:
        details.extend(direct_details)
        
    return details

if __name__ == "__main__":
    import sqlite3
    conn = sqlite3.connect("lean_engine.db")
    cursor = conn.cursor()
    
    # DL이앤씨 접수번호
    cursor.execute("SELECT raw_text FROM filings WHERE rcept_no = '20260520800004'")
    row = cursor.fetchone()
    if row:
        raw_text = row[0]
        corr_item, corr_reason = extract_correction_info(raw_text)
        details = parse_correction_details(raw_text)
        
        print("DL이앤씨 테스트 결과:")
        print("정정항목:", corr_item)
        print("정정사유:", corr_reason)
        print("정정상세:")
        for d in details:
            print(" ", d)
    conn.close()
