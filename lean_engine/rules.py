import re
import logging
import warnings
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

        self.min_sentence_length = 10
        self.preserve_original_amounts = preserve_original_amounts

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
            tds = [td.get_text(separator=" ", strip=True) for td in tr.find_all(["td", "th", "table_data"])]
            if not tds:
                continue

            combined = " | ".join([t for t in tds if t])
            if combined:
                if len(combined) > 500:
                    combined = combined[:500] + "..."
                new_p = soup.new_tag("p")
                new_p.string = f"[테이블] {combined}"
                tr.replace_with(new_p)

        text = soup.get_text(separator="\n")
        text = re.sub(r"\n{2,}", "\n", text)
        return text.strip()

    def split_sentences(self, text: str) -> List[str]:
        candidates = []

        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue

            parts = re.split(
                r'(?<=[\.\?\!])\s+|(?<=다\.)\s+|(?<=니다\.)\s+|(?<=합니다\.)\s+',
                line
            )

            for p in parts:
                p = re.sub(r'\s+', ' ', p).strip()
                if not p:
                    continue

                if any(k in p for k in self.noise_keywords):
                    continue

                if self._looks_like_address(p):
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
            else:
                score += 1.0

        if any(k in sentence for k in ['전망', '예측', '추정', '시장 규모', 'CAGR']):
            score -= 4.0

        if any(k in sentence for k in ['전환가액', '신주인수권', '행사가액']) and perf_hits == 0:
            score -= 2.0

        if sentence.strip() in {'공시일자', '내용', '비고', '기준', '일자', '구분', '목적', '항목'}:
            score -= 5.0

        if not any(ch.isdigit() for ch in sentence):
            if perf_hits == 0 and action_hits == 0 and risk_hits == 0:
                score -= 2.0

        pos_ratio = sent_order / max(total_sents, 1)
        if pos_ratio < 0.1:
            score += 1.0

        if len(sentence) > 300:
            score -= 2.0

        if self.empty_bracket_re.search(sentence):
            score -= 1.5

        return round(min(score, 30.0), 4)

    def clean_sentence(self, sentence: str) -> str:
        sentence = re.sub(r'^[\s\-\*\※\■•]+', '', sentence)
        sentence = re.sub(r'^(?:\d{1,2}\.|\(\d{1,2}\)|\d{1,2}\))\s*', '', sentence)
        sentence = re.sub(r'\s+', ' ', sentence).strip()

        if not self.preserve_original_amounts:
            sentence = self._convert_large_amounts(sentence)

        limit = 320 if sentence.startswith("[테이블]") else 200
        if len(sentence) > limit:
            sentence = sentence[:limit] + "..."

        return sentence.strip()

    def _looks_like_address(self, text: str) -> bool:
        return bool(re.search(
            r'(?:서울|경기|인천|충북|충남|전북|전남|경북|경남|강원|제주|부산|대구|광주|대전|울산|세종)\s+'
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
