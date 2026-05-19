import re
import logging
import warnings
from bs4 import BeautifulSoup, XMLParsedAsHTMLWarning

warnings.filterwarnings("ignore", category=XMLParsedAsHTMLWarning)

logger = logging.getLogger(__name__)


METRIC_MAP = {
    "매출액": "revenue",
    "영업수익": "revenue",
    "수익(매출액)": "revenue",
    "영업이익": "operating_profit",
    "영업손실": "operating_profit",
    "영업이익(손실)": "operating_profit",
    "영업손실(이익)": "operating_profit",
    "영업손익": "operating_profit",
    "당기순이익": "net_income",
    "당기순손실": "net_income",
    "당기순이익(손실)": "net_income",
    "당기순손실(이익)": "net_income",
    "당기순손익": "net_income",
    "분기순이익": "net_income",
    "분기순이익(손실)": "net_income",
    "반기순이익": "net_income",
    "반기순이익(손실)": "net_income",
    "연결당기순이익": "net_income",
    "연결당기순손실": "net_income",
    "연결당기순이익(손실)": "net_income",
    "자산총계": "total_assets",
    "부채총계": "total_liabilities",
    "자본총계": "total_equity",
    "영업활동현금흐름": "operating_cf",
}

XML_TAG_MAP = {
    "Revenue": "revenue",
    "GrossProfit": "gross_profit",
    "ProfitLossFromOperatingActivities": "operating_profit",
    "OperatingIncomeLoss": "operating_profit",
    "ProfitLoss": "net_income",
    "Assets": "total_assets",
    "Liabilities": "total_liabilities",
    "Equity": "total_equity",
}

NUM_RE = re.compile(r"-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d{4,}(?:\.\d+)?")
UNIT_RE = re.compile(r"단위\s*[:：]\s*(조원|억원|백만원|천만원|천원|원)")
KNOWN_UNITS = ["조원", "억원", "백만원", "천만원", "천원", "원"]


def infer_period_label(report_nm: str, rcept_dt: str):
    year = (rcept_dt or "")[:4]
    if not year.isdigit():
        year = "0000"

    nm = report_nm or ""
    if "1분기" in nm or "Q1" in nm or ".03" in nm or "3월" in nm:
        return f"{year}Q1", "quarterly"
    if "3분기" in nm or "Q3" in nm or ".09" in nm or "9월" in nm:
        return f"{year}Q3", "quarterly"
    if "반기" in nm or "H1" in nm or ".06" in nm or "6월" in nm:
        return f"{year}H1", "half"
    if "사업보고서" in nm or "연간" in nm or "FY" in nm or "4분기" in nm or ".12" in nm or "12월" in nm:
        return f"{year}FY", "annual"

    month = (rcept_dt or "")[4:6]
    if month.isdigit():
        m = int(month)
        if 4 <= m <= 6:
            return f"{year}Q1", "quarterly"
        if 7 <= m <= 9:
            return f"{year}H1", "half"
        if 10 <= m <= 12:
            return f"{year}Q3", "quarterly"
        if 1 <= m <= 3:
            return f"{str(int(year)-1)}FY", "annual"

    if "분기보고서" in nm:
        return f"{year}Q1", "quarterly"

    return f"{year}UNK", "unknown"


def parse_unit_to_million(value_text: str, unit_hint: str = "", explicit_unit: bool = False):
    txt = (value_text or "").replace(",", "").strip()
    if not txt:
        return None

    # 괄호, 음수 기호, △/▲ 기호는 음수(-)로 처리
    is_negative = False
    if (txt.startswith("(") and txt.endswith(")")) or (txt.startswith("（") and txt.endswith("）")):
        is_negative = True
        txt = txt.strip("()（）")
    elif txt.startswith("△") or txt.startswith("▲") or txt.startswith("-"):
        is_negative = True
        txt = txt.lstrip("△▲-")

    m = re.search(r"-?\d+(?:\.\d+)?", txt)
    if not m:
        return None

    val = float(m.group(0))
    if is_negative:
        val = -val

    # 단위 힌트가 "백만원" 또는 "억원"으로 명시/암묵 감지되었으나 수치가 1천만 이상으로 지나치게 큰 경우,
    # 이는 단위 감지 오류(실제는 원 단위임)로 판정하고 원(KRW) 단위로 강제 간주하여 처리합니다.
    # 단, "천원" 또는 "원" 단위인 경우는 대형 수치가 정상 범위이므로 감지 결과를 전적으로 신뢰합니다.
    is_misdetected_million_unit = (unit_hint in ("백만원", "억원")) and abs(val) >= 10_000_000
    is_no_hint_but_large = (not explicit_unit or not unit_hint) and abs(val) >= 10_000_000

    if is_misdetected_million_unit or is_no_hint_but_large:
        return val / 1_000_000

    if explicit_unit:
        if unit_hint == "조원":
            return val * 1_000_000
        if unit_hint == "억원":
            return val * 100
        if unit_hint == "천만원":
            return val * 10
        if unit_hint == "백만원":
            return val
        if unit_hint == "천원":
            return val / 1_000
        if unit_hint == "원":
            return val / 1_000_000

    combined = f" {value_text} {unit_hint} "

    if "조원" in combined:
        return val * 1_000_000
    if "억원" in combined:
        return val * 100
    if "천만원" in combined:
        return val * 10
    if "백만원" in combined:
        return val
    if "천원" in combined:
        return val / 1_000
    if re.search(r"(?<![가-힣])원(?![가-힣])", combined):
        return val / 1_000_000

    if abs(val) >= 50_000_000:
        return val / 1_000_000

    return val


class FinancialExtractor:
    FINANCIAL_REPORT_KEYWORDS = {
        "분기보고서",
        "반기보고서",
        "사업보고서",
        "감사보고서",
        "연결재무제표"
    }

    NON_FINANCIAL_REPORT_KEYWORDS = {
        "기타시장안내",
        "투자설명서",
        "정정신고",
        "정정요구",
        "회생절차",
        "주요사항보고서(회생절차개시신청)",
        "합병등종료보고서",
    }

    NOISE_TABLE_KEYWORDS = {
        "정정 전",
        "정정 후",
        "정정사유",
        "투자위험등급",
        "판매회사",
        "효력발생일",
        "투자결정시 유의사항",
        "분배금 지급에 관한 사항",
        "시장조성",
        "중요한 회계정책",
        "회계정책의",
        "회계정책은",
        "회계정책에",
        "회계기준에 따라"
    }

    def should_run_financial_extractor(self, report_nm: str, raw_xml: str) -> bool:
        rn = self._normalize_text(report_nm)
        if any(self._normalize_text(k) in rn for k in self.NON_FINANCIAL_REPORT_KEYWORDS):
            return False
        if any(self._normalize_text(k) in rn for k in self.FINANCIAL_REPORT_KEYWORDS):
            return True

        m = re.search(r"<DOCUMENT-NAME[^>]*>(.*?)</DOCUMENT-NAME>", raw_xml, re.IGNORECASE | re.DOTALL)
        if m:
            doc_name = self._normalize_text(m.group(1))
            if any(self._normalize_text(k) in doc_name for k in self.NON_FINANCIAL_REPORT_KEYWORDS):
                return False
            if any(self._normalize_text(k) in doc_name for k in self.FINANCIAL_REPORT_KEYWORDS):
                return True

        return False

    def extract(self, content, corp_code: str, period_label: str, period_type: str, report_nm: str = ""):
        raw = content.decode("utf-8", errors="ignore") if isinstance(content, bytes) else str(content)

        if not self.should_run_financial_extractor(report_nm, raw):
            logger.debug("skip financial extractor by report_nm=%s", report_nm)
            return []

        html_results = self._parse_html_table(raw, corp_code, period_label, period_type)
        if html_results:
            return html_results

        xml_results = self._try_xml_style(raw, corp_code, period_label, period_type)
        return xml_results


    def _extract_markup_from_document_xml(self, raw: str) -> str:
        raw = raw or ""
        raw_strip = raw.lstrip()
        logger.debug("[_extract_markup] raw length: %s, starts with <?xml: %s", len(raw), raw_strip.startswith("<?xml"))

        if not raw_strip.startswith("<?xml"):
            return raw
        try:
            # DART XML 파일들은 &nbsp; 등 비표준 XML 엔티티를 포함하여 XML 파서가 조기 중단(Truncate)되는 문제가 발생합니다.
            # 따라서 항상 100% 안전하고 강인한 내장 html.parser 대신 초고속 C 파서인 lxml을 적용합니다.
            xml_soup = BeautifulSoup(raw, "lxml")
            logger.debug("[_extract_markup] parser used: lxml")

            for tag_name in ["DOCUMENT", "document", "TEXT", "text", "BODY", "body", "SECTION", "section"]:
                nodes = xml_soup.find_all(tag_name)
                if nodes:
                    logger.debug("[_extract_markup] tag_name %s has %s nodes", tag_name, len(nodes))
                for node in nodes:
                    inner = "".join(str(x) for x in node.contents).strip()
                    logger.debug("[_extract_markup] tag_name: %s, inner length: %s", tag_name, len(inner))
                    if "<table" in inner or "<tr" in inner or "<td" in inner or "&lt;table" in inner:
                        logger.debug("[_extract_markup] matched table keywords in inner of %s! returning unescaped inner", tag_name)
                        import html
                        return html.unescape(inner)

            logger.debug("[_extract_markup] no tags matched table keywords. returning str(xml_soup) (length: %s)", len(str(xml_soup)))
            return str(xml_soup)
        except Exception as e:
            logger.debug("document.xml 본문 추출 실패: %s", e)
            return raw

    def _parse_html_table(self, raw: str, corp_code: str, period_label: str, period_type: str):
        markup = self._extract_markup_from_document_xml(raw)
        logger.debug("markup head=%s", markup[:500])
        logger.debug("table count=%s", len(BeautifulSoup(markup, "lxml").find_all("table")))

        soup = BeautifulSoup(markup, "lxml")
        found = {}

        full_text = soup.get_text(" ", strip=True)
        global_unit_hint, global_explicit = self._detect_unit_hint(full_text[:150000])

        target_tables = self._select_target_tables(soup)
        logger.debug("selected target tables: %s", [(t[0], t[4]) for t in target_tables])

        for table_idx, table, matrix, table_text, table_score in target_tables:
            prev_text = ""
            sibling_count = 0
            for sibling in table.previous_siblings:
                sibling_text = sibling.get_text(" ", strip=True) if hasattr(sibling, "get_text") else str(sibling)
                prev_text = sibling_text + " " + prev_text
                sibling_count += 1
                if sibling_count >= 15 or len(prev_text) >= 3000:
                    break
            local_context = prev_text[-3000:] + " " + table_text[:1500]

            local_unit_hint, local_explicit = self._detect_unit_hint(local_context)
            if not local_unit_hint:
                local_unit_hint = global_unit_hint
                local_explicit = global_explicit

            target_col_idx = self._detect_target_value_col(matrix, period_label, period_type)

            logger.debug(
                "table[%s] score=%s unit_hint=%s explicit=%s target_col_idx=%s header_preview=%s",
                table_idx,
                table_score,
                local_unit_hint,
                local_explicit,
                target_col_idx,
                " | ".join(matrix[0][:6])[:200] if matrix else ""
            )

            for row_idx, cells in enumerate(matrix):
                if len(cells) < 2:
                    continue

                row_joined = " ".join(cells)
                if len(row_joined) > 250:
                    continue

                label_cell = self._normalize_text(cells[0])
                if not label_cell:
                    continue

                metric_name = self._match_metric(label_cell)
                if not metric_name:
                    continue

                value_text = self._pick_value_by_target_col(cells, target_col_idx)
                if not value_text:
                    continue

                value = parse_unit_to_million(
                    value_text=value_text,
                    unit_hint=local_unit_hint,
                    explicit_unit=local_explicit
                )
                if value is None:
                    continue

                if metric_name in ("operating_profit", "net_income") and "손실" in label_cell and "이익" not in label_cell and value > 0:
                    value = -value

                raw_row_text = " | ".join(cells)[:300]

                if not self._passes_metric_floor(metric_name, value):
                    logger.debug(
                        "metric rejected by floor: table=%s row=%s metric=%s value=%s raw=%s",
                        table_idx, row_idx, metric_name, value, raw_row_text
                    )
                    continue

                logger.debug(
                    "metric row matched: table=%s row=%s metric=%s label=%s col_idx=%s value_text=%s unit=%s explicit=%s parsed=%s",
                    table_idx,
                    row_idx,
                    metric_name,
                    label_cell[:80],
                    target_col_idx,
                    value_text,
                    local_unit_hint,
                    local_explicit,
                    value
                )

                candidate = {
                    "corp_code": corp_code,
                    "period_label": period_label,
                    "period_type": period_type,
                    "metric_name": metric_name,
                    "metric_value": value,
                    "raw_text": raw_row_text,
                    "_table_score": table_score,
                    "_table_idx": table_idx
                }

                current = found.get(metric_name)
                if current is None or self._is_better_candidate(candidate, current):
                    found[metric_name] = candidate

        cleaned = []
        for item in found.values():
            item.pop("_table_score", None)
            item.pop("_table_idx", None)
            cleaned.append(item)

        return cleaned

    def _try_xml_style(self, raw: str, corp_code: str, period_label: str, period_type: str):
        soup = BeautifulSoup(raw, "xml")
        found = {}

        unit_hint, explicit_unit = self._detect_unit_hint(raw[:10000])

        for tag in soup.find_all():
            name = tag.name or ""
            local_name = name.split(":")[-1]

            if local_name not in XML_TAG_MAP:
                continue

            text = (tag.text or "").strip()
            if not text:
                continue

            value = parse_unit_to_million(
                value_text=text,
                unit_hint=unit_hint,
                explicit_unit=explicit_unit
            )
            if value is None:
                continue

            metric_name = XML_TAG_MAP[local_name]

            if metric_name not in found:
                found[metric_name] = {
                    "corp_code": corp_code,
                    "period_label": period_label,
                    "period_type": period_type,
                    "metric_name": metric_name,
                    "metric_value": value,
                    "raw_text": text[:300]
                }

        return list(found.values())

    def _is_noise_table(self, table_text: str):
        text = self._normalize_text(table_text[:3000])

        if any(self._normalize_text(k) in text for k in self.NOISE_TABLE_KEYWORDS):
            return True

        if "정정전" in text and "정정후" in text:
            return True

        if "투자위험등급" in text:
            return True

        if "판매회사" in text and "효력발생일" in text:
            return True

        return False

    def _select_target_tables(self, soup):
        candidates = []

        for idx, table in enumerate(soup.find_all("table")):
            table_text = table.get_text(" ", strip=True)

            if self._is_noise_table(table_text):
                logger.debug("table[%s] skipped by noise table rule preview=%s", idx, table_text[:200])
                continue

            # 재무제표 핵심 키워드가 전혀 잡히지 않는 비재무 테이블(직원/주주 현황 등 95%의 테이블)은 matrix 생성을 생략하고 사전 스킵합니다.
            priority = self._table_priority(table_text)
            if priority <= 0:
                continue

            rows = table.find_all("tr")
            matrix = []
            for tr in rows:
                cells = [cell.get_text(" ", strip=True) for cell in tr.find_all(["th", "td"])]
                cells = [c for c in cells if c]
                if cells:
                    matrix.append(cells)

            if not matrix:
                continue

            if self._is_numeric_noise_table(matrix):
                continue

            score = self._score_financial_table(matrix, table_text)

            logger.debug(
                "table[%s] financialtablescore=%s preview=%s",
                idx, score, table_text[:200]
            )

            if score >= 3:
                candidates.append((idx, table, matrix, table_text, score))

        candidates.sort(key=lambda x: x[4], reverse=True)
        return candidates[:8]

    def _table_priority(self, text: str) -> int:
        t = text.replace("\xa0", " ").strip()
        t_normalized = self._normalize_text(text)

        hard_skip = [
            "종속기업 및 관계기업",
            "중요한 회계정책",
            "회계정책",
            "공정가치 서열체계",
            "비교표시된 전기",
            "별도재무제표",
        ]
        if any(x in t or self._normalize_text(x) in t_normalized for x in hard_skip):
            return -100

        if "자산총계" in t_normalized and "부채총계" in t_normalized and "자본총계" in t_normalized:
            return 120
        if "매출액" in t_normalized and "영업이익" in t_normalized:
            return 115
        if "현금및현금성자산" in t_normalized and "매출채권및기타채권" in t_normalized:
            return 110
        if "매입채무및기타채무" in t_normalized or "단기차입금" in t_normalized:
            return 100
        if "리스부채" in t_normalized or "충당부채" in t_normalized:
            return 95
        if "기타수익" in t_normalized or "비용의성격별분류" in t_normalized:
            return 90

        return 0

    def _score_financial_table(self, matrix, table_text: str):
        text = self._normalize_text(table_text[:4000])
        score = self._table_priority(table_text)

        header_zone = " ".join([" | ".join(r[:6]) for r in matrix[:5]])
        header_zone = self._normalize_text(header_zone)

        balance_keywords = [
            ["자산총계", "자산총계", "자산합계", "자산의합계"],
            ["부채총계", "부채총계", "부채합계", "부채의합계"],
            ["자본총계", "자본총계", "자본합계", "자본의합계", "순자산"]
        ]
        balance_hits = sum(1 for keys in balance_keywords if any(k in text for k in keys))

        income_keywords = [
            ["매출액", "매출", "영업수익", "수익(매출액)", "수익"],
            ["영업이익", "영업손실", "영업손익", "영업이익(손실)", "영업손실(이익)"],
            ["당기순이익", "당기순손실", "분기순이익", "분기순손실", "반기순이익", "반기순손실", "연결당기순이익", "연결당기순손실", "당기순이익(손실)", "분기순이익(손실)", "반기순이익(손실)"]
        ]
        income_hits = sum(1 for keys in income_keywords if any(k in text for k in keys))

        flow_hits = sum(1 for k in ["영업활동현금흐름", "투자활동현금흐름", "재무활동현금흐름"] if k in text)

        if any(k in header_zone for k in ["구분", "과목", "항목"]):
            score += 2
        if any(k in header_zone for k in ["당기", "전기", "1분기", "반기", "3분기", "사업연도"]):
            score += 2

        score += balance_hits * 4
        score += income_hits * 4
        score += flow_hits * 2

        if "당분기" in text:
            score += 2
        if "전기말" in text or "전분기" in text:
            score += 1
        if "구분" in text or "구분" in text:
            score += 1

        bad_keywords = [
            "사업부", "세그먼트", "관계기업", "종속기업", "연결조정",
            "재작성", "수정반영", "수정전", "수정후", "비교표시",
            "지분율", "소재지", "주주", "임원", "이사회",
            "보고부문", "영업부문", "보상", "스톡옵션"
        ]
        for k in bad_keywords:
            if k in text:
                score -= 3

        bad_terms = [
            "종속기업", "관계기업", "회계정책", "원가법", "지분법",
            "비교표시된전기", "중요한회계정책", "공정가치서열체계",
            "기업회계기준서", "회계처리하였습니다"
        ]
        if any(self._normalize_text(x) in text for x in bad_terms):
            score -= 30

        if len(matrix) < 4:
            score -= 1
        if len(text) > 3000:
            score -= 1

        if balance_hits == 0 and income_hits < 1 and flow_hits == 0:
            score -= 3

        return score

    def _is_numeric_noise_table(self, matrix):
        rows = len(matrix)
        if rows < 3:
            return True

        cells = [c for row in matrix for c in row]
        if not cells:
            return True

        numeric_cells = 0
        alpha_cells = 0

        for c in cells:
            if re.search(r"[A-Za-z가-힣]", c):
                alpha_cells += 1
            if re.search(r"\d", c):
                numeric_cells += 1

        total = len(cells)
        numeric_ratio = numeric_cells / total
        alpha_ratio = alpha_cells / total

        return numeric_ratio > 0.8 and alpha_ratio < 0.2

    def _detect_target_value_col(self, matrix, period_label: str, period_type: str):
        header_candidates = matrix[:5]
        best_idx = None
        best_score = -1

        target_tokens = self._build_target_tokens(period_label, period_type)

        for row in header_candidates:
            if len(" ".join(row)) > 300:
                continue

            for idx, cell in enumerate(row):
                cell_norm = self._normalize_text(cell)
                if idx == 0:
                    continue
                if not cell_norm or len(cell_norm) > 80:
                    continue

                score = 0

                if any(token in cell_norm for token in target_tokens):
                    score += 5

                if any(k in cell_norm for k in ["당기", "당분기", "당반기", "1분기"]):
                    score += 3

                if any(k in cell_norm for k in ["전기", "전분기", "전반기", "전년동기"]):
                    score -= 2

                if NUM_RE.search(cell_norm):
                    score += 1

                if score > best_score:
                    best_score = score
                    best_idx = idx

        if best_idx is not None and best_score > 0:
            return best_idx

        return 1

    def _build_target_tokens(self, period_label: str, period_type: str):
        tokens = []

        if period_label.endswith("Q1"):
            year = period_label[:4]
            tokens.extend([
                f"{year}년1분기",
                f"{year}.01.01~{year}.03.31",
                f"{year}.1분기",
                "1분기",
                "당분기",
            ])
        elif period_label.endswith("H1"):
            year = period_label[:4]
            tokens.extend([f"{year}년반기", "반기", "당반기"])
        elif period_label.endswith("Q3"):
            year = period_label[:4]
            tokens.extend([f"{year}년3분기", "3분기", "당분기"])
        elif period_label.endswith("FY"):
            year = period_label[:4]
            tokens.extend([f"{year}년", "사업연도", "당기"])

        return [self._normalize_text(t) for t in tokens if t]

    def _pick_value_by_target_col(self, cells, target_col_idx: int):
        if target_col_idx is not None and 0 < target_col_idx < len(cells):
            cell_val = cells[target_col_idx].strip()
            if NUM_RE.search(cell_val):
                return cell_val

        for idx, cell in enumerate(cells):
            if idx == 0:
                continue
            cell_val = cell.strip()
            if NUM_RE.search(cell_val):
                return cell_val

        return None

    def _detect_unit_hint(self, text: str):
        text = text or ""
        m = UNIT_RE.search(text)
        if m:
            return m.group(1), True

        for unit in KNOWN_UNITS:
            if unit in text:
                return unit, False

        return "", False

    def _match_metric(self, label_cell: str):
        normalized = self._normalize_text(label_cell)
        
        # 로마자(Ⅰ, Ⅱ 등), 숫자(1, 2 등), 원숫자, 기호 접두사 제거
        cleaned = re.sub(r"^[0-9ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ\-\.\,\s가나다라마바사아자차카타파하▪•*·◆◇▶▷■□▲▼\(\)\[\]]*\.?", "", normalized)

        for label, metric_name in METRIC_MAP.items():
            norm_label = self._normalize_text(label)
            if cleaned == norm_label:
                return metric_name
            if cleaned.startswith(norm_label):
                tail = cleaned[len(norm_label):]
                if tail in ("", "(연결)", "(별도)", "(손실)", "(연결손실)", "(별도손실)", "(지배)", "(비지배)", "연결", "별도", "손실", "연결손실", "별도손실", "지배", "비지배"):
                    return metric_name
        return None

    def _passes_metric_floor(self, metric_name: str, value: float):
        if value is None:
            return False

        abs_val = abs(value)

        if metric_name == "revenue" and abs_val < 1:
            return False
        if metric_name in ("operating_profit", "net_income") and 0 < abs_val < 0.1:
            return False
        if metric_name == "operating_cf" and abs_val < 0.1:
            return False

        return True

    def _normalize_text(self, text: str):
        return re.sub(r"\s+", "", text or "")

    def _is_better_candidate(self, candidate: dict, current: dict):
        cand_text = candidate.get("raw_text", "")
        curr_text = current.get("raw_text", "")
        cand_val = candidate.get("metric_value")
        curr_val = current.get("metric_value")
        cand_table_score = candidate.get("_table_score", 0)
        curr_table_score = current.get("_table_score", 0)

        if cand_table_score != curr_table_score:
            return cand_table_score > curr_table_score

        preferred = ["매출액", "영업이익", "당기순이익", "자산총계", "부채총계", "자본총계"]
        cand_score = sum(2 for k in preferred if k in cand_text)
        curr_score = sum(2 for k in preferred if k in curr_text)

        if cand_score != curr_score:
            return cand_score > curr_score

        if len(cand_text) != len(curr_text):
            return len(cand_text) < len(curr_text)

        if cand_val is None:
            return False
        if curr_val is None:
            return True

        return abs(cand_val) > abs(curr_val)
