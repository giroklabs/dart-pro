import sqlite3

def check_dl_text():
    conn = sqlite3.connect("lean_engine.db")
    cursor = conn.cursor()
    
    for r_no in ['20260520800005', '20260520800004']:
        cursor.execute("SELECT report_nm, raw_text FROM filings WHERE rcept_no = ?", (r_no,))
        row = cursor.fetchone()
        if row:
            report_nm, raw_text = row
            print("="*60)
            print(f"공시명: {report_nm} ({r_no})")
            print("본문 내용 40줄:")
            lines = raw_text.split('\n')
            for i, line in enumerate(lines[:40]):
                print(f"{i+1:3d}: {line}")
    conn.close()

if __name__ == "__main__":
    check_dl_text()
