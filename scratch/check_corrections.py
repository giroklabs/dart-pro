import sqlite3

def check_db():
    conn = sqlite3.connect("lean_engine.db")
    cursor = conn.cursor()
    
    # 정정공시 조회
    cursor.execute("""
        SELECT f.rcept_no, f.report_nm, f.raw_text, s.summary_text
        FROM filings f
        LEFT JOIN summaries s ON f.rcept_no = s.rcept_no
        WHERE f.report_nm LIKE '%정정%'
        LIMIT 5
    """)
    
    rows = cursor.fetchall()
    print(f"조회된 정정공시 수: {len(rows)}")
    for rcept_no, report_nm, raw_text, summary_text in rows:
        print("="*60)
        print(f"접수번호: {rcept_no}")
        print(f"공시명: {report_nm}")
        print(f"기존 요약본:\n{summary_text}")
        print("-"*40)
        print("본문 내용 일부:")
        # 줄별로 50줄 출력
        lines = raw_text.split('\n')
        for i, line in enumerate(lines[:60]):
            print(f"{i+1:3d}: {line}")
            
    conn.close()

if __name__ == "__main__":
    check_db()
