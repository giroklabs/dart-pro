import sys
import os

sys.path.append(os.path.abspath("lean_engine"))

from core_engine import DartLeanEngine

engine = DartLeanEngine()

# 임의의 삼일제약 최대주주등소유주식변동신고서 요약 빌드 시뮬레이션
summary, _ = engine._build_summary(
    scored_sentences=[],
    report_nm="최대주주등소유주식변동신고서",
    metrics=[],
    corp_code="000520",
    corp_name="삼일제약",
    raw_text="회사명 : 삼일제약(주) : 회사코드 : 000520 : 담당부서명 : 기획자금팀"
)

print("="*60)
print("빌드된 요약본:")
print(summary)
print("="*60)

engine.close()
