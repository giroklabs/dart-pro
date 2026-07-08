import re
import logging
import warnings
import sqlite3
import os
from typing import List
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

logger = logging.getLogger(__name__)


class SummaryRuleEngine:
    def __init__(self, preserve_original_amounts: bool = True):
        self.amount_re = re.compile(
            r'(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d{4,}(?:\.\d+)?)'
            r'(\s*(?:조원|억원|백만원|천만원|달러|USD|원|주))',
            re.IGNORECASE
        )
        self.percent_re = re.compile(r'(\d+(?:\.\d+)?\s*%)')
        self.date_re = re.compile(
            r'(\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{4}년\s*\d{1,2}월\s*\d{1,2}일)',
            re.IGNORECASE
        )
        self.empty_bracket_re = re.compile(r'\(\s*\)')

        self.action_keywords = [
            '결정', '체결', '취득', '처분', '발행',
            '승인', '해지', '합병', '변경', '소각', '배당'
        ]
        self.risk_keywords = [
            '불확실성', '위험', '소송', '제재', '부도',
            '상장폐지', '주의', '리스크'
        ]
        self.performance_keywords = [
            '매출액', '영업이익', '당기순이익', '매출',
            '영업손실', '당기순손실', '증가', '감소',
            '전년동기', '전기대비', '성장', '흑자전환', '적자전환'
        ]

        self.noise_keywords = [
            '홈페이지', '전화번호', '팩스번호', '본점소재지',
            '참고하시기 바랍니다', '참조하시기 바랍니다',
            '상세한 사항은', '사업자등록번호', '보고서작성기준일'
        ]

        self.dynamic_noise_regexes = [
            re.compile(r'\(\s*전\s*화\s*\)'),
            re.compile(r'전\s*화\s*번\s*호'),
            re.compile(r'T\s*E\s*L\s*[:\.]?', re.IGNORECASE),
            re.compile(r'팩\s*스\s*번\s*호'),
            re.compile(r'\(\s*팩\s*스\s*\)'),
            re.compile(r'전\s*화\s*[:\.]')
        ]
        self._load_noise_rules_from_db()

        self.min_sentence_length = 5
        self.preserve_original_amounts = preserve_original_amounts

    def _load_noise_rules_from_db(self):
        try:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            db_path = os.path.join(os.path.dirname(current_dir), "lean_engine.db")
            if os.path.exists(db_path):
                conn = sqlite3.connect(db_path)
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='noise_rules';")
                if cursor.fetchone():
                    cursor.execute("SELECT rule_type, pattern FROM noise_rules")
                    rows = cursor.fetchall()
                    for r_type, pattern in rows:
                        if r_type == 'KEYWORD':
                            self.noise_keywords.append(pattern)
                        elif r_type == 'REGEX':
                            try:
                                self.dynamic_noise_regexes.append(re.compile(pattern))
                            except Exception:
                                pass
                conn.close()
        except Exception as e:
            logger.error("Failed to load noise_rules from DB: %s", e)

    def _extract_markup_from_document_xml(self, raw: str) -> str:
        raw = raw or ""
        raw_strip = raw.lstrip()

        if not raw_strip.startswith("<?xml"):
            return raw

        try:
            xml_soup = BeautifulSoup(raw, "xml")

            for tag_name in ["DOCUMENT", "document", "TEXT", "text", "BODY", "body", "SECTION", "section"]:
                for node in xml_soup.find_all(tag_name):
                    inner = "".join(str(x) for x in node.contents).strip()
                    if "<table" in inner or "<tr" in inner or "<td" in inner:
                        return inner

            return str(xml_soup)
        except Exception as e:
            logger.debug("document.xml 본문 추출 실패: %s", e)
            return raw

    def process_content(self, content) -> str:
        if isinstance(content, bytes):
            raw = content.decode("utf-8", errors="ignore")
        else:
            raw = str(content)

        markup = self._extract_markup_from_document_xml(raw)
        soup = BeautifulSoup(markup, "lxml")

        for s in soup(["script", "style", "meta", "link", "iframe"]):
            s.decompose()

        for tr in soup.find_all(["tr", "table_row"]):
            tds = [td.get_text(separator=" ", strip=True) for td in tr.find_all(["td", "th", "table_data", "tu", "te"])]
            if not tds:
                continue

            combined = " | ".join([t for t in tds if t])
            if combined:
                if len(combined) > 2000:
                    combined = combined[:2000] + "..."
                new_p = soup.new_tag("p")
                new_p.string = f"[테이블] {combined}"
                tr.replace_with(new_p)

        text = soup.get_text(separator="\n")
        text = re.sub(r"\n{2,}", "\n", text)
        return text.strip()

    def split_sentences(self, text: str) -> List[str]:
        # 의미없이 끊긴 줄바꿈 복원: 줄이 조사나 기호로 끝나고 다음 줄이 이어지는 경우
        text = re.sub(r'([은는이가을를와과에로도만의,(])\s*\n\s*', r'\1 ', text)
        
        candidates = []

        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue

            # Split on standard endings, OR numbered lists (e.g. " 1)", " 2.", " ①")
            parts = re.split(
                r'(?<=다\.)\s+|(?<=니다\.)\s+|(?<=합니다\.)\s+|(?<!\d\.)(?<=\.)\s+(?=[A-Z가-힣])|\s+(?=\d+\))|\s+(?=[①②③④⑤⑥⑦⑧⑨⑩])',
                line
            )  # \d+\.은 소수점 및 리스트 번호(1. 2.) 오분리 위험으로 제외

            for p in parts:
                p = re.sub(r'\s+', ' ', p).strip()
                if not p:
                    continue

                if any(k in p for k in self.noise_keywords):
                    continue
                if any(k in p.replace(" ", "") for k in self.noise_keywords):
                    continue
                if any(reg.search(p) for reg in self.dynamic_noise_regexes):
                    continue

                # 슬래시(/)가 2개 이상 포함된 메타데이터 라인 필터링 (날짜 형태 제외)
                clean_p_no_date = re.sub(r'\d{4}[./-]\d{1,2}[./-]\d{1,2}', '', p)
                if clean_p_no_date.count('/') >= 2:
                    continue

                if self._looks_like_address(p):
                    continue

                # 콤마나 공백으로 나열된 반복 날짜 구조 감지 및 스킵 (예: 이자지급기한 날짜 리스트)
                date_matches = re.findall(r'\d{4}[년./-]\s*\d{1,2}[월./-]\s*\d{1,2}일?|\d{1,2}월\s*\d{1,2}일', p)
                if len(date_matches) >= 3:
                    continue

                # 비율/콜론 연속 나열(퍼센트 3개 이상 또는 콜론 4개 이상이면서 숫자 포함) 배제
                # [테이블] 마킹 행은 파이프로 구분되므로 콜론 필터 예외 처리
                if not p.startswith("[테이블]"):
                    if (p.count('%') >= 3) or (p.count(':') >= 4 and any(ch.isdigit() for ch in p)):
                        continue

                # 사례 예시 나열 스킵 (지수증권 등 가상 시나리오)
                if any(k in p for k in ['지표가치가', '원 상환', '손실이 발생할 수', '투자 시나리오', '상환가격 결정일']) or re.search(r'사례\d+', p):
                    continue

                # 단순 수수료 및 발행 분담금 등 지엽적인 비용/수수료 정보 스킵
                if any(k in p for k in ['인수수수료', '발행분담금', '인수단', '수수료의 지급', '청약수수료', '상장수수료', '심사수수료', '기타비용', '기타 비용', '등록수수료', '등록 비용']) and not any(k in p for k in self.performance_keywords):
                    continue

                if len(p) < self.min_sentence_length:
                    if not (
                        self.amount_re.search(p)
                        or self.percent_re.search(p)
                        or any(k in p for k in self.performance_keywords)
                    ):
                        continue

                candidates.append(p)

        seen = set()
        results = []
        for s in candidates:
            key = re.sub(r'\s+', ' ', s).strip()
            if key in seen:
                continue
            seen.add(key)
            results.append(s)

        return results

    def score_sentence(self, sentence: str, sent_order: int, total_sents: int) -> float:
        score = 0.0

        amount_hits = len(self.amount_re.findall(sentence))
        percent_hits = len(self.percent_re.findall(sentence))
        date_hits = len(self.date_re.findall(sentence))
        perf_hits = sum(1 for k in self.performance_keywords if k in sentence)
        action_hits = sum(1 for k in self.action_keywords if k in sentence)
        risk_hits = sum(1 for k in self.risk_keywords if k in sentence)

        score += perf_hits * 4.0
        score += amount_hits * 2.0
        score += percent_hits * 1.5
        score += action_hits * 1.0
        score += risk_hits * 1.5
        score += date_hits * 0.3

        if sentence.startswith("[테이블]"):
            if any(k in sentence for k in ['매출액', '영업이익', '당기순이익', '영업손실', '당기순손실']):
                score += 4.0
            elif any(k in sentence for k in ['정정사유', '정정요구', '정정 전', '정정 후']):
                score += 8.0
            elif any(k in sentence for k in ['선임의 건', '승인의 건', '변경의 건', '의안']):
                score += 6.0
            else:
                score += 1.0

        # 채무증권/지수증권 등의 최종 배정 및 모집총액 우선순위 가중치 격상 (공백 무시 매칭)
        norm_sent = sentence.replace(" ", "")
        if any(k in norm_sent for k in ['최종배정금액', '모집총액', '총발행금액', '사채의종류', '기초자산종목명', '기초자산명', '발행조건확정', '수요예측결과', '확정금액', '거래대상', '거래일자', '거래금액', '거래의목적', '거래상대방']):
            score += 20.0

        if any(k in sentence for k in ['전망', '예측', '추정', '시장 규모', 'CAGR']):
            score -= 4.0

        if any(k in sentence for k in ['전환가액', '신주인수권', '행사가액']) and perf_hits == 0:
            if not any(k in sentence for k in ['조정사유', '조정에 관한 사항', '조정 전', '조정 후', '조정후', '조정전']):
                score -= 2.0

        # 투자판단관련주요경영사항 등 핵심 항목 가점
        # 주의: '주요내용', '결정사유'는 너무 범용적이라 항목 제목 행에도 가점이 붙으므로 제외
        if any(k in norm_sent for k in ['만료사유', '향후계획', '조달목적', '발행규모', '임상시험단계', '기대효과', '품목명', '신청일', '대상질환명', '적응증', '승인기관', '임상시험관련사항']):
            score += 25.0
        # 주요내용/결정사유는 내용이 충분히 길 때만 가점 (단순 라벨 행 방지)
        elif any(k in norm_sent for k in ['주요내용', '결정사유']) and len(sentence.replace(' ', '')) > 20:
            score += 15.0

        # 조정사유 및 조정 정보 가중치 상향 (가점)
        if any(k in sentence for k in ['조정사유', '조정에 관한 사항', '조정 전', '조정 후', '조정후', '조정전']):
            score += 15.0

        # 불필요한 메타데이터 및 꼬리말 강력 감점 (Penalty)
        if any(k in norm_sent for k in ['※관련공시', '1.제목', '관련공시:', '이사회결의일', '제출(확인)일자', '제출일자', '확인일자']):
            score -= 50.0

        # 바이오 임상 면책조항(투자유의사항) 노이즈 감점
        if any(k in norm_sent for k in ['투자유의사항', '최종허가받을확률은', '통계적으로약10%']):
            score -= 50.0

        # 법적 한도/면책/청약배정 노이즈 문구 대폭 감점 (감점)
        if any(k in norm_sent for k in ['70%에미달', '70%에해당', '새로운전환가액', '발행당시전환가액', '안분배정', '선배정', '발행취소', '초과청약', '경합하는경우', '누계금액', '의결일', '참석여부']):
            score -= 20.0

        if sentence.strip() in {'공시일자', '내용', '비고', '기준', '일자', '구분', '목적', '항목'}:
            score -= 5.0

        # 단순 메타데이터(보고서명, 제출인, 대표이사, 귀하 등) 문장 대폭 감점
        if any(k in sentence for k in ['금융감독원장 귀하', '금융위 귀하', '보고서제출인', '보고서 제출인', '귀중', '대표이사 귀하', '본문내용']):
            score -= 20.0

        # 빈 값(-) 테이블 행 및 조세 관련 면책 조항 대폭 감점
        if re.search(r'[\:\|]\s*-\s*$', sentence.strip()) or any(k in sentence for k in ['자체적인 판단에 의함', '조세특례제한법']):
            score -= 20.0

        # 테이블 내에 빈 값(- 또는 공란)이 다수 나열된 단순 나열행 감점
        if sentence.startswith("[테이블]") and (": -" in sentence or "| -" in sentence or ":  -" in sentence or "|  -" in sentence):
            score -= 15.0

        # 공시 제목 자체를 요약 불릿에 넣지 않도록 감점
        if any(k in sentence for k in ['증권발행실적보고서', '투자설명서', '주요사항보고서', '증권신고서', '사업보고서', '분기보고서', '반기보고서']):
            score -= 15.0

        # 숫자가 없는 테이블 헤더/칼럼명 단순 나열 행 대폭 감점 (예: 매출액 : 비율 : 매출액 : 비율)
        if (sentence.startswith("[테이블]") or sentence.count(":") >= 2 or sentence.count("|") >= 2) and not any(ch.isdigit() for ch in sentence):
            score -= 15.0

        if not any(ch.isdigit() for ch in sentence):
            if perf_hits == 0 and action_hits == 0 and risk_hits == 0:
                score -= 2.0

        # 특수기호 비율 검증 및 통계적 페널티 (10% 이상이면 점수 대폭 차감)
        # 시스템이 삽입한 [테이블] 및 | 기호는 제외하고 계산
        clean_for_chars = sentence.replace("[테이블]", "").replace(" | ", "")
        special_chars = sum(1 for ch in clean_for_chars if ch in '/[]{}\\<>#_:')
        if len(clean_for_chars) > 10 and (special_chars / len(clean_for_chars)) >= 0.1:
            score *= 0.1

        pos_ratio = sent_order / max(total_sents, 1)
        if pos_ratio < 0.1:
            score += 1.0

        if len(sentence) > 300:
            score -= 2.0

        if self.empty_bracket_re.search(sentence):
            score -= 1.5

        return round(min(score, 30.0), 4)

    def _get_josa(self, word: str) -> str:
        if not word:
            return "은"
        last_char = word[-1]
        if '가' <= last_char <= '힣':
            char_code = ord(last_char) - 44032
            tail = char_code % 28
            return "은" if tail > 0 else "는"
        return "은"

    def format_raw_table_to_korean(self, sentence: str) -> str:
        if not sentence.startswith("[테이블]"):
            return sentence
        
        content = sentence.replace("[테이블]", "").strip()
        parts = [p.strip() for p in content.split("|") if p.strip()]
        if not parts:
            return ""
            
        first = parts[0]
        ignorable_headers = {
            '발행주식 총수', '발행주식총수', '발행주식 총수 (주)', '비고', '구분', '일자', '내용',
            '보고사유', '변동일', '특정증권의 종류', '특정증권등의종류'
        }
        
        if len(parts) < 2:
            if first in ignorable_headers or first.strip() in ignorable_headers:
                return ""
            return content
            
        if len(parts) == 2 and parts[1] == '-':
            if first in ignorable_headers or first.strip() in ignorable_headers:
                return ""
            
        # 0. 영업(잠정)실적(공정공시) 매칭
        report_nm = getattr(self, 'current_report_nm', '')
        is_earnings_preview = any(k in report_nm for k in ['영업(잠정)실적', '영업실적', '잠정실적'])
        if is_earnings_preview and len(parts) >= 2:
            p_clean = [p.replace(",", "").strip() for p in parts]
            label = p_clean[0]

            # 0-A. 재무수치 행 파서 (매출액, 영업이익 등 / 흑자전환, 적자전환 및 국가별/법인별 실적 포함)
            financial_labels = ['매출액', '영업이익', '영업손실', '당기순이익', '당기순손실', '매출']
            ignorable_headers_extended = {
                '발행주식 총수', '발행주식총수', '발행주식 총수 (주)', '비고', '구분', '일자', '내용',
                '보고사유', '변동일', '특정증권의 종류', '특정증권등의종류', '실적기간', '전기실적',
                '당기실적', '전년동기실적', '당기누계실적', '전년동기누적실적', '연락처', '전화번호',
                '정보제공자', '정보제공대상자', '정보제공(예정)일자', '정보제공(예정)시간', '행사명(장소)',
                '관련부서', '※ 관련공시', '관련공시', '지배기업', '누계실적', '합계'
            }
            # 흑자전환/적자전환/전환여부 컬럼 값 및 수치 값 감지
            turn_str = ''
            num_vals = []
            for p in p_clean[1:]:
                if any(k in p for k in ['흑자전환', '적자전환', '흑자지속', '적자지속', '전환여부']):
                    turn_str = p
                elif re.match(r'^-?[\d.]+$', p):
                    try:
                        num_vals.append(float(p))
                    except ValueError:
                        pass

            has_numbers = len(num_vals) > 0
            sales_categories = {'국내', '해외', '계', '내수', '수출', '국내판매', '해외판매'}
            is_financial_row = any(fl in label for fl in financial_labels) or (
                label not in ignorable_headers_extended and 
                not any(ih in label for ih in ignorable_headers_extended) and 
                label not in sales_categories and
                has_numbers
            )

            if is_financial_row:
                if not has_numbers and not turn_str:
                    # 헤더 행 (분기명 등) → 무시
                    return ''
                summary_parts = []
                # 수치 단위 판별 (명시적 단위 표기 우선 탐색)
                raw_text = getattr(self, 'current_raw_text', '')
                unit_label = '억원' # 기본값
                
                m = re.search(r'단위\s*[:\s]*([^,\n|]+)', raw_text)
                if m:
                    unit_str = m.group(1).replace(" ", "")
                    if '조원' in unit_str:
                        unit_label = '조원'
                    elif '십억원' in unit_str:
                        unit_label = '십억원'
                    elif '백만원' in unit_str:
                        unit_label = '백만원'
                    elif '억원' in unit_str:
                        unit_label = '억원'
                else:
                    if '조원' in raw_text:
                        unit_label = '조원'
                    elif '십억원' in raw_text:
                        unit_label = '십억원'
                    elif '백만원' in raw_text:
                        unit_label = '백만원'

                def _fmt_currency(val, unit):
                    if unit == '억원' and abs(val) >= 10000:
                        return f"{val / 10000:,.1f}조원".replace('.0조원', '조원')
                    elif unit == '백만원' and abs(val) >= 1_000_000:
                        return f"{val / 1_000_000:,.1f}조원".replace('.0조원', '조원')
                    elif unit == '조원':
                        return f"{val:,.1f}조원".replace('.0조원', '조원')
                    else:
                        return f"{val:,.0f}{unit}"

                if len(num_vals) >= 2:
                    curr = num_vals[0]
                    prev = num_vals[1]
                    # 수치가 이미 억원/백만원 단위인 경우 큰 금액은 조 단위로 변환하여 표기
                    curr_str = _fmt_currency(curr, unit_label)
                    prev_str = _fmt_currency(prev, unit_label)
                    if prev != 0:
                        rate = ((curr - prev) / abs(prev)) * 100
                        rate_str = f"+{rate:.1f}%" if rate >= 0 else f"{rate:.1f}%"
                        summary_parts.append(f"{label} {curr_str} (전기 {prev_str}, {rate_str})")
                    else:
                        summary_parts.append(f"{label} {curr_str} (전기 {prev_str})")
                elif len(num_vals) == 1:
                    summary_parts.append(f"{label} {_fmt_currency(num_vals[0], unit_label)}")

                if turn_str and turn_str != '흑자지속' and turn_str != '적자지속':
                    summary_parts.append(turn_str)

                if summary_parts:
                    return ' / '.join(summary_parts)

            # 0-B. 판매대수 행 파서 (국내/해외/계)
            target_categories = ['국내', '해외', '계', '내수', '수출', '국내판매', '해외판매']
            if label in target_categories and len(p_clean) >= 4:
                # 누적 여부 판별: 2번째, 3번째 컬럼이 '-' 이고 5번째 또는 6번째 컬럼에 값이 있는 경우 누적
                is_cumulative = False
                if len(p_clean) >= 7:
                    is_cumulative = (p_clean[2] == '-' and p_clean[3] == '-' and p_clean[5] != '-' and p_clean[6] != '-')
                
                if is_cumulative and len(p_clean) >= 7:
                    cum_val = p_clean[1]
                    cum_rate = p_clean[6]
                    
                    summary_parts = []
                    if cum_val != '-':
                        try:
                            summary_parts.append(f"상반기 누적 {int(float(cum_val)):,}대")
                        except ValueError:
                            summary_parts.append(f"상반기 누적 {cum_val}대")
                    if cum_rate != '-' and cum_rate != '0':
                        cum_rate = cum_rate.replace('+', '').replace('%', '').strip()
                        sign = "+" if not cum_rate.startswith("-") else ""
                        summary_parts.append(f"전년동기대비 {sign}{cum_rate}%")
                    
                    if summary_parts:
                        return f"{label} 누적 실적: {', '.join(summary_parts)}"
                else:
                    curr_val = p_clean[1]
                    prev_rate = p_clean[3] if len(p_clean) > 3 else '-'
                    year_ago_rate = p_clean[6] if len(p_clean) > 6 else '-'
                    
                    summary_parts = []
                    if curr_val != '-':
                        try:
                            summary_parts.append(f"당월 {int(float(curr_val)):,}대")
                        except ValueError:
                            summary_parts.append(f"당월 {curr_val}대")
                    if prev_rate != '-' and prev_rate != '0' and prev_rate != '':
                        prev_rate = prev_rate.replace('+', '').replace('%', '').strip()
                        sign = "+" if not prev_rate.startswith("-") else ""
                        summary_parts.append(f"전월대비 {sign}{prev_rate}%")
                    if year_ago_rate != '-' and year_ago_rate != '0' and year_ago_rate != '':
                        year_ago_rate = year_ago_rate.replace('+', '').replace('%', '').strip()
                        sign = "+" if not year_ago_rate.startswith("-") else ""
                        summary_parts.append(f"전년동월대비 {sign}{year_ago_rate}%")
                        
                    if summary_parts:
                        return f"{label} 실적: {', '.join(summary_parts)}"

            # 0-C. is_earnings_preview이지만 위 파서에 매칭되지 않은 행은 헤더/메타 행으로 판단하여 제거
            # (예: "구분 | (26.2Q) | (26.1Q) | 증감율(%) | 흑자적자전환여부" 같은 컬럼명 행)
            return ''

        # 0-2. 자기주식취득결과보고서 매칭 (취득 총합 결과 추출)
        is_treasury_result = any(k in report_nm for k in ['자기주식취득결과', '자사주취득결과'])
        if is_treasury_result and len(parts) >= 5:
            if first in ['계', '합계', '총계']:
                p_clean = [p.replace(",", "").strip() for p in parts]
                nums = []
                for p in p_clean[1:]:
                    if re.match(r"^\d+$", p):
                        nums.append(int(p))
                
                if len(nums) >= 3:
                    shares = nums[1] if len(nums) > 1 else nums[0]
                    price = nums[-2]
                    total_amount = nums[-1]
                    
                    amount_str = ""
                    if total_amount >= 100_000_000_000:
                        amount_str = f"{total_amount / 1_000_000_000_000:.1f}조원"
                    elif total_amount >= 100_000_000:
                        amount_str = f"{total_amount / 100_000_000:.1f}억원"
                    else:
                        amount_str = f"{total_amount:,}원"
                        
                    return f"자기주식 최종 취득 결과: 총 {shares:,}주를 평균 단가 {price:,}원에 취득 완료 (총 취득금액 {amount_str})"

        # 1. 재무 지표 매칭 (매출액, 영업이익, 당기순이익 등)
        financial_metrics = ['매출액', '영업이익', '당기순이익', '영업손실', '당기순손실']
        if any(m in first for m in financial_metrics):
            numbers = []
            for p in parts[1:]:
                clean_num = p.replace(",", "").strip()
                if re.match(r"^-?\d+(?:\.\d+)?$", clean_num):
                    numbers.append(float(clean_num))
            
            if len(numbers) >= 2:
                current = numbers[0]
                prev = numbers[1]
                if prev != 0:
                    change_rate = ((current - prev) / abs(prev)) * 100
                    change_str = f"{change_rate:.1f}% 증가" if change_rate > 0 else f"{abs(change_rate):.1f}% 감소"
                    if change_rate == 0:
                        change_str = "동일"
                    
                    metric_label = first.replace("(", " ").replace(")", " ").replace("-", "").strip()
                    metric_label = re.sub(r'\s*(?:원|%)\s*$', '', metric_label).strip()
                    if metric_label.endswith("대비"):
                        metric_label += " 비율"
                    josa = self._get_josa(metric_label)
                    return f"{metric_label}{josa} {current:,.0f}원으로, 전년({prev:,.0f}) 대비 {change_str}하였습니다."
            elif len(numbers) == 1:
                val = numbers[0]
                unit = "%" if "%" in first or "대비" in first else "원"
                metric_label = first.replace("(", " ").replace(")", " ").replace("-", "").strip()
                metric_label = re.sub(r'\s*(?:원|%)\s*$', '', metric_label).strip()
                if metric_label.endswith("대비"):
                    metric_label += " 비율"
                josa = self._get_josa(metric_label)
                if unit == "원":
                    return f"{metric_label}{josa} {val:,.0f}{unit}입니다."
                else:
                    return f"{metric_label}{josa} {val:.2f}{unit}입니다."
                    
        # 2. 주주총회 안건 매칭
        if '주주총회' in first or any('의안' in p for p in parts):
            result = "결의"
            for p in parts:
                if '가결' in p or 'Approved' in p:
                    result = "최종 가결"
                    break
                elif '부결' in p or 'Rejected' in p:
                    result = "최종 부결"
                    break
            
            ratio_str = ""
            for p in parts:
                if re.match(r"^\d{1,2}(?:\.\d+)?$", p):
                    val = float(p)
                    if 50.0 <= val <= 100.0:
                        ratio_str = f" (찬성률 {val}%)"
                        break
            
            desc = ""
            for p in parts:
                if '배당' in p or '재무제표' in p or '의안' in p or '승인' in p:
                    if len(p) > len(desc):
                        desc = p
            
            if desc:
                desc_clean = desc.replace("\n", " ").strip()
                return f"{first}에서 '{desc_clean}' 안건이{ratio_str} {result}되었습니다."

        # 2-2. 주주총회 안건 세부내역 (번호 | 회의목적사항 | 비고)
        if len(parts) >= 2 and any(k in parts[1] for k in ['선임의 건', '승인의 건', '변경의 건', '감자의 건', '합병의 건', '의안']):
            item_no = parts[0].strip()
            agenda = parts[1].strip()
            note = " - ".join(parts[2:]).strip() if len(parts) > 2 else ""
            
            prefix = ""
            if re.match(r"^\d+$", item_no):
                prefix = f"제{item_no}호 안건: "
            elif item_no and item_no != "-":
                prefix = f"[{item_no}] "
                
            if note and note != "-":
                return f"{prefix}{agenda} ({note})"
            else:
                return f"{prefix}{agenda}"

        # 3. 전환사채 등 차수 및 비율 매칭
        if '차' in first and any('%' in p for p in parts):
            pct = ""
            for p in parts:
                if '%' in p:
                    pct = p
                    break
            return f"{first} 관련 세부 조건(비율/이율: {pct}) 및 일정이 확정되었습니다."
            
        # 4. 기업설명회(IR) 일시 및 시간 매칭 (모든 파트가 날짜/시간으로만 이루어진 경우)
        date_time_parts = []
        for p in parts:
            if re.match(r"^\d{4}[./-]\d{1,2}[./-]\d{1,2}$", p) or re.match(r"^\d{1,2}:\d{2}$", p):
                date_time_parts.append(p)
        if len(date_time_parts) == len(parts) and len(parts) >= 2:
            start_date = date_time_parts[0]
            end_date = date_time_parts[1] if len(date_time_parts) > 1 else start_date
            start_time = date_time_parts[2] if len(date_time_parts) > 2 else ""
            end_time = date_time_parts[3] if len(date_time_parts) > 3 else ""
            
            time_str = f" {start_time} ~ {end_time}" if start_time else ""
            if start_date == end_date:
                return f"개최 일시: {start_date}{time_str}입니다."
            else:
                return f"개최 일시: {start_date} ~ {end_date}{time_str}입니다."

        # 5. 임원 및 주요주주 소유상황 보고서 매칭
        # 발행회사와의 관계 관련 매칭
        if any('발행회사와의 관계' in p for p in parts) or any('임원(등기여부)' in p for p in parts):
            relation = ""
            position = ""
            for p in parts:
                if '발행회사' in p or '관계' in p:
                    continue
                if '임원' in p or '주주' in p or '친인척' in p or '계열회사' in p or '최대주주' in p:
                    relation = p
                else:
                    position = p
            if relation and position:
                return f"발행회사와의 관계는 {relation}이며, 직위는 {position}입니다."
            elif relation:
                return f"발행회사와의 관계는 {relation}입니다."
            elif position:
                return f"직위는 {position}입니다."

        # 소유 상황 변동 내역 매칭
        is_owner_report = False
        keywords_to_check = ['보고사유', '변동일', '특정증권', '소유주식', '소 유 주 식', '취득/처분', '거래계획']
        if any(any(k in p.replace(" ", "") for k in keywords_to_check) for p in parts):
            is_owner_report = True
            
        reasons_list = ['신규선임', '장내매수', '장내처분', '장외매수', '장외처분', '증여', '상속', '주식배당', '무상증자', '사임', '퇴임', '합병']
        if len(parts) >= 4:
            is_date = bool(re.match(r"^\d{4}[./-]\d{1,2}[./-]\d{1,2}$", parts[1].strip()))
            is_reason = any(r in parts[0] for r in reasons_list)
            if is_date and (is_reason or '주' in parts[2] or '보통' in parts[2] or '우선' in parts[2]):
                is_owner_report = True
            
        if is_owner_report:
            # 5-1. 헤더 행인 경우 (텍스트 정제)
            if any('보고사유' in p or '변동일' in p for p in parts):
                cleaned_headers = []
                for p in parts:
                    hp = p.replace(" ", "").replace("*", "").strip()
                    if hp == '소유주식수(주)':
                        hp = '소유 주식 수(주)'
                    elif hp == '취득/처분단가(원)':
                        hp = '취득/처분 단가(원)'
                    cleaned_headers.append(hp)
                return "상세 소유 상황: " + " -> ".join(cleaned_headers) + " 순의 내역입니다."
            
            # 5-2. 실제 데이터 행인 경우
            reason = parts[0]
            date = parts[1] if len(parts) > 1 else ""
            sec_type = parts[2] if len(parts) > 2 else ""
            
            shares = ""
            price = ""
            for p in parts[3:]:
                clean_p = p.replace(",", "").strip()
                if re.match(r"^\d+$", clean_p):
                    if not shares:
                        shares = p
                    elif not price:
                        price = p
            
            if shares:
                shares_val = shares.replace(",", "").strip()
                shares_str = f" 보통주 {int(shares_val):,}주" if '보통' in sec_type else (f" 우선주 {int(shares_val):,}주" if '우선' in sec_type else f" {sec_type} {int(shares_val):,}주")
                if not sec_type or sec_type == "-":
                    shares_str = f" {int(shares_val):,}주"
                
                action_verb = "변동(취득/처분)"
                if any(k in reason for k in ['매수', '취득', '선임', '배당', '증자', '수탁']):
                    action_verb = "취득"
                elif any(k in reason for k in ['매도', '처분', '사임', '퇴임', '반환']):
                    action_verb = "처분"
                
                josa_reason = "으로" if reason.endswith("임") or reason.endswith("증자") or reason.endswith("배당") else "을 통해"
                
                price_str = ""
                if price and price != "-":
                    price_val = price.replace(",", "").strip()
                    try:
                        price_str = f" 주당 {int(price_val):,}원에"
                    except ValueError:
                        price_str = f" 주당 {price}원에"
                
                date_str = f"({date})" if date and date != "-" else ""
                return f"{reason}{date_str}{josa_reason}{shares_str}를{price_str} {action_verb}하였습니다."

        # 6. 정정신고(보고)의 정정사항 테이블 매칭
        # 컬럼 순서: 항목(0) | 정정요구(1) | 정정사유(2) | 정정 전(3) | 정정 후(4)
        if len(parts) >= 4 and parts[1].strip() in ['아니오', '예', '아니오 ', '예 ']:
            item_name = parts[0].strip()
            reason = parts[2].strip()
            
            # 정정대상 공시서류 추출 시도 (예: [기재정정]분기보고서 -> 분기보고서)
            report_name = getattr(self, 'current_report_nm', '')
            target_report = ""
            if report_name:
                target_report = report_name.replace('[기재정정]', '').replace('[정정]', '').strip()
                target_report = re.sub(r'\(.*?\)', '', target_report).strip()
            
            prefix = f"<{target_report}> " if target_report else ""
            return f"정정항목 : {prefix}{item_name} / 정정사유 : {reason}"

        # 7. 공통 테이블 자연어 변환
        if len(parts) == 3:
            p0, p1, p2 = parts[0], parts[1], parts[2]
            if p2 == '-' or not p2:
                return f"{p0}: {p1}"
            elif '대상종목' in p0:
                return f"{p0}: {p1} ({p2})"
            return f"{p0} ({p1}): {p2}"
        elif len(parts) == 2:
            return f"{parts[0]}: {parts[1]}"
            
        if len(parts) >= 4:
            # 4열 이상의 구조화된 표는 가독성이 떨어져 요약문에 부적합하므로 생략
            return ''
            
        joined_content = " : ".join(parts)
        return joined_content

    def clean_sentence(self, sentence: str) -> str:
        is_table = sentence.startswith("[테이블]")
        
        # 먼저 테이블 원시 텍스트를 자연어로 해석 및 변환
        sentence = self.format_raw_table_to_korean(sentence)

        # 파서를 거치고도 남아있는 | 구분자를 : 로 통일 (이중콜론 방지)
        sentence = re.sub(r'(?<!:)\s*\|\s*(?!:)', ': ', sentence)
        sentence = re.sub(r':\s+:', ':', sentence)

        sentence = re.sub(r'^[\s\-\*\※\■•▪]+', '', sentence)
        sentence = re.sub(r'^(?:\d{1,2}\.|\(\d{1,2}\)|\d{1,2}\))\s*', '', sentence)
        sentence = re.sub(r'\s+', ' ', sentence).strip()

        if not self.preserve_original_amounts:
            sentence = self._convert_large_amounts(sentence)

        limit = 320 if is_table else 200
        if len(sentence) > limit:
            sentence = sentence[:limit] + "..."

        if is_table:
            if not sentence.strip():
                return ''
            return f"▪ {sentence.strip()}"
        return sentence.strip()

    def _looks_like_address(self, text: str) -> bool:
        return bool(re.search(
            r'(?:서울|경기|인천|충북|충남|전북|전남|경북|경남|강원|제주|부산|대구|광주|대전|울산|세종)[가-힣]*\s+'
            r'[가-힣a-zA-Z0-9\s]+(?:시|군|구|읍|면|동|리|로|길)\s+\d+',
            text
        ))

    def _convert_large_amounts(self, sentence: str) -> str:
        def repl(match):
            num_str = match.group(1).replace(',', '')
            unit = match.group(2).strip()

            try:
                val = float(num_str)

                if unit == '원' and val >= 100_000_000:
                    return f"{val / 100_000_000:,.0f}억원"
                if unit == '백만원' and val >= 100:
                    return f"{val / 100:,.0f}억원"
            except Exception:
                return match.group(0)

            return match.group(0)

        return re.sub(self.amount_re, repl, sentence)
