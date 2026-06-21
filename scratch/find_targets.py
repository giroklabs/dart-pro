import sqlite3

conn = sqlite3.connect("lean_engine.db")
cursor = conn.cursor()

# LG전자 또는 미래에셋(혹은 미래에셋증권) 관련 공시가 filings에 있는지 확인
cursor.execute("""
    SELECT rcept_no, report_nm, rcept_dt, corp_code
    FROM filings 
    WHERE report_nm LIKE '%발행조건확정%' 
       OR report_nm LIKE '%증권발행실적보고서%'
       OR report_nm LIKE '%증권신고서(채무증권)%'
    ORDER BY rcept_dt DESC
    LIMIT 20
""")

print("=== DEBT/ISSUANCE DISCLOSURES ===")
for r in cursor.fetchall():
    print(f"[{r[0]}] {r[1]} ({r[2]}) | corp_code: {r[3]}")

conn.close()
