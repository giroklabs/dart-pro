import sys
import os
sys.path.append("/Users/greego/Desktop/dart pro/lean_engine")
from core_engine import DartLeanEngine
import datetime

engine = DartLeanEngine()
# 강제 덮어쓰기를 위해 _is_already_processed가 항상 False를 리턴하도록 패칭
engine._is_already_processed = lambda rcept_no: False

today = "20260521"
print(f"=== {today} 전체 공시 강제 재빌드 및 NLG 모델 반영 시작 ===")
try:
    engine.run_pipeline(corp_code=None, bgn_de=today, end_de=today)
    print("=== 재빌드 성공 완료 ===")
finally:
    engine.close()
