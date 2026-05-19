import os
import re
import io
import json
import time
import zipfile
import sqlite3
import logging
import requests
import datetime
from functools import wraps
from difflib import SequenceMatcher
from dotenv import load_dotenv

from rules import SummaryRuleEngine
from financial_extractor import FinancialExtractor, infer_period_label


logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger(__name__)


base_dir = os.path.dirname(os.path.dirname(__file__)) if "__file__" in globals() else os.getcwd()
env_path = os.path.join(base_dir, ".env")
if os.path.exists(env_path):
    load_dotenv(env_path)

DB_PATH = os.path.join(base_dir, "lean_engine.db")
SCHEMA_PATH = os.path.join(os.path.dirname(__file__), "schema.sql")


def retry_on_exception(max_retries=3, delay=1.0):
    def deco(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            attempt = 0
            while True:
                try:
                    return fn(*args, **kwargs)
                except Exception as e:
                    attempt += 1
                    if attempt > max_retries:
                        logger.error("Retry failed after %s attempts: %s", attempt - 1, e)
                        raise
                    logger.warning("Retry %s/%s after error: %s", attempt, max_retries, e)
                    time.sleep(delay * attempt)
        return wrapper
    return deco


class DartLeanEngine:
    def __init__(self):
        self.api_key = os.getenv("DART_API_KEY")
        if not self.api_key:
            raise ValueError("DART_API_KEY is not set")

        self.base_url = "https://opendart.fss.or.kr/api"
        self.rule_engine = SummaryRuleEngine()
        self.financial_extractor = FinancialExtractor()
        self._init_db()

    def _init_db(self):
        self.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        self.conn.execute("PRAGMA foreign_keys = ON;")
        self.conn.execute("PRAGMA journal_mode = WAL;")
        self.conn.execute("PRAGMA synchronous = NORMAL;")

        if os.path.exists(SCHEMA_PATH):
            with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
                self.conn.executescript(f.read())

        self.conn.commit()

    def close(self):
        try:
            self.conn.close()
            logger.info("DB connection closed.")
        except Exception as e:
            logger.warning("DB close warning: %s", e)

    def run_pipeline(self, corp_code: str = None, bgn_de: str = None, end_de: str = None):
        logger.info("[%s] 공시 수집 시작...", corp_code or "전체")
        filings = self._fetch_filing_list(corp_code, bgn_de, end_de)
        logger.info("처리 대상: %s건", len(filings))

        for filing in filings:
            rcept_no = filing.get("rcept_no")
            if not rcept_no:
                continue

            if self._is_already_processed(rcept_no):
                logger.debug("[%s] 이미 처리됨", rcept_no)
                continue

            try:
                logger.info("[%s] %s 처리 중...", rcept_no, filing.get("report_nm"))

                raw_content, raw_text = self._download_and_parse(rcept_no)
                if not raw_text:
                    logger.warning("[%s] raw_text 비어 있음", rcept_no)
                    continue

                is_periodic = self._is_periodic_report(filing.get("report_nm", ""))
                metrics = []
                period_label, period_type = None, None

                if is_periodic:
                    period_label, period_type = infer_period_label(
                        filing.get("report_nm", ""),
                        filing.get("rcept_dt", "")
                    )
                    metrics = self.financial_extractor.extract(
                        content=raw_content,
                        corp_code=filing.get("corp_code"),
                        period_label=period_label,
                        period_type=period_type,
                        report_nm=filing.get("report_nm", "")
                    )
                else:
                    logger.debug("[%s] skip financial extractor by report_nm=%s", rcept_no, filing.get("report_nm", ""))

                sentences = self.rule_engine.split_sentences(raw_text)
                scored_sentences = [
                    {
                        "order": i,
                        "content": s,
                        "score": self.rule_engine.score_sentence(s, i, len(sentences))
                    }
                    for i, s in enumerate(sentences)
                ]

                summary_text, top_ids_json = self._build_summary(
                    scored_sentences=scored_sentences,
                    report_nm=filing.get("report_nm", ""),
                    metrics=metrics,
                    corp_code=filing.get("corp_code"),
                    period_label=period_label,
                    corp_name=filing.get("corp_name", "")
                )

                self._save_to_db(
                    filing=filing,
                    raw_text=raw_text,
                    scored_sentences=scored_sentences,
                    summary_text=summary_text,
                    top_ids_json=top_ids_json,
                    metrics=metrics
                )

            except Exception as e:
                logger.exception("[%s] 처리 실패: %s", rcept_no, e)

        logger.info("파이프라인 실행 완료.")

    def _build_summary(
        self,
        scored_sentences,
        report_nm: str,
        metrics: list,
        corp_code: str = None,
        period_label: str = None,
        corp_name: str = ""
    ):
        display_name = (corp_name or "").strip() or "해당 기업"
        report_nm_clean = (report_nm or "").strip()

        # 1. 정기보고서 (Lean Mode)
        if self._is_periodic_report(report_nm_clean):
            header = self._build_kpi_header(
                report_nm=report_nm_clean,
                metrics=metrics,
                corp_code=corp_code,
                period_label=period_label,
                corp_name=display_name
            )
            if header:
                body = self._build_periodic_notice(report_nm_clean, metrics)
                return (header + "\n\n" + body).strip(), "[]"
            else:
                report_type = "정기"
                if "분기보고서" in report_nm_clean:
                    report_type = "분기"
                elif "반기보고서" in report_nm_clean:
                    report_type = "반기"
                elif "사업보고서" in report_nm_clean:
                    report_type = "사업(연간)"
                
                header = f"📢 **{display_name}** - {report_type} 보고서가 공시되었습니다."
                body = "💡 현재 자동 추출된 실적 수치를 재검증 중입니다. 자세한 내용은 상단의 '상세보기'를 눌러 보고서 본문을 함께 확인해 주세요."
                return (header + "\n\n" + body).strip(), "[]"

        # 2. 그 외 공시 (Quick Mode)
        valid_sentences = [s for s in scored_sentences if s["score"] > 0]
        if not valid_sentences:
            fallback_header = self._build_quick_header(display_name, report_nm_clean)
            return f"{fallback_header}\n\n이 공시는 정형 표 형식이 많거나 개별 조건 확인이 중요해 원문 확인이 필요합니다.", "[]"

        valid_sentences.sort(key=lambda x: x["score"], reverse=True)
        candidates = valid_sentences[:20]

        def is_similar(a, b):
            nums_a = re.findall(r'[\d,]+(?:\.\d+)?', a)
            nums_b = re.findall(r'[\d,]+(?:\.\d+)?', b)
            if nums_a != nums_b:
                return False
            return SequenceMatcher(None, a, b).ratio() > 0.78

        unique = []
        for s in candidates:
            if not any(is_similar(s["content"], u["content"]) for u in unique):
                unique.append(s)

        top_n = unique[:3]
        top_n.sort(key=lambda x: x["order"])

        cleaned = []
        for s in top_n:
            c = self.rule_engine.clean_sentence(s["content"])
            if c and len(c.strip()) >= 8:
                cleaned.append(f"- {c}")

        if not cleaned:
            fallback_header = self._build_quick_header(display_name, report_nm_clean)
            return f"{fallback_header}\n\n이 공시는 정형 표 형식이 많거나 개별 조건 확인이 중요해 원문 확인이 필요합니다.", "[]"

        body = "\n".join(cleaned)
        header = self._build_quick_header(display_name, report_nm_clean)
        return (header + "\n\n" + body).strip(), json.dumps([s["order"] for s in top_n], ensure_ascii=False)

    def _build_quick_header(self, corp_name: str, report_nm: str) -> str:
        rn = (report_nm or "").strip()
        if "정정" in rn:
            return f"{corp_name} - 정정 공시 안내"
        if "기타시장안내" in rn or "거래정지" in rn or "상장폐지" in rn:
            return f"{corp_name} - 시장조치 관련 안내"
        if "기업설명회" in rn or "IR" in rn:
            return f"{corp_name} - 기업설명회(IR) 안내"
        return f"{corp_name} - {rn} 요약 정보"

    def _build_periodic_notice(self, report_nm: str, metrics: list) -> str:
        is_revised = "정정" in (report_nm or "")
        metric_map = {m.get("metric_name"): m.get("metric_value") for m in metrics if m.get("metric_name")}
        has_all_metrics = all(metric_map.get(k) is not None for k in ("revenue", "operating_profit", "net_income"))

        if is_revised or not has_all_metrics:
            return "💡 자동 분석 결과가 일부 어색할 수 있어요. 중요한 내용은 상단의 '상세보기'에서 보고서 본문을 함께 확인해 주세요."

        return "💡 자세한 재무제표와 주석은 상단의 '상세보기'에서 보고서 원문으로 확인해 주세요."

    def _build_kpi_header(
        self,
        report_nm: str,
        metrics: list,
        corp_code: str = None,
        period_label: str = None,
        corp_name: str = ""
    ) -> str:
        if not self._is_periodic_report(report_nm):
            return ""

        metric_map = {m.get("metric_name"): m.get("metric_value") for m in metrics if m.get("metric_name")}

        rev = metric_map.get("revenue")
        op = metric_map.get("operating_profit")
        ni = metric_map.get("net_income")

        if (rev is None or rev == 0) and (op is None or op == 0) and (ni is None or ni == 0):
            return ""

        if rev is not None and rev != 0:
            if op is not None:
                if op > 0 and op > abs(rev) * 2.0:
                    logger.warning("Sanity Check 실패: 영업이익(%s)이 매출액(%s) 대비 비정상적으로 큼. 헤더 비노출 처리.", op, rev)
                    return ""
                elif op < 0 and abs(op) > abs(rev) * 100.0:
                    logger.warning("Sanity Check 실패: 영업손실(%s)이 매출액(%s) 대비 극단적으로 큼. 헤더 비노출 처리.", op, rev)
                    return ""

            if ni is not None:
                if ni > 0 and ni > abs(rev) * 2.0:
                    logger.warning("Sanity Check 실패: 순이익(%s)이 매출액(%s) 대비 비정상적으로 큼. 헤더 비노출 처리.", ni, rev)
                    return ""
                elif ni < 0 and abs(ni) > abs(rev) * 100.0:
                    logger.warning("Sanity Check 실패: 당기순손실(%s)이 매출액(%s) 대비 극단적으로 큼. 헤더 비노출 처리.", ni, rev)
                    return ""

        report_type = "정기"
        if "분기보고서" in (report_nm or ""):
            report_type = "분기"
        elif "반기보고서" in (report_nm or ""):
            report_type = "반기"
        elif "사업보고서" in (report_nm or ""):
            report_type = "사업(연간)"

        display_name = (corp_name or "").strip() or "해당 기업"

        lines = [f"**{display_name}** - {report_type} 보고서가 공시되었습니다.", ""]

        display_order = [
            ("revenue", "매출"),
            ("operating_profit", "영업이익"),
            ("net_income", "순이익"),
        ]

        for key, label in display_order:
            value = metric_map.get(key)
            if value is None:
                continue
            lines.append(f"▪ {label} {self._format_korean_amount(value)}")

        return "\n".join(lines)

    def _is_periodic_report(self, report_nm: str) -> bool:
        report_nm = (report_nm or "").strip()
        return report_nm.startswith(("사업보고서", "반기보고서", "분기보고서"))

    def _format_korean_amount(self, value_in_million) -> str:
        try:
            v = float(value_in_million)
        except Exception:
            return str(value_in_million)

        sign = "-" if v < 0 else ""
        n = abs(v)

        if n >= 1_000_000:
            return f"{sign}{n / 1_000_000:.2f}조원"
        if n >= 100:
            return f"{sign}{n / 100:.2f}억원"
        return f"{sign}{n:.2f}백만원"

    @retry_on_exception(max_retries=3, delay=1.0)
    def _fetch_filing_list(self, corp_code, bgn_de, end_de):
        url = f"{self.base_url}/list.json"
        all_filings = []
        page = 1
        max_pages = 50

        while True:
            params = {
                "crtfc_key": self.api_key,
                "bgn_de": bgn_de,
                "end_de": end_de,
                "page_count": 100,
                "page_no": page
            }
            if corp_code:
                params["corp_code"] = corp_code

            res = requests.get(url, params=params, timeout=30)
            res.raise_for_status()

            try:
                data = res.json()
            except ValueError as e:
                raise ValueError(f"Invalid JSON response from DART: {res.text[:300]}") from e

            if not isinstance(data, dict):
                raise ValueError(f"Unexpected DART response type: {type(data)}")

            if "status" in data and data.get("status") not in ("000",):
                raise ValueError(f"DART API error: status={data.get('status')} message={data.get('message')}")

            filings = data.get("list", [])
            if not isinstance(filings, list):
                raise ValueError("DART response 'list' is not a list")

            all_filings.extend(filings)

            total_page = int(data.get("total_page", 1))
            if page >= total_page or page >= max_pages:
                break
            page += 1

        return all_filings

    @retry_on_exception(max_retries=2, delay=1.0)
    def _download_and_parse(self, rcept_no):
        url = f"{self.base_url}/document.xml"
        res = requests.get(
            url,
            params={"crtfc_key": self.api_key, "rcept_no": rcept_no},
            timeout=60
        )
        res.raise_for_status()

        content = ""

        try:
            with zipfile.ZipFile(io.BytesIO(res.content)) as z:
                names = z.namelist()
                if not names:
                    logger.warning("[%s] ZIP 내부 파일 없음", rcept_no)
                    return "", ""

                scored = []
                for n in names:
                    lower_n = n.lower()
                    if not lower_n.endswith(".xml"):
                        continue

                    score = 10
                    if any(k in n for k in ["요약재무", "재무제표", "손익계산서"]):
                        score += 500
                    elif any(k in n for k in ["사업의내용", "사업의개요"]):
                        score += 50

                    scored.append((score, n))

                if scored:
                    scored.sort(reverse=True)
                    targets = [s[1] for s in scored[:3]]
                else:
                    xml_candidates = [n for n in names if n.lower().endswith(".xml")]
                    if xml_candidates:
                        targets = xml_candidates[:1]
                    else:
                        logger.warning("[%s] ZIP 내부에 XML 파일 없음", rcept_no)
                        return "", ""

                full = ""
                total_limit = 30 * 1024 * 1024
                per_file_limit = 30 * 1024 * 1024

                for t in targets:
                    try:
                        with z.open(t) as f:
                            chunk = f.read(per_file_limit).decode("utf-8", errors="ignore")
                            full += chunk + "\n"
                            if len(full.encode("utf-8", errors="ignore")) > total_limit:
                                break
                    except Exception as e:
                        logger.warning("[%s] ZIP 파일 읽기 실패 (%s): %s", rcept_no, t, e)

                content = full

        except zipfile.BadZipFile:
            content = res.text[:500000]

        if not content:
            return "", ""

        parsed_text = self.rule_engine.process_content(content)
        return content, parsed_text

    def _is_already_processed(self, rcept_no) -> bool:
        cur = self.conn.cursor()
        try:
            cur.execute("SELECT 1 FROM summaries WHERE rcept_no = ?", (rcept_no,))
            return bool(cur.fetchone())
        finally:
            cur.close()

    def _save_to_db(self, filing, raw_text, scored_sentences, summary_text, top_ids_json, metrics):
        cur = self.conn.cursor()
        try:
            with self.conn:
                cur.execute("""
                    INSERT OR IGNORE INTO filings
                    (rcept_no, corp_code, report_nm, rcept_dt, raw_text)
                    VALUES (?, ?, ?, ?, ?)
                """, (
                    filing["rcept_no"],
                    filing.get("corp_code"),
                    filing.get("report_nm"),
                    filing.get("rcept_dt"),
                    raw_text
                ))

                cur.execute(
                    "SELECT 1 FROM sentences WHERE rcept_no = ? LIMIT 1",
                    (filing["rcept_no"],)
                )
                already_has_sentences = bool(cur.fetchone())

                if not already_has_sentences:
                    args = [
                        (filing["rcept_no"], s["order"], s["content"], s["score"])
                        for s in scored_sentences
                    ]
                    cur.executemany("""
                        INSERT INTO sentences (rcept_no, sent_order, content, score)
                        VALUES (?, ?, ?, ?)
                    """, args)

                cur.execute("""
                    INSERT OR IGNORE INTO summaries
                    (rcept_no, summary_text, top_sentence_ids)
                    VALUES (?, ?, ?)
                """, (
                    filing["rcept_no"],
                    summary_text,
                    top_ids_json
                ))

                cur.execute("""
                    UPDATE summaries
                       SET summary_text = ?, top_sentence_ids = ?
                     WHERE rcept_no = ?
                """, (
                    summary_text,
                    top_ids_json,
                    filing["rcept_no"]
                ))

                for m in metrics:
                    cur.execute("""
                        INSERT OR IGNORE INTO financial_metrics
                        (rcept_no, corp_code, period_label, period_type, metric_name, metric_value, raw_text)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (
                        filing["rcept_no"],
                        m.get("corp_code"),
                        m.get("period_label"),
                        m.get("period_type"),
                        m.get("metric_name"),
                        m.get("metric_value"),
                        m.get("raw_text")
                    ))

                    cur.execute("""
                        UPDATE financial_metrics
                           SET metric_value = ?, raw_text = ?, period_type = ?, period_label = ?, corp_code = ?
                         WHERE rcept_no = ? AND metric_name = ?
                    """, (
                        m.get("metric_value"),
                        m.get("raw_text"),
                        m.get("period_type"),
                        m.get("period_label"),
                        m.get("corp_code"),
                        filing["rcept_no"],
                        m.get("metric_name")
                    ))

        except Exception as e:
            logger.error("DB Error [%s]: %s", filing.get("rcept_no"), e)
            raise
        finally:
            cur.close()


if __name__ == "__main__":
    engine = None
    try:
        engine = DartLeanEngine()
        today = datetime.date.today().strftime("%Y%m%d")
        engine.run_pipeline("00126380", today, today)
    finally:
        if engine:
            engine.close()
