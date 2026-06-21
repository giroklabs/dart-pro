import re

def _parse_dividend_details(raw_text: str):
    if not raw_text:
        return None
    lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
    
    div_type = ""      # 결산배당 / 중간배당 등
    div_kind = ""      # 현금배당 / 주식배당 등
    price_common = ""  # 1주당 보통주 배당금
    price_pref = ""    # 1주당 우선주 배당금
    rate_common = ""   # 보통주 시가배당률
    rate_pref = ""     # 우선주 시가배당률
    total_amount = ""  # 배당금 총액
    base_date = ""     # 배당기준일
    
    # 순차적으로 줄을 스캔하며 필요한 데이터를 정밀하게 추출
    i = 0
    while i < len(lines):
        line = lines[i]
        if '|' in line:
            parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
            if len(parts) >= 2:
                k = parts[0].replace(" ", "")
                v = parts[1].strip()
                
                if '배당구분' in k:
                    div_type = v
                elif '배당종류' in k:
                    div_kind = v
                elif '1주당배당금' in k:
                    price_common = v
                    if len(parts) >= 3 and ('보통' in parts[1] or '보통' in parts[0]):
                        price_common = parts[2].strip()
                    if i + 1 < len(lines):
                        next_line = lines[i+1]
                        if '|' in next_line and '종류' in next_line:
                            next_parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in next_line.split('|')]
                            if len(next_parts) >= 2:
                                price_pref = next_parts[-1].strip()
                elif '시가배당률' in k:
                    rate_common = v
                    if len(parts) >= 3 and ('보통' in parts[1] or '보통' in parts[0]):
                        rate_common = parts[2].strip()
                    if i + 1 < len(lines):
                        next_line = lines[i+1]
                        if '|' in next_line and '종류' in next_line:
                            next_parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in next_line.split('|')]
                            if len(next_parts) >= 2:
                                rate_pref = next_parts[-1].strip()
                elif '배당금총액' in k:
                    total_amount = v
                elif '배당기준일' in k:
                    base_date = v
        i += 1

    for idx, line in enumerate(lines):
        if '보통주식' in line and '|' in line:
            parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
            if idx > 0 and '1주당' in lines[idx-1] and not price_common:
                price_common = parts[-1]
            elif idx > 0 and '시가배당률' in lines[idx-1] and not rate_common:
                rate_common = parts[-1]

    if not div_type and not div_kind and not price_common:
        return None
        
    details = []
    if div_type or div_kind:
        details.append(f"{div_type or '결산'} {div_kind or '배당'}을 결정하였습니다.")
        
    prices = []
    if price_common and price_common != "-":
        rate_str = f" (시가배당률: {rate_common}%)" if rate_common and rate_common != "-" else ""
        prices.append(f"보통주 1주당 {price_common}원{rate_str}")
    if price_pref and price_pref != "-":
        rate_str = f" (시가배당률: {rate_pref}%)" if rate_pref and rate_pref != "-" else ""
        prices.append(f"우선주 1주당 {price_pref}원{rate_str}")
        
    if prices:
        details.append("1주당 배당금은 " + ", ".join(prices) + "입니다.")
        
    if total_amount and total_amount != "-":
        try:
            amt_num = float(total_amount.replace(',', '').replace('원', '').strip())
            amt_formatted = f"약 {amt_num / 100_000_000:,.1f}억원" if amt_num >= 100_000_000 else f"{amt_num:,.0f}원"
            details.append(f"배당금 총액은 {amt_formatted} 규모이며,")
        except ValueError:
            details.append(f"배당금 총액은 {total_amount}원 규모이며,")
            
    if base_date and base_date != "-":
        details.append(f"배당기준일은 {base_date}입니다.")
        
    return " ".join(details)

raw_text = """SV인베스트먼트/현금ㆍ현물배당 결정/(2026.05.14)현금ㆍ현물배당 결정
 
현금ㆍ현물배당 결정
 
[테이블] 1. 배당구분 | 결산배당
[테이블] 2. 배당종류 | 현금배당
[테이블] - 현물자산의 상세내역 | -
[테이블] 3. 1주당 배당금(원) | 보통주식 | 20
[테이블] 종류주식 | -
[테이블] - 차등배당 여부 | 미해당
[테이블] 4. 시가배당률(%) | 보통주식 | 0.55
[테이블] 종류주식 | -
[테이블] 5. 배당금총액(원) | 1,086,326,440
[테이블] 6. 배당기준일 | 2026-03-31
[테이블] 7. 배당금지급 예정일자 | -
[테이블] 8. 승인기관 | 이사회
[테이블] 9. 주주총회 예정일자 | 2026-06-26
[테이블] 10. 이사회결의일(결정일) | 2026-05-14"""

result = _parse_dividend_details(raw_text)
print("="*60)
print("볼드체 제거 테스트 결과:")
print(result)
print("="*60)
