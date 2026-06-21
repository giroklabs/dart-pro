import sqlite3
import sys
import os

current_dir = os.path.dirname(os.path.abspath(__file__))
if "scratch" in current_dir:
    base_dir = os.path.dirname(current_dir)
else:
    base_dir = current_dir

sys.path.append(os.path.join(base_dir, "lean_engine"))
from core_engine import DartLeanEngine

engine = DartLeanEngine()
db_path = os.path.join(base_dir, "lean_engine.db")
conn = sqlite3.connect(db_path)

SPECIAL_KEYWORDS = [
    "기업설명회", "IR", "주주명부", "대량보유", "발행조건확정", "증권신고서", 
    "자산취득결정", "자산양수도", "자산처분", "소송등의제기", "소송등의판결", 
    "주권매매거래정지", "시장조치", "매매거래정지", "대표이사변경", "파산신청기각", 
    "주주총회결과", "불성실공시", "감사보고서", "감사의견", "전환청구권행사"
]

cursor = conn.cursor()
cursor.execute("SELECT rcept_no, report_nm, corp_code, raw_text FROM filings WHERE rcept_dt='20260522'")
rows = cursor.fetchall()

special_list = []
general_list = []

for rcept_no, report_nm, corp_code, raw_text in rows:
    report_clean = report_nm.replace(" ", "")
    is_special = any(k in report_clean for k in SPECIAL_KEYWORDS)
    
    if is_special:
        special_list.append(report_nm)
    else:
        # 일반 공시 간략화 시뮬레이션
        sentences = engine.rule_engine.split_sentences(raw_text)
        scored_sentences = [
            {"content": s, "score": engine.rule_engine.score_sentence(s, i, len(sentences))}
            for i, s in enumerate(sentences)
        ]
        # 테이블 문장 완전 배제
        text_only = [s for s in scored_sentences if not s['content'].startswith("[테이블]") and s['content'].strip()]
        # 스코어 순 정렬
        text_only.sort(key=lambda x: x['score'], reverse=True)
        # 상위 1~2문장 추출
        top_2 = [s['content'] for s in text_only[:2]]
        general_list.append({"report_nm": report_nm, "top_sentences": top_2})

print("=== 투트랙 시뮬레이션 결과 (2026-05-22 기준) ===")
print(f"1. 전용 파서 처리 대상 (중요 공시): 총 {len(special_list)}건")
for s in special_list[:5]:
    print(f"  - {s}")
print("  - ... (생략)")

print(f"\n2. 텍스트 추출 간략화 대상 (일반 공시): 총 {len(general_list)}건")
for g in general_list[:15]:
    print(f"\n[공시명] {g['report_nm']}")
    for s in g['top_sentences']:
        print(f"  - {s}")

conn.close()
