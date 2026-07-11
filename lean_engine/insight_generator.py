import sqlite3
import os
import json
import logging
import time
from datetime import datetime
from dotenv import load_dotenv

current_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(os.path.dirname(current_dir), ".env")
load_dotenv(env_path)

logger = logging.getLogger(__name__)

try:
    import google.generativeai as genai
    HAS_LLM = True
except ImportError:
    HAS_LLM = False

class InsightGenerator:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.api_key = os.environ.get("GEMINI_API_KEY")
        if HAS_LLM and self.api_key:
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel('gemini-2.5-flash')
        else:
            self.model = None

    def generate_daily_reports(self, target_date: str = None):
        if not target_date:
            target_date = datetime.now().strftime("%Y%m%d")

        if not self.model:
            logger.warning("LLM Model not configured. Skipping Insight Report generation.")
            return

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # 당일 공시 중 실적발표, 공급계약, 주요경영사항 등 핵심 공시 선별 (최대 5건)
        # 이미 ai_reports 에 있는 공시는 제외
        query = """
            SELECT f.rcept_no, f.corp_code, c.corp_name, f.report_nm, s.summary_text
            FROM filings f
            LEFT JOIN company_details c ON f.corp_code = c.corp_code
            JOIN summaries s ON f.rcept_no = s.rcept_no
            LEFT JOIN ai_reports ar ON f.rcept_no = ar.rcept_no
            WHERE f.rcept_dt = ?
            AND ar.rcept_no IS NULL
            AND (
                f.report_nm LIKE '%영업실적%' 
                OR f.report_nm LIKE '%단일판매%'
                OR f.report_nm LIKE '%유상증자%'
                OR f.report_nm LIKE '%무상증자%'
                OR f.report_nm LIKE '%합병%'
                OR f.report_nm LIKE '%분할%'
            )
            LIMIT 3
        """
        cursor.execute(query, (target_date,))
        targets = cursor.fetchall()

        if not targets:
            logger.info(f"[{target_date}] No new target disclosures found for AI Insight generation.")
            conn.close()
            return

        logger.info(f"[{target_date}] Found {len(targets)} disclosures for AI Insight generation.")

        for i, row in enumerate(targets):
            rcept_no, corp_code, corp_name, report_nm, summary_text = row
            # 무료 Gemini API: 분당 5건 한도 → 건당 15초 간격 (첫 건 제외)
            if i > 0:
                logger.info(f"Rate limit 방지: 15초 대기 중...")
                time.sleep(15)
            if not corp_name:
                corp_name = "알 수 없음"

            category = "기타"
            if "실적" in report_nm: category = "실적발표"
            elif "공급" in report_nm or "판매" in report_nm: category = "공급계약"
            elif "증자" in report_nm: category = "자본변동"
            elif "합병" in report_nm or "분할" in report_nm: category = "지배구조"

            prompt = f"""
            당신은 한국 주식 시장의 날카로운 인사이트를 제공하는 탑 티어 애널리스트입니다.
            다음은 '{corp_name}' 기업의 오늘 공시된 '{report_nm}' 내용 요약입니다.
            이 정보를 바탕으로 개인 투자자들이 투자 결정에 직관적으로 참고할 수 있는 "공시 인사이트 블로그 아티클"을 작성해주세요.

            [기업명]: {corp_name}
            [공시명]: {report_nm}
            [공시 요약 내용]:
            {summary_text}

            작성 지침:
            1. 이 공시가 기업의 향후 실적 및 주가 흐름에 미칠 단기/장기적 영향(호재·악재 여부)을 객관적으로 분석하세요.
            2. 계약 금액, 증자 규모 등 핵심 숫자가 있다면 전체 매출이나 기업 규모 대비 어느 정도 비중인지 그 의미를 쉽게 풀어 설명하세요.
            3. 개인 투자자가 앞으로 주목해야 할 핵심 지표와 어떻게 대응해야 할지에 대한 명확한 관전 포인트(액션 가이드)를 제시하세요.

            출력 형식은 다음 JSON을 정확히 따라주세요 (마크다운 코드 블록이나 기타 텍스트 없이 JSON 형태만 반환):
            {{
                "title": "흥미를 유발하면서도 핵심을 꿰뚫는 기사 제목 (예: [종목명] 2분기 어닝 서프라이즈, 주가 반등의 신호탄인가?)",
                "summary": "전체 분석 내용의 핵심만을 3문장 이내로 요약 (줄바꿈 없이)",
                "content_html": "<p><strong>[공시 요약 및 의미]</strong></p><p>내용...</p><p><strong>[주가 및 실적 파급력]</strong></p><p>내용...</p><p><strong>[투자자 액션 가이드]</strong></p><p>내용...</p> (HTML 태그로 감싸진 풍부하고 가독성 높은 본문. p, strong, ul, li 등 사용. CSS 스타일 속성 제외)"
            }}
            """

            try:
                response = self.model.generate_content(prompt)
                response_text = response.text.strip()
                
                # JSON 파싱 (코드블록 및 여분 텍스트 제거 처리)
                import re
                json_match = re.search(r'\{[\s\S]*\}', response_text)
                if not json_match:
                    raise ValueError("No JSON object found in response")
                response_text = json_match.group(0)

                result = json.loads(response_text)
                title = result.get("title", f"{corp_name} 주요 공시 분석")
                summary = result.get("summary", "")
                content = result.get("content_html", "<p>내용을 생성하지 못했습니다.</p>")

                # publish_date 생성 (YYYY.MM.DD 형식)
                publish_date = datetime.strptime(target_date, "%Y%m%d").strftime("%Y.%m.%d")

                # DB 저장
                cursor.execute("""
                    INSERT INTO ai_reports (rcept_no, corp_code, corp_name, category, title, summary, content, publish_date)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (rcept_no, corp_code, corp_name, category, title, summary, content, publish_date))
                
                conn.commit()
                logger.info(f"Successfully generated insight report for {rcept_no} ({corp_name})")

            except Exception as e:
                err_str = str(e)
                if '429' in err_str:
                    logger.warning(f"429 Rate limit for {rcept_no}. 65초 후 재시도...")
                    time.sleep(65)
                    try:
                        response = self.model.generate_content(prompt)
                        response_text = response.text.strip()
                        import re
                        json_match = re.search(r'\{[\s\S]*\}', response_text)
                        if json_match:
                            result = json.loads(json_match.group(0))
                            title = result.get("title", f"{corp_name} 주요 공시 분석")
                            summary = result.get("summary", "")
                            content = result.get("content_html", "<p>내용을 생성하지 못했습니다.</p>")
                            publish_date = datetime.strptime(target_date, "%Y%m%d").strftime("%Y.%m.%d")
                            cursor.execute("""
                                INSERT INTO ai_reports (rcept_no, corp_code, corp_name, category, title, summary, content, publish_date)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            """, (rcept_no, corp_code, corp_name, category, title, summary, content, publish_date))
                            conn.commit()
                            logger.info(f"Retry 성공: {rcept_no} ({corp_name})")
                    except Exception as retry_e:
                        logger.error(f"Retry 실패 {rcept_no}: {retry_e}")
                else:
                    logger.error(f"Failed to generate insight report for {rcept_no}: {e}")

        conn.close()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    db_path = os.path.join(os.path.dirname(current_dir), "lean_engine.db")
    generator = InsightGenerator(db_path)
    generator.generate_daily_reports()
