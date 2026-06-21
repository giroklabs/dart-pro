import sys
import os
import re

sys.path.append(os.path.abspath("lean_engine"))
from core_engine import DartLeanEngine

engine = DartLeanEngine()

test_raw_text = """
최대주주 등의 주식보유 변동
[테이블]
구분 | 주주명 | 동일인과의 관계 | 변동일 | 주식의 종류 | 변동전 주식수 | 지분율(A) | 증감 주식수 | 지분율 | 변동후 주식수 | 지분율(C) | 취득금액 | 단가
동일인및동일인관련자 | 코오롱인더스트리(주) | 계열회사(국내) | 2026.06.18 | 보통주 | 9,100,000 | 95.92 | 139,800 | 1.47 | 9,239,800 | 97.40 | 46,311 | 0.31
동일인및동일인관련자 | 재단법인꽃과어린이왕자 | 비영리법인 | 2026.06.18 | 보통주 | 139,800 | 1.47 | -139,800 | -1.47 | 0 | 0.00 | -46,311 | 0.31
"""

summary = engine._parse_major_shareholder_change(test_raw_text)
print("Parsed Summary Result:")
print(summary)

engine.close()
