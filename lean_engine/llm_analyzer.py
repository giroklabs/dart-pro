import sqlite3
import os
import json
import logging
import re
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

class NightlyLLMAnalyzer:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self.api_key = os.environ.get("GEMINI_API_KEY")
        if HAS_LLM and self.api_key:
            genai.configure(api_key=self.api_key)
            self.model = genai.GenerativeModel('gemini-2.5-flash')
        else:
            self.model = None

    def analyze_today_noise(self, target_date: str = None):
        if not target_date:
            target_date = datetime.now().strftime("%Y%m%d")

        if not self.model:
            logger.warning("LLM Model not configured. Skipping LLM analysis.")
            return

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # 당일 처리된 요약문 가져오기 (테이블 파싱 오류나 특수기호 잔재 등 노이즈 의심 문장 선별)
        cursor.execute("""
            SELECT s.rcept_no, f.report_nm, s.summary_text 
            FROM summaries s 
            JOIN filings f ON s.rcept_no = f.rcept_no 
            WHERE f.rcept_dt = ?
        """, (target_date,))
        
        rows = cursor.fetchall()
        suspect_sentences = []
        
        for rcept_no, report_nm, text in rows:
            if not text:
                continue
            lines = text.split('\n')
            for line in lines:
                line = line.strip()
                # 룰을 통과했지만 여전히 특수문자가 많거나 메타데이터 성격이 강한 문장 의심
                special_ratio = sum(1 for ch in line if ch in '/[]|:{}\\<>#_') / max(len(line), 1)
                if special_ratio >= 0.05 or len(line) < 15 or "보고서" in line or "일자" in line:
                    suspect_sentences.append({"report_nm": report_nm, "sentence": line})

        if not suspect_sentences:
            logger.info("No suspicious noise sentences found for today.")
            conn.close()
            return

        # 샘플링하여 LLM 전송 (비용/속도 최적화)
        sample_size = min(len(suspect_sentences), 50)
        samples = suspect_sentences[:sample_size]

        prompt = f"""
        다음은 한국 DART 기업공시 요약 시스템에서 추출된 문장들입니다. 
        이 중 투자자에게 무의미한 단순 메타데이터(예: 목차, 서식, 안내문, 기호 깨짐, 담당자 연락처, 문서번호 등) 노이즈를 찾아내고,
        해당 노이즈를 앞으로 차단할 수 있는 공통 KEYWORD 또는 파이썬 정규식(REGEX) 패턴을 추천해주세요.

        형식은 반드시 다음 JSON 배열 형태여야 합니다:
        [
            {{"rule_type": "KEYWORD", "pattern": "추천키워드", "reason": "이유"}},
            {{"rule_type": "REGEX", "pattern": "추천정규식", "reason": "이유"}}
        ]
        
        검사할 문장들:
        {json.dumps(samples, ensure_ascii=False, indent=2)}
        """

        try:
            response = self.model.generate_content(prompt)
            response_text = response.text.strip()
            
            # JSON 파싱 (정규식을 통한 리스트 추출)
            match = re.search(r'\[.*\]', response_text, re.DOTALL)
            if match:
                response_text = match.group(0)

            new_rules = json.loads(response_text)
            
            # DB 삽입
            inserted_count = 0
            for rule in new_rules:
                r_type = rule.get("rule_type")
                pattern = rule.get("pattern")
                if r_type in ["KEYWORD", "REGEX"] and pattern:
                    # 중복 확인
                    cursor.execute("SELECT 1 FROM noise_rules WHERE pattern = ?", (pattern,))
                    if not cursor.fetchone():
                        cursor.execute("INSERT INTO noise_rules (rule_type, pattern) VALUES (?, ?)", (r_type, pattern))
                        inserted_count += 1
            
            conn.commit()
            logger.info(f"LLM Analyzer generated and inserted {inserted_count} new noise rules.")

        except Exception as e:
            logger.error(f"Error during LLM analysis: {e}")
        finally:
            conn.close()

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    current_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(os.path.dirname(current_dir), "lean_engine.db")
    analyzer = NightlyLLMAnalyzer(db_path)
    # 오늘 날짜 기준으로 실행
    analyzer.analyze_today_noise()
