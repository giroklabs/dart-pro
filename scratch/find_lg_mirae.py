import sqlite3

conn = sqlite3.connect("lean_engine.db")
cursor = conn.cursor()

# 20260521에 올라온 공시 중 LG나 미래에셋 관련 또는 발행조건확정 관련 검색
cursor.execute("""
    SELECT rcept_no, report_nm, rcept_dt, corp_code
    FROM filings 
    WHERE rcept_dt = '20260521'
      AND (report_nm LIKE '%LG%' 
           OR report_nm LIKE '%미래%' 
           OR report_nm LIKE '%발행조건%'
           OR report_nm LIKE '%확정%'
           OR report_nm LIKE '%증권신고서%')
    ORDER BY rcept_no DESC
""")

print("=== TARGET DISCLOSURES ===")
for r in cursor.fetchall():
    print(f"[{r[0]}] {r[1]} | corp_code: {r[3]}")

conn.close()
