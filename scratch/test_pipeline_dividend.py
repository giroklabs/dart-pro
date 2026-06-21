import sys
import os

sys.path.append(os.path.join(os.path.dirname(os.path.dirname(__file__)), "lean_engine"))
from core_engine import DartLeanEngine

def test():
    engine = DartLeanEngine()
    cur = engine.conn.cursor()
    cur.execute("SELECT raw_text, report_nm, corp_code FROM filings WHERE rcept_no = '20260514901627'")
    row = cur.fetchone()
    if not row:
        print("공시 데이터를 찾을 수 없습니다.")
        return
        
    raw_text, report_nm, corp_code = row
    
    # 임의로 corp_name 지정
    corp_name = "SV인베스트먼트"
    
    print("공시명:", report_nm)
    print("="*60)
    
    summary_text, top_ids = engine._build_summary(
        scored_sentences=[],
        report_nm=report_nm,
        metrics=[],
        corp_code=corp_code,
        period_label=None,
        corp_name=corp_name,
        raw_text=raw_text
    )
    
    print("빌드된 요약본:")
    print(summary_text)
    print("="*60)
    
    engine.close()

if __name__ == "__main__":
    test()
