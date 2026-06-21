import sqlite3
import re
import json

def parse_large_holding(raw_text: str) -> str:
    if not raw_text:
        return None
        
    lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
    
    ratios = []
    lines_len = len(lines)
    
    # 1. "보유비율(%)" 헤더 아래의 실제 소수점 실수 데이터 추출
    for idx, line in enumerate(lines):
        if '보유비율(%)' in line or '보유비율' in line:
            for j in range(idx + 1, min(idx + 15, lines_len)):
                next_line = lines[j]
                # [테이블] 14,486,386 | 0 | 40.34 | 40.34 와 같이 한 행에 뭉쳐서 나올 경우
                if '|' in next_line:
                    parts = [p.strip() for p in next_line.split('|')]
                    for p in parts:
                        if re.match(r"^\d+\.\d+$", p):
                            if f"{p}%" not in ratios:
                                ratios.append(f"{p}%")
                else:
                    # 단독 행에 수치만 올 경우
                    match = re.match(r"^\s*(\d+\.\d+)\s*$", next_line)
                    if match:
                        val = match.group(1)
                        if f"{val}%" not in ratios:
                            ratios.append(f"{val}%")

    # 2. 텍스트 전체에서 장내매수/매도 등 주식 소유 변동 내역 추출
    transactions = []
    for line in lines:
        if '장내매수' in line or '장내처분' in line or '장내매도' in line or '블록딜' in line:
            if '|' in line:
                parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
                if len(parts) >= 4:
                    # 성명, 일자, 변동유형, 수량 등 추출
                    name = parts[0]
                    date = parts[2] if len(parts) > 2 else ""
                    action = parts[3] if len(parts) > 3 else ""
                    shares = parts[5] if len(parts) > 5 else ""
                    
                    if name and action:
                        transactions.append(f"{name}의 {action}({shares}주, {date})")

    # 3. 자연어 요약문 작성
    ratio_str = f" 최종 보유비율은 **{ratios[0]}**" if ratios else " 보유비율 변동이 있었습니다"
    trans_str = f" ({', '.join(transactions[:2])} 발생)" if transactions else ""
    
    return f"주식등의대량보유상황보고서가 제출되었습니다.{ratio_str}입니다.{trans_str}"

def parse_debt_security_확정(raw_text: str) -> str:
    if not raw_text:
        return None
        
    lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
    
    rates = []
    amounts = []
    add_rates = []
    
    for line in lines:
        if '|' in line:
            parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
            if any(k in parts[0] for k in ['이자율', '금리', '수익률', '확정']):
                for p in parts[1:]:
                    if '%' in p and re.search(r'^\d+(?:\.\d+)?\s*%$', p.strip()):
                        rates.append(p.strip())
            
            if any(k in parts[0] for k in ['모집총액', '권면총액', '발행금액', '발행총액', '확정금액']):
                for p in parts[1:]:
                    clean_val = p.replace(",", "").strip()
                    if clean_val.isdigit() and int(clean_val) >= 1000000:
                        amt_gb = int(clean_val) / 100000000
                        amt_str = f"{amt_gb:,.0f}억원" if amt_gb.is_integer() else f"{amt_gb:,.1f}억원"
                        if amt_str not in amounts:
                            amounts.append(amt_str)
                            
        if '가산' in line:
            match = re.search(r"([\+\-]?\d+(?:\.\d+)?\s*%\s*p\.?)", line)
            if match:
                val = match.group(1).strip()
                if val not in add_rates:
                    add_rates.append(val)
                    
    comp_ratio = ""
    for line in lines:
        if '경쟁률' in line or '수요예측' in line:
            match = re.search(r"(\d+(?:\.\d+)?\s*:\s*\d+)", line)
            if match:
                comp_ratio = match.group(1)
                break
                
    details = []
    if amounts:
        details.append(f"최종 확정 발행 금액은 **{', '.join(amounts)}**이며,")
    
    if rates:
        details.append(f"확정 이자율은 **{', '.join(rates)}**입니다.")
    elif add_rates:
        details.append(f"개별민평 대비 가산금리는 **{', '.join(add_rates)}**로 확정되었습니다.")
        
    if comp_ratio:
        details.append(f"수요예측 경쟁률은 **{comp_ratio}**를 기록하였습니다.")
        
    if details:
        return " ".join(details)
    return "증권신고서 발행조건이 최종 확정되었습니다. 상세 조건은 본문(상세보기)에서 확인해 주세요."

# --- SIMULATION ---

conn = sqlite3.connect("lean_engine.db")
test_cases = [
    ('20260520000202', '대량보유상황보고서'),
    ('20260521000651', '발행조건확정 증권신고서 (1)'),
    ('20260521000613', '발행조건확정 증권신고서 (2)')
]

print("="*60)
print("DART 요약 품질 개선안 시뮬레이션 (3건 테스트 - 최종 업그레이드2)")
print("="*60)

for rcept_no, label in test_cases:
    row = conn.execute("SELECT report_nm, raw_text FROM filings WHERE rcept_no=?", (rcept_no,)).fetchone()
    if not row:
        print(f"[{label}] DB에 존재하지 않음 ({rcept_no})")
        continue
        
    report_nm, raw_text = row
    
    # 1. 기존 로직 (개선 전)
    import sys
    sys.path.append('lean_engine')
    from rules import SummaryRuleEngine
    rule_engine = SummaryRuleEngine()
    
    original_sentences = rule_engine.split_sentences(raw_text)
    scored = [
        (s, rule_engine.score_sentence(s, i, len(original_sentences)))
        for i, s in enumerate(original_sentences)
    ]
    scored.sort(key=lambda x: x[1], reverse=True)
    top_3 = scored[:3]
    top_3.sort(key=lambda x: original_sentences.index(x[0]))
    
    before_summary = "\n".join(f"- {rule_engine.clean_sentence(s[0])}" for s in top_3)
    
    # 2. 개선 로직 (개선 후)
    after_summary = ""
    if "대량보유" in report_nm:
        holding_desc = parse_large_holding(raw_text)
        after_summary = f"▪ {holding_desc}"
    elif "발행조건확정" in report_nm or "확정" in report_nm:
        debt_desc = parse_debt_security_확정(raw_text)
        after_summary = f"▪ {debt_desc}"
    else:
        # 일반 모드 시 split_sentences 개선안 적용
        import re
        improved_sents = []
        for line in raw_text.splitlines():
            line = line.strip()
            if not line:
                continue
            parts = re.split(r'(?<=[\.\?\!])\s+|(?<=다\.)\s+|(?<=니다\.)\s+|(?<=합니다\.)\s+', line)
            for p in parts:
                p = re.sub(r'\s+', ' ', p).strip()
                if not p:
                    continue
                if (p.count('%') >= 4) or (p.count(':') >= 4 and any(ch.isdigit() for ch in p)):
                    continue
                improved_sents.append(p)
                
        scored_imp = [
            (s, rule_engine.score_sentence(s, i, len(improved_sents)))
            for i, s in enumerate(improved_sents)
        ]
        scored_imp.sort(key=lambda x: x[1], reverse=True)
        top_3_imp = scored_imp[:3]
        top_3_imp.sort(key=lambda x: improved_sents.index(x[0]))
        after_summary = "\n".join(f"- {rule_engine.clean_sentence(s[0])}" for s in top_3_imp)
        
    print(f"\n[공시명] {report_nm} ({rcept_no})")
    print("-" * 50)
    print("◀ 개선 전 요약 (기존):")
    print(before_summary)
    print("-" * 50)
    print("▶ 개선 후 요약 (신규):")
    print(after_summary)
    print("=" * 60)

conn.close()
