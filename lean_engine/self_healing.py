import os
import re
import sqlite3
import logging
import threading
import requests

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

def trigger_self_healing(db_path: str, rcept_no: str, report_nm: str, score: float, summary_text: str):
    # 1. 예외 감지: '[테이블]' 문구가 여전히 남아있는 경우에만 자가 치유 작동
    if "[테이블]" not in summary_text:
        return
    
    # 2. 스마트 비용 제어 필터링: 중요 등급(스코어 2.5점 이상)일 때만 API 호출 허용
    if score < 2.5:
        logger.debug("[SelfHealing] Skip healing for rcept_no: %s (score %s < 2.5)", rcept_no, score)
        return

    if not GEMINI_API_KEY:
        logger.warning("[SelfHealing] GEMINI_API_KEY is not set. Skipping self healing.")
        return

    # 백그라운드 스레드로 비동기 처리
    t = threading.Thread(
        target=_run_self_healing,
        args=(db_path, rcept_no, report_nm, summary_text)
    )
    t.daemon = True
    t.start()

def _run_self_healing(db_path: str, rcept_no: str, report_nm: str, summary_text: str):
    logger.info("[SelfHealing] Started background healing for rcept_no: %s", rcept_no)
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    headers = {"Content-Type": "application/json"}
    
    prompt = (
        "너는 기업 공시 분석 요약 전문가야. 아래의 요약문 텍스트 내에 포함된 어색한 '[테이블]' 형태의 행 기호와 수치 나열을 지우고, "
        "매우 가독성이 높고 매끄러운 한글 자연어 불릿 포인트 문장으로 다듬어줘.\n"
        "다른 인사말이나 잡담 없이 오직 정제된 한글 요약 결과 텍스트만 출력해줘.\n\n"
        "대상 텍스트:\n"
        f"{summary_text}"
    )
    
    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 400
        }
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=25)
        response.raise_for_status()
        res_json = response.json()
        
        candidates = res_json.get("candidates", [])
        if not candidates:
            logger.warning("[SelfHealing] No candidates returned from Gemini Flash.")
            return
            
        parts = candidates[0].get("content", {}).get("parts", [])
        if not parts:
            logger.warning("[SelfHealing] No parts returned from Gemini Flash.")
            return
            
        healed_text = parts[0].get("text", "").strip()
        if not healed_text or "[테이블]" in healed_text:
            logger.warning("[SelfHealing] Gemini Flash failed to remove [테이블] or returned empty.")
            return

        # DB 업데이트
        conn = sqlite3.connect(db_path)
        cur = conn.cursor()
        try:
            with conn:
                cur.execute("""
                    UPDATE summaries
                       SET summary_text = ?
                     WHERE rcept_no = ?
                """, (healed_text, rcept_no))
            logger.info("[SelfHealing] Success! Updated database summary for rcept_no: %s", rcept_no)
        except Exception as db_err:
            logger.error("[SelfHealing] DB update failed: %s", db_err)
        finally:
            conn.close()
            
    except Exception as api_err:
        logger.error("[SelfHealing] Gemini API request failed: %s", api_err)
