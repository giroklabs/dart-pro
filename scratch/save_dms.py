import sqlite3

def save_raw():
    conn = sqlite3.connect("lean_engine.db")
    cursor = conn.cursor()
    cursor.execute("SELECT raw_text FROM filings WHERE rcept_no = '20260518000035'")
    row = cursor.fetchone()
    if row:
        with open("scratch/dms_raw.txt", "w", encoding="utf-8") as f:
            f.write(row[0])
        print("dms_raw.txt saved successfully.")
    conn.close()

if __name__ == "__main__":
    save_raw()
