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

import google.generativeai as genai
from rules import SummaryRuleEngine
from financial_extractor import FinancialExtractor, infer_period_label
from self_healing import trigger_self_healing


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
        
        self.gemini_api_key = os.getenv("GEMINI_API_KEY")
        if self.gemini_api_key:
            genai.configure(api_key=self.gemini_api_key)
            self.gemini_model = genai.GenerativeModel('gemini-2.5-flash')
        else:
            self.gemini_model = None

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

    def _generate_ai_insight(self, report_nm: str, summary_text: str) -> str:
        if not self.gemini_model:
            return None
            
        prompt = f"다음은 한국 기업의 공시 요약문입니다. 이 공시가 기업가치나 주가에 미치는 영향을 1~2줄의 핵심 인사이트로 직관적이고 간결하게 평가해주세요.\n공시명: {report_nm}\n요약문: {summary_text}"
        
        try:
            time.sleep(12)  # 무료 API 분당 5회 제한 방어 (12초 대기)
            res = self.gemini_model.generate_content(prompt)
            return res.text.strip()
        except Exception as e:
            logger.error("[%s] AI 분석 실패 (Fail-safe 작동): %s", report_nm, e)
            return None

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

            report_nm = filing.get("report_nm", "")
            # 집합투자증권, 투자설명서 등 대용량 펀드/금융상품 관련 무관한 공시는 분석 대상에서 사전 차단하여 대역폭 및 DART 쿼터를 절약합니다.
            if any(k in report_nm for k in ["집합투자증권", "투자설명서", "효력발생안내", "일괄신고서", "자산운용보고서"]):
                logger.debug("[%s] 자산운용/펀드 공시 스킵: %s", rcept_no, report_nm)
                continue

            try:
                logger.info("[%s] %s 처리 중...", rcept_no, filing.get("report_nm"))
                time.sleep(0.3)  # DART API 과부하 및 차단 방지용 안전 마이크로 딜레이

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
                    corp_name=filing.get("corp_name", ""),
                    raw_text=raw_text
                )
                
                insight_text = self._generate_ai_insight(filing.get("report_nm", ""), summary_text)

                self._save_to_db(
                    filing=filing,
                    raw_text=raw_text,
                    scored_sentences=scored_sentences,
                    summary_text=summary_text,
                    top_ids_json=top_ids_json,
                    metrics=metrics,
                    insight_text=insight_text
                )

                try:
                    top_score = max([s["score"] for s in scored_sentences]) if scored_sentences else 0.0
                    trigger_self_healing(DB_PATH, rcept_no, report_nm, top_score, summary_text)
                except Exception as she:
                    logger.warning("[%s] Self Healing trigger failed: %s", rcept_no, she)

            except Exception as e:
                logger.exception("[%s] 처리 실패: %s", rcept_no, e)

        logger.info("파이프라인 실행 완료.")

    def _extract_correction_info(self, raw_text: str):
        if not raw_text:
            return None, None
        
        correction_items = []
        correction_reasons = []
        
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        for idx, line in enumerate(lines):
            if '|' in line:
                parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
                
                # 1. 2열 키-밸류 구조 (예: 3. 정정사유 | 기재 오류 수정)
                if len(parts) == 2:
                    k = parts[0].replace(" ", "")
                    v = parts[1].strip()
                    if '정정사유' in k or '정정의사유' in k:
                        if len(v) >= 2 and v != '-':
                            if v not in correction_reasons:
                                correction_reasons.append(v)
                            
                # 2. 다열 테이블 구조 (헤더-데이터 매핑)
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
                            
                            # 헤더 반복이나 구분선인 경우 건너뜀
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
                            
        # 3. 정정사유 정밀 Fallback 정규식
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
            if len(corr_reason) > 300:
                corr_reason = corr_reason[:297] + "..."
                
        return corr_item, corr_reason

    def _parse_correction_details(self, raw_text: str):
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

    def _parse_contract_details(self, raw_text: str):
        if not raw_text:
            return None
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        contract_amount = ""
        sales_amount = ""
        percent = ""
        partner = ""
        
        for line in lines:
            if '|' in line:
                parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
                if len(parts) >= 2:
                    k = parts[0].replace(" ", "")
                    v = parts[1].strip()
                    
                    if '확정계약금액' in k or '계약금액총액' in k:
                        contract_amount = v
                    elif '최근매출액' in k and '계약상대방' not in line:
                        sales_amount = v
                    elif '매출액대비' in k:
                        percent = v
                    elif '계약상대방' in k:
                        partner = v
                        
        if contract_amount and sales_amount:
            try:
                c_num = float(contract_amount.replace(',', '').replace('원', '').strip())
                s_num = float(sales_amount.replace(',', '').replace('원', '').strip())
                
                c_formatted = f"{c_num / 100_000_000:,.1f}억원"
                s_formatted = f"{s_num / 100_000_000:,.1f}억원"
                
                pct_str = percent or f"{(c_num / s_num) * 100:.2f}"
                partner_str = f" {partner}과" if partner and partner != "-" else ""
                
                return f"최근 매출액({s_formatted}) 대비 **{pct_str}%** 비중에 해당하는 약 **{c_formatted}** 규모의 단일판매ㆍ공급계약을{partner_str} 체결하였습니다."
            except Exception:
                pass
        return None

    def _parse_dividend_details(self, raw_text: str):
        if not raw_text:
            return None
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        div_type = ""
        div_kind = ""
        price_common = ""
        price_pref = ""
        rate_common = ""
        rate_pref = ""
        total_amount = ""
        base_date = ""
        
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

    def _parse_audit_details(self, raw_text: str):
        if not raw_text:
            return None
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        opinion = ""
        going_concern_uncertainty = ""
        internal_control_opinion = ""
        details = []
        
        for idx, line in enumerate(lines):
            if '|' in line:
                parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
                if len(parts) >= 2:
                    k = parts[0].replace(" ", "")
                    v = parts[1].strip()
                    
                    if k == '감사의견' or '감사의견등' in k or '감사의견(당기)' in k:
                        if not opinion:
                            opinion = v
                    elif '계속기업존속불확실성사유해당여부' in k or '계속기업존속불확실성' in k:
                        if not going_concern_uncertainty:
                            going_concern_uncertainty = v
                    elif '내부회계관리제도감사의견비적정' in k or '내부회계관리제도' in k:
                        if not internal_control_opinion:
                            internal_control_opinion = v
            else:
                cleaned_line = line.replace(" ", "")
                if '감사의견:' in cleaned_line or '감사의견：' in cleaned_line:
                    val = line.split(':')[-1].split('：')[-1].strip()
                    if not opinion:
                        opinion = val

        if not opinion:
            for line in lines:
                if '감사의견' in line and '|' in line:
                    parts = [p.strip() for p in line.split('|') if p.strip()]
                    if len(parts) >= 2:
                        for p in parts[1:]:
                            if any(o in p for o in ['적정', '한정', '부적정', '의견거절']):
                                opinion = p
                                break
                    if opinion:
                        break

        if not opinion:
            match = re.search(r"감사의견\s*[:：\s|]+(적정|한정|부적정|의견거절)", raw_text)
            if match:
                opinion = match.group(1)

        if not opinion:
            raw_no_space = raw_text.replace(" ", "")
            if any(l.replace(" ", "") in ["의견거절", "의견거절의견", "의견거절근거"] for l in lines):
                opinion = "의견거절"
            elif any(k in raw_no_space for k in ["의견거절을표명합니다", "의견거절의근거", "의견거절의의견", "의견을표명하지아니합니다", "의견을표명하지않습니다", "의견을표명하지아니함"]):
                opinion = "의견거절"
            elif any(k in raw_no_space for k in ["부적정의견을표명합니다", "부적정의견의근거", "부적정의견"]):
                opinion = "부적정"
            elif any(k in raw_no_space for k in ["한정의견을표명합니다", "한정의견의근거", "한정의견"]):
                opinion = "한정"
            elif any(k in raw_no_space for k in ["공정하게표시하고있습니다", "적정의견을표명합니다", "적정의견"]):
                opinion = "적정"

        if not going_concern_uncertainty:
            raw_no_space = raw_text.replace(" ", "")
            if "계속기업" in raw_no_space and "중요한불확실성" in raw_no_space:
                going_concern_uncertainty = "중요한 불확실성 존재 (주의 필요)"

        if opinion:
            opinion_clean = opinion.replace(" ", "")
            if '적정' in opinion_clean:
                details.append(f"외부감사인의 감사의견은 [적정]입니다.")
            elif '한정' in opinion_clean:
                details.append(f"[주의] 외부감사인의 감사의견은 [한정]입니다. (주의 필요)")
            elif '부적정' in opinion_clean:
                details.append(f"[경고] 외부감사인의 감사의견은 [부적정]입니다. (상장폐지 등 심각한 위험)")
            elif '의견거절' in opinion_clean:
                details.append(f"[경고] 외부감사인의 감사의견은 [의견거절]입니다. (상장폐지 등 심각한 위험)")
            else:
                details.append(f"외부감사인의 감사의견은 [{opinion}]입니다.")

            if going_concern_uncertainty and going_concern_uncertainty != "-":
                if '미해당' not in going_concern_uncertainty:
                    suffix = "" if "주의" in going_concern_uncertainty else " (주의 필요)"
                    details.append(f"계속기업 존속불확실성 여부: [{going_concern_uncertainty}]{suffix}")
                else:
                    details.append(f"계속기업 존속불확실성 여부: 미해당")

            if internal_control_opinion and internal_control_opinion != "-":
                if '미해당' not in internal_control_opinion:
                    details.append(f"내부회계관리제도 감사의견 비적정 여부: [{internal_control_opinion}]")
        
        if details:
            return "\n".join(details)
            
        return None

    def _parse_treasury_stock_acquisition(self, raw_text: str) -> str:
        if not raw_text:
            return None
            
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        shares = []
        amount = []
        purpose = ""
        
        current_section = ""
        
        for line in lines:
            if '|' in line:
                parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
                if not parts:
                    continue
                p_clean0 = parts[0].replace(" ", "")
                
                if '취득예정주식' in p_clean0:
                    current_section = "shares"
                    if len(parts) >= 3 and any(char.isdigit() for char in parts[-1]):
                        shares.append(f"{parts[1]}: {parts[2]}주")
                elif '취득예정금액' in p_clean0:
                    current_section = "amount"
                    if len(parts) >= 3 and any(char.isdigit() for char in parts[-1]):
                        amount.append(f"{parts[1]}: {parts[2]}원")
                elif '취득예상기간' in p_clean0 or '취득방법' in p_clean0 or '보유예상기간' in p_clean0:
                    current_section = ""
                elif '취득목적' in p_clean0:
                    current_section = ""
                    if len(parts) >= 2:
                        purpose = " ".join([p for p in parts[1:] if p]).strip()
                else:
                    if current_section == "shares":
                        if len(parts) >= 3 and any(char.isdigit() for char in parts[-1]):
                            shares.append(f"{parts[1]}: {parts[-1]}주")
                        elif len(parts) == 2 and any(char.isdigit() for char in parts[-1]):
                            shares.append(f"{parts[0]}: {parts[-1]}주")
                    elif current_section == "amount":
                        if len(parts) >= 3 and any(char.isdigit() for char in parts[-1]):
                            amount.append(f"{parts[1]}: {parts[-1]}원")
                        elif len(parts) == 2 and any(char.isdigit() for char in parts[-1]):
                            amount.append(f"{parts[0]}: {parts[-1]}원")

        details = []
        if shares:
            details.append(f"▪ 취득 예정 주식 : {', '.join(shares)}")
        if amount:
            details.append(f"▪ 취득 예정 금액 : {', '.join(amount)}")
        if purpose:
            details.append(f"▪ 취득 목적 : {purpose}")
            
        if details:
            return "\n".join(details)
            
        return None

    def _parse_capital_reduction(self, raw_text: str) -> str:
        if not raw_text:
            return None
            
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        reduction_date = ""
        shares_before = ""
        shares_after = ""
        capital_before = ""
        capital_after = ""
        
        capital_row_seen = False
        shares_row_seen = False
        
        for idx, line in enumerate(lines):
            if '|' in line:
                parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
                if not parts:
                    continue
                p_clean0 = parts[0].replace(" ", "")
                
                if any(w in p_clean0 for w in ['감자완료일', '감자기준일']) and len(parts) >= 2:
                    if not reduction_date and any(char.isdigit() for char in parts[1]):
                        reduction_date = parts[1]
                
                if '발행주식' in p_clean0 or '보통주식' in p_clean0:
                    nums = [p for p in parts[1:] if any(char.isdigit() for char in p) and '주' not in p and '변동' not in p]
                    if len(nums) >= 2 and not shares_before:
                        shares_before = nums[0]
                        shares_after = nums[-1]
                    elif '감자전' in line or '감자후' in line:
                        shares_row_seen = True
                elif shares_row_seen:
                    nums = [p for p in parts if any(char.isdigit() for char in p)]
                    if len(nums) >= 2 and not shares_before:
                        shares_before = nums[0]
                        shares_after = nums[-1]
                    shares_row_seen = False
                        
                if '자본금' in p_clean0:
                    nums = [p for p in parts[1:] if any(char.isdigit() for char in p)]
                    if len(nums) >= 2 and not capital_before:
                        capital_before = nums[0]
                        capital_after = nums[-1]
                    elif '감자전' in line or '감자후' in line:
                        capital_row_seen = True
                elif capital_row_seen:
                    nums = [p for p in parts if any(char.isdigit() for char in p)]
                    if len(nums) >= 2 and not capital_before:
                        capital_before = nums[0]
                        capital_after = nums[-1]
                    capital_row_seen = False
                        
            else:
                line_clean = line.replace(" ", "")
                if any(w in line_clean for w in ['감자완료일', '감자기준일']) and ':' in line:
                    reduction_date = line.split(':', 1)[-1].strip()

        details = []
        if reduction_date:
            details.append(f"▪ 감자 완료/기준일 : {reduction_date}")
        if shares_before and shares_after:
            details.append(f"▪ 주식수 변동 : {shares_before}주 → {shares_after}주")
        if capital_before and capital_after:
            cb = capital_before if '원' in capital_before else f"{capital_before}원"
            ca = capital_after if '원' in capital_after else f"{capital_after}원"
            details.append(f"▪ 자본금 변동 : {cb} → {ca}")
            
        if details:
            return "\n".join(details)
            
        return None

    def _parse_unfaithful_disclosure(self, raw_text: str):
        if not raw_text:
            return None
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        discl_type = ""
        content = ""
        decision_limit = ""
        penalty_points = ""
        
        for line in lines:
            if '|' in line:
                parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
                if len(parts) >= 2:
                    k = parts[0].replace(" ", "")
                    v = parts[1].strip()
                    
                    if '불성실공시유형' in k:
                        discl_type = v
                    elif k == '내용' or k == '정정대상공시서류':
                        content = v
                    elif '결정시한' in k or '지정여부결정시한' in k:
                        decision_limit = v
                    elif '부과벌점' in k or '누계벌점' in k:
                        penalty_points = v
                        
        if not discl_type and not content:
            return None
            
        details = []
        if discl_type and content:
            details.append(f"불성실공시 유형은 [{discl_type}]이며, 주요 사유는 '{content}'입니다.")
        elif discl_type:
            details.append(f"불성실공시 유형은 [{discl_type}]입니다.")
        elif content:
            details.append(f"불성실공시의 사유는 '{content}'입니다.")
            
        if penalty_points and penalty_points != "-":
            details.append(f"최근 1년간 부과벌점은 {penalty_points}점입니다.")
            
        if decision_limit and decision_limit != "-":
            details.append(f"최종 지정여부 결정 기한은 {decision_limit}까지입니다.")
            
        return " ".join(details)

    def _parse_general_meeting_results(self, raw_text: str):
        if not raw_text:
            return None
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        agenda_items = []
        is_agenda_section = False
        directors = []
        is_director_section = False
        
        summary_agendas = {}
        
        for line in lines:
            line_clean = re.sub(r'\[\s*테이블\s*\]', '', line).strip()
            
            if '주주총회 안건 세부내역' in line_clean:
                is_agenda_section = True
                is_director_section = False
                continue
            
            if '이사선임 세부내역' in line_clean or '감사위원선임 세부내역' in line_clean:
                is_agenda_section = False
                is_director_section = True
                continue
                
            if is_agenda_section:
                if '|' in line_clean:
                    parts = [p.strip() for p in line_clean.split('|')]
                    if '회의목적사항' in parts or '결의구분' in parts or '찬성률' in parts or '발행주식' in parts:
                        continue
                    if len(parts) >= 4:
                        num = parts[0]
                        res_type = parts[1]
                        title = parts[2]
                        result = parts[3]
                        
                        approval_rate = ""
                        if len(parts) >= 6:
                            approval_rate = f" (찬성률 {parts[5]}%)" if parts[5] and parts[5] != "-" else ""
                        
                        title_clean = re.sub(r'\(.*?\)', '', title).strip()
                        if title_clean.startswith('-'):
                            title_clean = title_clean.strip('-').split('-')[0].strip()
                        if len(title_clean) > 25:
                            title_clean = title_clean[:25] + "..."
                            
                        main_num = str(num).split('-')[0]
                        key = f"{main_num}_{result}"
                        if key not in summary_agendas:
                            summary_agendas[key] = {
                                'num': num,
                                'title': title_clean,
                                'result': result,
                                'approval_rate': approval_rate,
                                'count': 1
                            }
                        else:
                            summary_agendas[key]['count'] += 1
                            summary_agendas[key]['approval_rate'] = ""
            
            if is_director_section:
                if '|' in line_clean:
                    parts = [p.strip() for p in line_clean.split('|')]
                    if '성명' in parts or '출생년도' in parts or '임기' in parts or '출생년월' in parts:
                        continue
                    if len(parts) >= 4:
                        name = parts[0]
                        term = parts[2]
                        is_new = parts[3]
                        career = parts[4] if len(parts) >= 5 else ""
                        
                        if not any(d['name'] == name for d in directors):
                            directors.append({
                                'name': name,
                                'term': term,
                                'is_new': is_new,
                                'career': career
                            })
                            
        if not summary_agendas:
            return None
            
        details = []
        for k, v in summary_agendas.items():
            count_str = f" 외 {v['count']-1}건" if v['count'] > 1 else ""
            num_str = v['num'] if v['count'] == 1 else k.split('_')[0]
            rate_str = v['approval_rate']
            details.append(f"▪ 제{num_str}호 의안 '{v['title']}'{count_str} [{v['result']}]{rate_str}")
            
        if directors:
            details.append("\n[신규 임원 선임 요약]")
            for d in directors:
                career_clean = d['career'].replace(" (전) ", " / (전) ").strip(" / ")
                if len(career_clean) > 25:
                    first_split = re.split(r'\s前|\s현', career_clean)
                    if len(first_split) > 1 and len(first_split[0]) > 5:
                        career_clean = first_split[0] + " 등"
                    else:
                        career_clean = career_clean[:25] + "..."
                term_val = d['term'].strip()
                if "년" not in term_val:
                    term_val = f"{term_val}년"
                term_clean = f"임기 {term_val}"
                details.append(f"▪ {d['name']} ({d['is_new']}, {term_clean})")
                
        return "\n".join(details)

    def _parse_large_holding(self, raw_text: str) -> str:
        if not raw_text:
            return None
            
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        ratios = []
        lines_len = len(lines)
        
        for idx, line in enumerate(lines):
            if '보유비율(%)' in line or '보유비율' in line:
                for j in range(idx + 1, min(idx + 15, lines_len)):
                    next_line = lines[j]
                    if '|' in next_line:
                        parts = [p.strip() for p in next_line.split('|')]
                        for p in parts:
                            if re.match(r"^\d+\.\d+$", p):
                                if f"{p}%" not in ratios:
                                    ratios.append(f"{p}%")
                    else:
                        match = re.match(r"^\s*(\d+\.\d+)\s*$", next_line)
                        if match:
                            val = match.group(1)
                            if f"{val}%" not in ratios:
                                ratios.append(f"{val}%")

        transactions = []
        for line in lines:
            if '장내매수' in line or '장내처분' in line or '장내매도' in line or '블록딜' in line:
                if '|' in line:
                    parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
                    if len(parts) >= 4:
                        name = parts[0]
                        date = parts[2] if len(parts) > 2 else ""
                        action = parts[3] if len(parts) > 3 else ""
                        shares = parts[5] if len(parts) > 5 else ""
                        
                        if name and action:
                            transactions.append(f"{name}의 {action}({shares}주, {date})")

        ratio_str = f" 최종 보유비율은 **{ratios[0]}**" if ratios else " 보유비율 변동이 있었습니다"
        trans_str = f" ({', '.join(transactions[:2])} 발생)" if transactions else ""
        
        return f"주식등의대량보유상황보고서가 제출되었습니다.{ratio_str}입니다.{trans_str}"

    def _parse_major_shareholder_change(self, raw_text: str) -> str:
        if not raw_text:
            return None
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        changes = []
        for line in lines:
            if '|' in line:
                parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
                if not parts or any(h in parts[0] for h in ["구분", "주주명", "계", "소계", "전체합계"]):
                    continue
                if len(parts) >= 11:
                    share_type = parts[4]
                    if share_type in ["보통주", "우선주"]:
                        name = parts[1]
                        change_qty = parts[7].replace(",", "")
                        after_rate = parts[10]
                        
                        if change_qty and change_qty != "-" and change_qty != "0":
                            try:
                                qty_val = int(change_qty)
                                sign = "+" if qty_val > 0 else ""
                                change_qty_formatted = f"{qty_val:,}"
                                changes.append(f"▪ {name}: {share_type} {sign}{change_qty_formatted}주 변동 (지분율 {after_rate}%)")
                            except ValueError:
                                continue
                            
        if changes:
            return "\n".join(changes[:5])
        return "최대주주 등의 주식 보유 지분율에 변동이 있었습니다. 세부 변동 내역은 원문을 참고하시기 바랍니다."

    def _parse_debt_security_확정(self, raw_text: str) -> str:
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

    def _parse_securities_issuance(self, raw_text: str) -> str:
        if not raw_text:
            return None
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        security_type = ""
        total_amount = ""
        
        sec_idx = -1
        amt_idx = -1
        
        for idx, line in enumerate(lines):
            if '|' in line:
                parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
                
                if sec_idx != -1 and sec_idx < len(parts) and not security_type:
                    v = parts[sec_idx].strip()
                    v_clean = v.replace(" ", "")
                    if v_clean and not any(h in v_clean for h in ["증권", "종류", "개시", "종료", "일자", "납입", "비고"]):
                        security_type = v
                        sec_idx = -1
                        
                if amt_idx != -1 and amt_idx < len(parts) and not total_amount:
                    v = parts[amt_idx].strip()
                    v_clean = v.replace(" ", "")
                    if v_clean and any(char.isdigit() for char in v_clean):
                        total_amount = v
                        amt_idx = -1

                for i, p in enumerate(parts):
                    p_clean = p.replace(" ", "")
                    if '증권의종류' in p_clean:
                        if i + 1 < len(parts):
                            v = parts[i+1].strip()
                            v_clean = v.replace(" ", "")
                            if v_clean and not any(h in v_clean for h in ["개시", "종료", "일자", "납입", "비고", "청약일", "발행일"]):
                                security_type = v
                            else:
                                sec_idx = i
                        else:
                            sec_idx = i
                    elif any(w in p_clean for w in ['매출총액', '모집총액', '발행총액', '발행금액']):
                        if i + 1 < len(parts):
                            v = parts[i+1].strip()
                            v_clean = v.replace(" ", "")
                            if v_clean and any(char.isdigit() for char in v_clean):
                                total_amount = v
                            else:
                                amt_idx = i
                        else:
                            amt_idx = i
            else:
                line_clean = line.replace(" ", "")
                if ('증권의종류' in line_clean) and ':' in line:
                    security_type = line.split(':', 1)[-1].strip()
                elif any(w in line_clean for w in ['매출총액', '모집총액', '발행총액', '발행금액']) and ':' in line:
                    total_amount = line.split(':', 1)[-1].strip()

        if not security_type or not total_amount:
            for idx, line in enumerate(lines):
                line_clean = line.replace(" ", "")
                if '증권의종류' in line_clean and not ':' in line and not security_type:
                    if idx + 1 < len(lines):
                        security_type = lines[idx+1].strip()
                if any(w in line_clean for w in ['매출총액', '모집총액', '발행총액', '발행금액']) and not ':' in line and not total_amount:
                    if idx + 1 < len(lines):
                        total_amount = lines[idx+1].strip()

        if security_type and total_amount:
            total_amount = total_amount.replace(" ", "")
            if not total_amount.endswith('원'):
                total_amount += '원'
            return f"▪ 증권의 종류 : {security_type}\n▪ 모집/발행총액 : {total_amount}"
            
        return None

    def _parse_ir_holding(self, raw_text: str) -> str:
        if not raw_text:
            return None
        
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        date_start = ""
        date_end = ""
        time_start = ""
        time_end = ""
        location = ""
        target_investors = ""
        purpose = ""
        method = ""
        sponsor = ""
        
        for line in lines:
            if '|' in line:
                parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
                for i, p in enumerate(parts):
                    p_clean = p.replace(" ", "")
                    if i + 1 < len(parts):
                        v = parts[i+1].strip()
                        if ('장소' in p_clean and v and v != "일시" and v != "장소"):
                            location = v
                        elif '대상자' in p_clean and not target_investors:
                            target_investors = v
                        elif ('목적' in p_clean or '실시목적' in p_clean) and not purpose:
                            purpose = v
                        elif '방법' in p_clean and not method:
                            method = v
                        elif '후원' in p_clean and not sponsor:
                            sponsor = v

            line_clean = line.replace(" ", "")
            if '시작일' in line_clean or '일시' in line_clean or '개최일' in line_clean:
                matches = re.findall(r'\d{4}[-/.]\d{2}[-/.]\d{2}', line)
                if len(matches) >= 1 and not date_start:
                    date_start = matches[0]
                if len(matches) >= 2 and not date_end:
                    date_end = matches[1]
            if '종료일' in line_clean:
                matches = re.findall(r'\d{4}[-/.]\d{2}[-/.]\d{2}', line)
                if matches and not date_end:
                    date_end = matches[-1]
            if '시작시간' in line_clean or '시작시각' in line_clean or '일시' in line_clean or '개최일' in line_clean:
                times = re.findall(r'\d{1,2}:\d{2}', line)
                if len(times) >= 1 and not time_start:
                    time_start = times[0]
                if len(times) >= 2 and not time_end:
                    time_end = times[1]
            if '종료시간' in line_clean or '종료시각' in line_clean:
                times = re.findall(r'\d{1,2}:\d{2}', line)
                if times and not time_end:
                    time_end = times[-1]

        date_str = ""
        if date_start:
            if date_end and date_start != date_end:
                date_str = f"{date_start} ~ {date_end}"
            else:
                date_str = date_start
                
        time_str = ""
        if time_start:
            if time_end:
                time_str = f" {time_start} ~ {time_end}"
            else:
                time_str = f" {time_start}"
                
        datetime_final = f"{date_str}{time_str}".strip()
        
        details = []
        if datetime_final:
            details.append(f"개최 일시: {datetime_final}")
        if location and location != "-":
            details.append(f"개최 장소: {location}")
        if target_investors and target_investors != "-":
            details.append(f"대상자: {target_investors}")
        if method and method != "-":
            details.append(f"실시 방법: {method}")
        if purpose and purpose != "-":
            details.append(f"실시 목적: {purpose}")
        if sponsor and sponsor != "-":
            details.append(f"후원 기관: {sponsor}")
            
        if not details:
            return None
        return "\n- ".join(details)

    def _parse_shareholder_closure(self, raw_text: str) -> str:
        if not raw_text:
            return None
            
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        base_date = ""
        stop_start = ""
        stop_end = ""
        reason = ""
        board_date = ""
        related_disclosure = ""
        
        for line in lines:
            if '|' in line:
                parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
                if len(parts) >= 2:
                    k = parts[0].replace(" ", "")
                    v = parts[1].strip()
                    
                    if k == '기준일' or '주주확정기준일' in k:
                        base_date = v
                    elif '설정사유' in k or '사유' in k:
                        reason = v
                    elif '이사회결의일' in k:
                        board_date = v
                    elif '관련공시' in k:
                        related_disclosure = v
                        
                line_clean = line.replace(" ", "")
                if '명의개서' in line_clean or '정지기간' in line_clean:
                    matches = re.findall(r'\d{4}[-/.]\d{2}[-/.]\d{2}', line)
                    if len(matches) >= 1:
                        stop_start = matches[0]
                    if len(matches) >= 2:
                        stop_end = matches[1]
                    if '종료일' in line_clean and len(matches) == 1:
                        stop_end = matches[0]

        if not stop_start or not stop_end:
            for line in lines:
                if '|' in line:
                    parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
                    if len(parts) >= 2:
                        k = parts[0].replace(" ", "")
                        v = parts[1].strip()
                        if '시작일' in k and re.match(r'\d{4}[-/.]\d{2}[-/.]\d{2}', v):
                            stop_start = v
                        elif '종료일' in k and re.match(r'\d{4}[-/.]\d{2}[-/.]\d{2}', v):
                            stop_end = v

        details = []
        if base_date:
            details.append(f"기준일: {base_date}")
        if stop_start and stop_end:
            if stop_start == stop_end:
                details.append(f"명의개서 정지기간: {stop_start}")
            else:
                details.append(f"명의개서 정지기간: {stop_start} ~ {stop_end}")
        if reason and reason != "-":
            details.append(f"설정 사유: {reason}")
        if board_date and board_date != "-":
            details.append(f"이사회 결의일: {board_date}")
        if related_disclosure and related_disclosure != "-":
            details.append(f"관련 공시: {related_disclosure}")
            
        if not details:
            return None
        return "\n- ".join(details)

    def _parse_market_action(self, raw_text: str):
        if not raw_text:
            return None
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        details = []
        for line in lines:
            if line.startswith("[테이블]"):
                formatted = self.rule_engine.format_raw_table_to_korean(line)
                if formatted:
                    formatted = re.sub(r'^\d+\.\s*', '', formatted)
                    details.append(f"  - {formatted}")
                    
        if not details:
            return None
            
        return "시장조치 세부 내역은 다음과 같습니다.\n" + "\n".join(details)

    def _parse_lawsuit(self, raw_text: str):
        if not raw_text:
            return None
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        details = []
        target_keys = ["사건의 명칭", "원고", "신청인", "피고", "청구금액", "자기자본대비", "관할법원", "향후대책"]
        for line in lines:
            if line.startswith("[테이블]"):
                formatted = self.rule_engine.format_raw_table_to_korean(line)
                if formatted:
                    formatted = re.sub(r'^\d+\.\s*', '', formatted)
                    if any(formatted.startswith(k) or f"({k})" in formatted for k in target_keys) or any(k in formatted.split(':')[0] for k in target_keys):
                        if len(formatted) > 150:
                            formatted = formatted[:147] + "..."
                        details.append(f"  - {formatted}")
                        
        if not details:
            return None
            
        return "소송(중재) 제기 관련 세부 내역은 다음과 같습니다.\n" + "\n".join(details)

    def _parse_lawsuit_ruling(self, raw_text: str):
        if not raw_text:
            return None
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        details = []
        target_keys = ["사건의 명칭", "원고", "신청인", "피고", "판결ㆍ결정 내용", "판결ㆍ결정 사유", "판결ㆍ결정내용", "판결ㆍ결정사유", "관할법원", "판결ㆍ결정일자", "주문"]
        for line in lines:
            if line.startswith("[테이블]"):
                formatted = self.rule_engine.format_raw_table_to_korean(line)
                if formatted:
                    formatted = re.sub(r'^\d+\.\s*', '', formatted)
                    if any(formatted.startswith(k) or f"({k})" in formatted for k in target_keys) or any(k in formatted.split(':')[0] for k in target_keys):
                        if len(formatted) > 200:
                            formatted = formatted[:197] + "..."
                        details.append(f"  - {formatted}")
                        
        if not details:
            return None
        return "소송 판결·결정 세부 내역은 다음과 같습니다.\n" + "\n".join(details)

    def _parse_convertible_exercise(self, raw_text: str):
        if not raw_text:
            return None
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        details = []
        for line in lines:
            if line.startswith("[테이블]"):
                parts = [p.strip() for p in line.replace("[테이블]", "").split('|')]
                if len(parts) >= 6 and any(p.replace(',', '').replace('원', '').replace('주', '').replace(' ', '').isdigit() for p in parts):
                    try:
                        date = parts[0]
                        round_no = parts[1]
                        bond_type = parts[2]
                        amount = parts[3]
                        price = parts[4]
                        shares = parts[5]
                        listing_date = parts[6] if len(parts) > 6 else ""
                        
                        amount_clean = amount.replace('원', '').replace(',', '').replace(' ', '').strip()
                        if amount_clean.isdigit():
                            amt_val = int(amount_clean)
                            if amt_val >= 100000000:
                                amount = f"{amt_val / 100000000:.1f}억원"
                                
                        desc = f"청구일자: {date} (제{round_no}회 {bond_type}) | 청구금액: {amount} | 전환가액: {price}원 | 발행주식수: {shares}주"
                        if listing_date:
                            desc += f" (상장예정일: {listing_date})"
                        details.append(f"  - {desc}")
                    except Exception:
                        pass
                else:
                    formatted = self.rule_engine.format_raw_table_to_korean(line)
                    if formatted and any(k in formatted for k in ["발행주식총수대비", "전환청구권행사주식수", "전환사채잔액", "미전환사채"]):
                        details.append(f"  - {formatted}")
                        
        if not details:
            return None
        return "전환청구권 행사 세부 내역은 다음과 같습니다.\n" + "\n".join(details)

    def _parse_asset_acquisition(self, raw_text: str):
        if not raw_text:
            return None
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        details = []
        target_keys = ["자산명", "취득금액", "자산총액대비", "취득목적", "거래상대방", "양수금액", "양수목적", "취득예정일자", "양수예정일자", "처분금액"]
        for line in lines:
            if line.startswith("[테이블]"):
                formatted = self.rule_engine.format_raw_table_to_korean(line)
                if formatted:
                    formatted = re.sub(r'^\d+\.\s*', '', formatted)
                    if any(formatted.startswith(k) or f"({k})" in formatted for k in target_keys) or any(k in formatted.split(':')[0] for k in target_keys):
                        if len(formatted) > 150:
                            formatted = formatted[:147] + "..."
                        details.append(f"  - {formatted}")
                        
        if not details:
            return None
            
        return "자산 주요 변동 내역은 다음과 같습니다.\n" + "\n".join(details)

    def _parse_ceo_change(self, raw_text: str):
        if not raw_text:
            return None
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        before_ceo = ''
        after_ceo = ''
        reason = ''
        change_date = ''
        
        for line in lines:
            if '|' in line:
                parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
                if len(parts) >= 2:
                    k = parts[0].replace(' ', '')
                    v = parts[1].strip()
                    
                    if '변경전대표이사' in k:
                        before_ceo = v
                    elif '변경후대표이사' in k:
                        after_ceo = v
                    elif '변경사유' in k:
                        reason = v
                    elif '변경일' in k:
                        change_date = v
                        
        for line in lines:
            line_clean = re.sub(r'\[\s*테이블\s*\]', '', line).strip()
            if '변경전 대표이사' in line_clean and '|' in line_clean:
                before_ceo = line_clean.split('|')[-1].strip()
            if '변경후 대표이사' in line_clean and '|' in line_clean:
                after_ceo = line_clean.split('|')[-1].strip()

        if not (before_ceo or after_ceo or reason or change_date):
            return None

        details = ["대표이사가 변경되었습니다."]
        if before_ceo:
            details.append(f"  - 변경 전: {before_ceo}")
        if after_ceo:
            details.append(f"  - 변경 후: {after_ceo}")
        if reason:
            details.append(f"  - 변경 사유: {reason}")
        if change_date:
            details.append(f"  - 변경 일자: {change_date}")

        return "\n".join(details)

    def _parse_bankruptcy_dismissal(self, raw_text: str):
        if not raw_text:
            return None
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
        
        case_no = ''
        dismiss_date = ''
        court = ''
        reason = ''
        
        for line in lines:
            if '|' in line:
                parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
                if len(parts) >= 2:
                    k = parts[0].replace(' ', '')
                    v = parts[1].strip()
                    
                    if '사건번호' in k:
                        case_no = v
                    elif '기각일자' in k:
                        dismiss_date = v
                    elif '관할법원' in k:
                        court = v
                    elif '기각사유' in k:
                        reason = v

        if not (case_no or dismiss_date or court or reason):
            return None

        details = ["[안내] 법원으로부터 파산신청 기각 결정을 받았습니다. (리스크 완화)"]
        if court:
            details.append(f"  - 관할 법원: {court}")
        if dismiss_date:
            details.append(f"  - 기각 결정일: {dismiss_date}")
        if case_no:
            details.append(f"  - 사건 번호: {case_no}")
        
        if reason:
            order_part = ""
            reason_part = ""
            if '[이유]' in reason:
                parts = reason.split('[이유]')
                order_part = parts[0].strip()
                reason_part = parts[1].strip()
            else:
                order_part = reason
            
            if order_part:
                details.append(f"  - 결정 내용 및 사유: {order_part}")
            if reason_part:
                if len(reason_part) > 200:
                    reason_part = reason_part[:197] + "..."
                details.append(f"  - 기각 이유: {reason_part}")
                
        return "\n".join(details)

    def _parse_number(self, text: str):
        if not text or text == "-":
            return 0
        cleaned = re.sub(r'[^0-9\.-]', '', text)
        if not cleaned:
            return 0
        try:
            if '.' in cleaned:
                return float(cleaned)
            return int(cleaned)
        except ValueError:
            return 0

    def _format_krw(self, val: float):
        if val >= 100_000_000_000: # 1천억 이상
            return f"약 {val / 100_000_000_000:,.1f}천억원"
        if val >= 100_000_000: # 1억 이상
            return f"약 {val / 100_000_000:,.1f}억원"
        if val >= 10_000: # 1만 이상
            return f"약 {val / 10_000:,.0f}만원"
        return f"{val:,}원"

    def _parse_paid_in_capital_increase(self, raw_text: str):
        if not raw_text:
            return None
            
        parse_text = raw_text
        if "정정후" in raw_text:
            parts = raw_text.split("정정후")
            parse_text = parts[-1]
            
        lines = [line.strip() for line in parse_text.split('\n') if line.strip()]
        
        funding_purposes = {}
        total_shares_common = 0
        total_shares_preferred = 0
        issue_price = 0
        record_date = ""
        allocation_ratio = ""
        listing_date = ""
        
        i = 0
        while i < len(lines):
            line = lines[i]
            if '|' in line:
                parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
                if len(parts) >= 2:
                    k = parts[0].replace(" ", "")
                    v = parts[1].strip()
                    
                    if '신주의종류와수' in k or '증자주식수' in k:
                        if '보통주' in k or '보통주' in v or (len(parts) >= 3 and '보통주' in parts[1]):
                            val_str = parts[-1] if len(parts) >= 3 else v
                            total_shares_common = self._parse_number(val_str)
                        elif '우선주' in k or '우선주' in v or (len(parts) >= 3 and '우선주' in parts[1]):
                            val_str = parts[-1] if len(parts) >= 3 else v
                            total_shares_preferred = self._parse_number(val_str)
                    elif '발행가액' in k or '예정발행가액' in k:
                        if '보통주' in k or '보통주' in v or (len(parts) >= 3 and '보통주' in parts[1]):
                            val_str = parts[-1] if len(parts) >= 3 else v
                            issue_price = self._parse_number(val_str)
                        elif not issue_price:
                            val_str = parts[-1] if len(parts) >= 3 else v
                            issue_price = self._parse_number(val_str)
                    elif '시설자금' in k:
                        funding_purposes['시설자금'] = self._parse_number(v) or (self._parse_number(parts[2]) if len(parts) >= 3 else 0)
                    elif '운영자금' in k:
                        funding_purposes['운영자금'] = self._parse_number(v) or (self._parse_number(parts[2]) if len(parts) >= 3 else 0)
                    elif '채무상환' in k:
                        funding_purposes['채무상환자금'] = self._parse_number(v) or (self._parse_number(parts[2]) if len(parts) >= 3 else 0)
                    elif '영업양수' in k:
                        funding_purposes['영업양수자금'] = self._parse_number(v) or (self._parse_number(parts[2]) if len(parts) >= 3 else 0)
                    elif '타법인' in k or '타법인증권' in k:
                        funding_purposes['타법인증권취득자금'] = self._parse_number(v) or (self._parse_number(parts[2]) if len(parts) >= 3 else 0)
                    elif '기타자금' in k:
                        funding_purposes['기타자금'] = self._parse_number(v) or (self._parse_number(parts[2]) if len(parts) >= 3 else 0)
                    elif '신주배정기준일' in k:
                        record_date = v or (parts[2] if len(parts) >= 3 else "")
                    elif '신주배정주식수' in k or '배정비율' in k:
                        allocation_ratio = v or (parts[2] if len(parts) >= 3 else "")
                    elif '상장예정일' in k or '상장예정' in k:
                        listing_date = v or (parts[2] if len(parts) >= 3 else "")
            i += 1
            
        for idx, line in enumerate(lines):
            if '|' in line:
                parts = [re.sub(r'\[\s*테이블\s*\]', '', p).strip() for p in line.split('|')]
                if len(parts) >= 2:
                    k = parts[0].replace(" ", "")
                    if '보통주식' in k and not total_shares_common:
                        total_shares_common = self._parse_number(parts[-1])
                    if '우선주식' in k and not total_shares_preferred:
                        total_shares_preferred = self._parse_number(parts[-1])
                        
        if not total_shares_common and not total_shares_preferred and not record_date:
            return None
            
        total_shares = total_shares_common + total_shares_preferred
        total_amount = 0
        if total_shares and issue_price:
            total_amount = total_shares * issue_price
        else:
            total_amount = sum(funding_purposes.values())
            
        details = []
        if total_amount > 0:
            details.append(f"총 증자 규모는 {self._format_krw(total_amount)}입니다.")
        elif total_shares > 0:
            details.append(f"총 {total_shares:,}주의 신주 발행을 결정했습니다.")
            
        purposes = []
        for name, amt in funding_purposes.items():
            if amt and amt > 0:
                purposes.append(f"{name}({self._format_krw(amt)})")
        if purposes:
            details.append("자금 조달 목적은 " + ", ".join(purposes) + "입니다.")
            
        if record_date:
            record_date_clean = re.sub(r'\s+', ' ', record_date).strip()
            details.append(f"신주배정기준일은 {record_date_clean}이며,")
            
        if allocation_ratio:
            try:
                ratio_val = float(allocation_ratio)
                ratio_str = f"{ratio_val:.4f}주"
            except ValueError:
                ratio_str = allocation_ratio
            details.append(f"1주당 신주배정주식수는 {ratio_str}입니다.")
            
        if listing_date:
            listing_date_clean = re.sub(r'\s+', ' ', listing_date).strip()
            details.append(f"신주 상장 예정일은 {listing_date_clean}입니다.")
            
        return " ".join(details)

    def _build_summary(
        self,
        scored_sentences,
        report_nm: str,
        metrics: list,
        corp_code: str = None,
        period_label: str = None,
        corp_name: str = "",
        raw_text: str = ""
    ):
        display_name = (corp_name or "").strip() or "해당 기업"
        report_nm_clean = (report_nm or "").strip()
        self.rule_engine.current_report_nm = report_nm_clean

        # 00. 정정공시 스페셜 케이스 처리 (정정항목 / 정정사유 정밀 추출)
        if "정정" in report_nm_clean:
            corr_item, corr_reason = self._extract_correction_info(raw_text)
            if corr_item or corr_reason:
                header = f"{display_name} - 정정 공시 안내"
                body_parts = []
                
                if corr_reason:
                    body_parts.append(f"▪ 정정사유: {corr_reason}")
                
                is_complex = False
                if corr_item:
                    if len(corr_item) >= 40 or "|" in corr_item or "[" in corr_item:
                        is_complex = True
                
                if corr_item and not is_complex:
                    body_parts.append(f"▪ 정정항목: {corr_item}")
                    
                # 상세 변경사항 추가 (최대 3개)
                # 단, 타법인주식, 전환청구권, 금전대여, 채무보증, 주요사항보고서, 공급계약, 영업정지 관련 정정은 세부 내역 생략
                if not any(k in report_nm_clean for k in ["타법인주식", "전환청구권", "금전대여", "채무보증", "주요사항보고서", "공급계약", "영업정지"]):
                    details = self._parse_correction_details(raw_text)
                    if details:
                        body_parts.extend(details[:3])
                    
                if not body_parts:
                    body_parts.append("▪ 정정사유: 세부 사항은 본문(상세보기)에서 확인하실 수 있습니다.")
                
                body = "\n".join(body_parts)
                return f"{header}\n\n{body}", "[]"

        # 00-20. 최대주주 등의 주식보유 변동 및 최대주주등소유주식변동신고서 스페셜 케이스 처리
        if any(k in report_nm_clean.replace(" ", "") for k in ["최대주주등의주식보유변동", "최대주주등소유주식변동신고서"]):
            share_desc = self._parse_major_shareholder_change(raw_text)
            if share_desc:
                header = f"{display_name} - {report_nm_clean}"
                return f"{header}\n\n{share_desc}", "[]"

        # 00-17. 기업지배구조보고서 및 대규모기업집단현황공시 스페셜 케이스 처리
        if any(k in report_nm_clean.replace(" ", "") for k in ["기업지배구조", "대규모기업집단", "주주총회소집공고", "합병등종료보고서", "증권신고서", "일괄신고", "임원ㆍ주요주주특정증권", "임상시험결과"]):
            header = f"{display_name} - {report_nm_clean}"
            return f"{header}\n\n▪ 본 공시는 세부 내용이 방대하므로 원문을 직접 열람하여 상세 현황을 확인하시기 바랍니다.", "[]"

        # 00-16. 주요사항보고서(유상증자결정) 스페셜 케이스 처리
        if "유상증자" in report_nm_clean.replace(" ", ""):
            increase_desc = self._parse_paid_in_capital_increase(raw_text)
            if increase_desc:
                header = f"{display_name} - {report_nm_clean}"
                return f"{header}\n\n▪ {increase_desc}", "[]"

        # 00-14. 전환청구권행사 스페셜 케이스 처리
        if "전환청구권행사" in report_nm_clean.replace(" ", ""):
            conv_desc = self._parse_convertible_exercise(raw_text)
            if conv_desc:
                header = f"{display_name} - 전환청구권행사 요약 정보"
                return f"{header}\n\n▪ {conv_desc}", "[]"

        # 00-18. 감자 스페셜 케이스 처리
        if "감자결정" in report_nm_clean.replace(" ", "") or "감자완료" in report_nm_clean.replace(" ", ""):
            capital_desc = self._parse_capital_reduction(raw_text)
            if capital_desc:
                header = f"{display_name} - {report_nm_clean}"
                return f"{header}\n\n{capital_desc}", "[]"

        # 00-19. 자기주식취득결정 스페셜 케이스 처리
        if "자기주식취득결정" in report_nm_clean.replace(" ", ""):
            treasury_desc = self._parse_treasury_stock_acquisition(raw_text)
            if treasury_desc:
                header = f"{display_name} - {report_nm_clean}"
                return f"{header}\n\n{treasury_desc}", "[]"

        # 00-16. 일괄신고, 증권발행실적, 소액공모 스페셜 케이스 처리
        if any(k in report_nm_clean.replace(" ", "") for k in ["증권발행실적보고서", "소액공모공시서류"]):
            issuance_desc = self._parse_securities_issuance(raw_text)
            if issuance_desc:
                header = f"{display_name} - {report_nm_clean}"
                return f"{header}\n\n{issuance_desc}", "[]"

        # 00-15. 소송등의판결·결정 스페셜 케이스 처리
        if "소송등의판결" in report_nm_clean.replace(" ", ""):
            ruling_desc = self._parse_lawsuit_ruling(raw_text)
            if ruling_desc:
                header = f"{display_name} - 소송등의 판결ㆍ결정 안내"
                return f"{header}\n\n▪ {ruling_desc}", "[]"

        # 00-12. 기업설명회(IR) 개최 스페셜 케이스 처리
        if "기업설명회" in report_nm_clean or "IR" in report_nm_clean:
            ir_desc = self._parse_ir_holding(raw_text)
            if ir_desc:
                header = f"{display_name} - 기업설명회(IR) 안내"
                return f"{header}\n\n- {ir_desc}", "[]"

        # 00-13. 주주명부폐쇄기간 또는 기준일 설정 스페셜 케이스 처리
        if "주주명부" in report_nm_clean:
            closure_desc = self._parse_shareholder_closure(raw_text)
            if closure_desc:
                header = f"{display_name} - 주주명부폐쇄기간 또는 기준일 설정 요약 정보"
                return f"{header}\n\n- {closure_desc}", "[]"

        # 00-0. 대량보유보고서 스페셜 케이스 처리
        if "대량보유" in report_nm_clean:
            holding_desc = self._parse_large_holding(raw_text)
            if holding_desc:
                header = f"{display_name} - 주식등의대량보유상황보고서"
                return f"{header}\n\n▪ {holding_desc}", "[]"

        # 00-1. 발행조건확정 스페셜 케이스 처리 (증권신고서)
        if "발행조건확정" in report_nm_clean or ("증권신고서" in report_nm_clean and "확정" in report_nm_clean):
            debt_desc = self._parse_debt_security_확정(raw_text)
            if debt_desc:
                header = f"{display_name} - 증권신고서(발행조건확정) 요약"
                return f"{header}\n\n▪ {debt_desc}", "[]"

        # 00-11. 자산취득/양수결정 스페셜 케이스 처리
        if any(k in report_nm_clean.replace(" ", "") for k in ["자산취득결정", "자산양수도", "자산처분"]):
            asset_desc = self._parse_asset_acquisition(raw_text)
            if asset_desc:
                header = f"{display_name} - {report_nm_clean} 요약"
                return f"{header}\n\n▪ {asset_desc}", "[]"

        # 00-10. 소송등의제기 스페셜 케이스 처리
        if "소송등의제기" in report_nm_clean.replace(" ", ""):
            lawsuit_desc = self._parse_lawsuit(raw_text)
            if lawsuit_desc:
                header = f"{display_name} - 소송등의 제기·신청 안내"
                return f"{header}\n\n▪ {lawsuit_desc}", "[]"

        # 00-9. 시장조치(주권매매거래정지/해제) 스페셜 케이스 처리
        if any(k in report_nm_clean for k in ["주권매매거래정지", "시장조치", "매매거래정지"]):
            market_desc = self._parse_market_action(raw_text)
            if market_desc:
                header = f"{display_name} - 시장조치 관련 안내"
                return f"{header}\n\n▪ {market_desc}", "[]"

        # 00-8. 대표이사변경 스페셜 케이스 처리
        if "대표이사변경" in report_nm_clean.replace(" ", ""):
            ceo_desc = self._parse_ceo_change(raw_text)
            if ceo_desc:
                header = f"{display_name} - 대표이사 변경 안내"
                return f"{header}\n\n▪ {ceo_desc}", "[]"

        # 00-7. 파산신청기각 스페셜 케이스 처리
        if "파산신청기각" in report_nm_clean.replace(" ", ""):
            dismiss_desc = self._parse_bankruptcy_dismissal(raw_text)
            if dismiss_desc:
                header = f"{display_name} - 파산신청 기각 결정 안내"
                return f"{header}\n\n▪ {dismiss_desc}", "[]"

        # 00-6. 주주총회결과 스페셜 케이스 처리 (의안 결의 내용 및 선임 이사 정보 추출)
        if "주주총회결과" in report_nm_clean.replace(" ", ""):
            meeting_desc = self._parse_general_meeting_results(raw_text)
            if meeting_desc:
                header = f"{display_name} - 주주총회 결과 안내"
                return f"{header}\n\n▪ {meeting_desc}", "[]"
                
        # 00-5. 불성실공시법인지정예고 스페셜 케이스 처리 (유형, 내용, 벌점 등 추출)
        if "불성실공시" in report_nm_clean.replace(" ", ""):
            unfaithful_desc = self._parse_unfaithful_disclosure(raw_text)
            if unfaithful_desc:
                header = f"{display_name} - 불성실공시법인 지정예고 안내"
                return f"{header}\n\n▪ {unfaithful_desc}", "[]"

        # 00-4. 감사보고서 스페셜 케이스 처리 (감사의견 추출)
        if "감사보고서" in report_nm_clean.replace(" ", "") or "감사의견" in report_nm_clean.replace(" ", ""):
            audit_desc = self._parse_audit_details(raw_text)
            if audit_desc:
                header = f"{display_name} - {report_nm_clean}"
                return f"{header}\n\n▪ {audit_desc}", "[]"
        
        # 00-3. 현금ㆍ현물배당결정 정밀 분석 (정량 지표 계산 및 자연어 결합)
        if "배당결정" in report_nm_clean.replace(" ", ""):
            dividend_desc = self._parse_dividend_details(raw_text)
            if dividend_desc:
                header = f"{display_name} - {report_nm_clean}"
                return f"{header}\n\n▪ {dividend_desc}", "[]"
        
        # 00-2. 단일판매ㆍ공급계약체결 정밀 분석 (정량 지표 계산 및 자연어 결합)
        if "공급계약체결" in report_nm_clean or "공급계약 체결" in report_nm_clean:
            contract_desc = self._parse_contract_details(raw_text)
            if contract_desc:
                header = f"{display_name} - 단일판매ㆍ공급계약 체결"
                return f"{header}\n\n▪ {contract_desc}", "[]"
        



        # 0. 임원/주요주주 특정증권등소유상황보고서 스페셜 케이스
        if "임원" in report_nm_clean and "주요주주" in report_nm_clean and "소유상황보고서" in report_nm_clean:
            header = self._build_quick_header(display_name, report_nm_clean)
            body = "임원 및 주요주주의 특정증권 소유현황이 변동되었습니다."
            return f"{header}\n\n{body}", "[]"




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
                
                header = f"{display_name} - {report_type} 보고서가 공시되었습니다."
                body = "현재 자동 추출된 실적 수치를 재검증 중입니다. 자세한 내용은 상단의 '상세보기'를 눌러 보고서 본문을 함께 확인해 주세요."
                return (header + "\n\n" + body).strip(), "[]"

        # 2. 그 외 공시 (Quick Mode)
        valid_sentences = [s for s in scored_sentences if s["score"] > 0]
        
        # 스코어링된 유효 문장이 없거나 부족할 경우 전체 문장을 후보군으로 자동 백업 활용
        if valid_sentences:
            valid_sentences.sort(key=lambda x: x["score"], reverse=True)
            candidates = valid_sentences[:20]
        else:
            candidates = scored_sentences[:20]

        def is_similar(a, b):
            ratio = SequenceMatcher(None, a, b).ratio()
            if ratio > 0.6:
                return True
            set_a = set(a.split())
            set_b = set(b.split())
            if len(set_a) == 0 or len(set_b) == 0:
                return False
            intersection = set_a.intersection(set_b)
            jaccard = len(intersection) / min(len(set_a), len(set_b))
            return jaccard > 0.6

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
            fallback_candidates = [s["content"] for s in scored_sentences if len(s["content"].strip()) >= 5]
            if fallback_candidates:
                fallback_body = "\n".join(f"- {self.rule_engine.clean_sentence(c)}" for c in fallback_candidates[:3])
                return f"{fallback_header}\n\n{fallback_body}", "[]"
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
            return "자동 분석 결과가 일부 어색할 수 있어요. 중요한 내용은 상단의 '상세보기'에서 보고서 본문을 함께 확인해 주세요."

        return "자세한 재무제표와 주석은 상단의 '상세보기'에서 보고서 원문으로 확인해 주세요."

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

        # DART API 사용한도 초과 또는 에러 응답 사전 차단 (ZIP 시그니처 체크)
        if not res.content.startswith(b"PK\x03\x04"):
            err_msg = "Unknown DART Error"
            try:
                err_data = res.json()
                err_msg = err_data.get("message", err_msg)
            except Exception:
                txt = res.text
                m = re.search(r"<message>(.*?)</message>", txt)
                if m:
                    err_msg = m.group(1)
                else:
                    err_msg = txt[:200]
            raise ValueError(f"DART API 에러 응답 수신: {err_msg} (추후 재시도 예정)")

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
        if "파일이 존재하지 않습니다" in parsed_text or "사용한도" in parsed_text or "초과하였습니다" in parsed_text or not parsed_text.strip() or len(parsed_text.strip()) < 15:
            raise ValueError("DART API 원문 파일이 아직 생성되지 않았거나 일시적인 부재/에러 상태입니다. (추후 재시도 예정)")
        return content, parsed_text

    def _is_already_processed(self, rcept_no) -> bool:
        cur = self.conn.cursor()
        try:
            cur.execute("SELECT 1 FROM summaries WHERE rcept_no = ?", (rcept_no,))
            return bool(cur.fetchone())
        finally:
            cur.close()

    def _save_to_db(self, filing, raw_text, scored_sentences, summary_text, top_ids_json, metrics, insight_text=None):
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
                    (rcept_no, summary_text, top_sentence_ids, insight_text)
                    VALUES (?, ?, ?, ?)
                """, (
                    filing["rcept_no"],
                    summary_text,
                    top_ids_json,
                    insight_text
                ))

                cur.execute("""
                    UPDATE summaries
                       SET summary_text = ?, top_sentence_ids = ?, insight_text = ?
                     WHERE rcept_no = ?
                """, (
                    summary_text,
                    top_ids_json,
                    insight_text,
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
        while True:
            today = datetime.date.today().strftime("%Y%m%d")
            try:
                engine.run_pipeline("", today, today)
            except Exception as e:
                logger.error("실행 중 오류 발생: %s", e)
            logger.info("다음 실행을 위해 10분 대기합니다...")
            time.sleep(600)
    finally:
        if engine:
            engine.close()
