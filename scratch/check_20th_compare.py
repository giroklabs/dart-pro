import sqlite3
import sys
sys.path.append("/Users/greego/Desktop/dart pro/lean_engine")
from core_engine import DartLeanEngine

def test_improvements_on_20th():
    conn = sqlite3.connect("lean_engine.db")
    cursor = conn.cursor()
    
    # 5월 20일 기재정정 중 실패 사례 몇 개 추출
    target_rcepts = ['20260520800005', '20260520800004', '20260520800171']
    
    engine = DartLeanEngine()
    
    print("=== 5월 20일 기재정정 공시 개선 전/후 비교 검토 ===")
    for r_no in target_rcepts:
        cursor.execute("""
            SELECT f.report_nm, f.raw_text, s.summary_text
            FROM filings f
            JOIN summaries s ON f.rcept_no = s.rcept_no
            WHERE f.rcept_no = ?
        """, (r_no,))
        row = cursor.fetchone()
        if not row:
            continue
            
        report_nm, raw_text, old_summary = row
        print("\n" + "="*60)
        print(f"공시명: {report_nm.strip()} ({r_no})")
        print("-"*40)
        print("[ 개선 전 요약본 ]")
        print(old_summary.strip())
        print("-"*40)
        
        # 실제 기업명 조회
        corp_name = "해당 기업"
        if "DL이앤씨" in old_summary:
            corp_name = "DL이앤씨"
        elif "DL" in old_summary:
            corp_name = "DL"
        elif "씨케이솔루션" in old_summary:
            corp_name = "씨케이솔루션"
            
        # 새 요약본 생성 테스트
        new_summary, _ = engine._build_summary(
            scored_sentences=[],
            report_nm=report_nm,
            metrics=[],
            corp_name=corp_name,
            raw_text=raw_text
        )
        print("[ 개선 후 요약본 ]")
        print(new_summary.strip())
        
    conn.close()

if __name__ == "__main__":
    test_improvements_on_20th()
