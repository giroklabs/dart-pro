import sys
import sqlite3
sys.path.append("/Users/greego/Desktop/dart pro/lean_engine")
from core_engine import DartLeanEngine

def test_db_corrections():
    conn = sqlite3.connect("lean_engine.db")
    cursor = conn.cursor()
    
    # 5.18 DMS 공시 접수번호
    cursor.execute("""
        SELECT rcept_no, report_nm, raw_text
        FROM filings
        WHERE rcept_no = '20260518000035'
    """)
    row = cursor.fetchone()
    
    if row:
        rcept_no, report_nm, raw_text = row
        print(f"테스트 대상 공시: {report_nm} ({rcept_no})")
        
        # 린 엔진 초기화
        engine = DartLeanEngine()
        
        # 파싱 실행
        summary, sentence_ids = engine._build_summary(
            scored_sentences=[],
            report_nm=report_nm,
            metrics=[],
            corp_code="00213075", # 디엠에스 기업코드
            corp_name="디엠에스",
            raw_text=raw_text
        )
        
        print("\n[ 생성된 요약본 ]")
        print(summary)
        print("="*60)
    else:
        print("대상을 찾지 못했습니다.")
        
    conn.close()

if __name__ == "__main__":
    test_db_corrections()
