import sqlite3
import re

def check_20th():
    print("=== 5월 20일 공시 DB 데이터 분석 ===")
    conn = sqlite3.connect("lean_engine.db")
    cursor = conn.cursor()
    
    # 5월 20일 공시 개수 및 요약 존재 확인
    cursor.execute("""
        SELECT COUNT(*), COUNT(s.rcept_no)
        FROM filings f
        LEFT JOIN summaries s ON f.rcept_no = s.rcept_no
        WHERE f.rcept_dt = '20260520'
    """)
    total, summarized = cursor.fetchone()
    print(f"5월 20일 수집 공시 수: {total}건, 요약본 수: {summarized}건")
    
    # 5월 20일 요약본 중 실패 또는 Fallback 패턴 확인
    # '이 공시는 정형 표 형식이 많거나' 또는 '본문(상세보기)에서 확인하실 수 있습니다' 또는 '실시간 감시 관심 종목 대상' 등 fallback 키워드들
    cursor.execute("""
        SELECT f.rcept_no, f.report_nm, s.summary_text
        FROM filings f
        JOIN summaries s ON f.rcept_no = s.rcept_no
        WHERE f.rcept_dt = '20260520'
    """)
    rows = cursor.fetchall()
    
    fallback_count = 0
    empty_count = 0
    fine_count = 0
    failures = []
    
    for rcept_no, report_nm, summary in rows:
        summary_clean = summary.strip() if summary else ""
        if not summary_clean:
            empty_count += 1
            failures.append((rcept_no, report_nm, "빈 요약본"))
        elif "원문 확인이 필요합니다" in summary_clean or "상세보기" in summary_clean or "실시간 감시 관심 종목" in summary_clean:
            fallback_count += 1
            failures.append((rcept_no, report_nm, f"Fallback 요약: {summary_clean[:60]}..."))
        else:
            fine_count += 1
            
    print(f"정상 요약: {fine_count}건 | Fallback 요약: {fallback_count}건 | 빈 요약: {empty_count}건")
    
    if failures:
        print("\n--- 요약 오류/Fallback 사례 (최대 10건) ---")
        for i, (r_no, r_nm, reason) in enumerate(failures[:10]):
            print(f"({i+1}) 접수번호: {r_no} | 공시명: {r_nm.strip()} | 상태: {reason}")
            
    conn.close()

if __name__ == "__main__":
    check_20th()
