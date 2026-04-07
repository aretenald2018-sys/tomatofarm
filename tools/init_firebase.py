#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Firebase에 샘플 영화 데이터 추가"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import requests
import json
from datetime import datetime

FIREBASE_URL = "https://firestore.googleapis.com/v1/projects/exercise-management/databases/(default)/documents/movies"
FIREBASE_KEY = "AIzaSyCk2czvJ8DRautrUput8TLjdrArpQm7BBk"

def save_movie_data(year, month, events):
    """Firebase에 영화 데이터 저장"""
    key = f"{year}-{month:02d}"

    firestore_doc = {
        "fields": {
            "year": {"integerValue": str(year)},
            "month": {"integerValue": str(month)},
            "events": {
                "arrayValue": {
                    "values": [
                        {
                            "mapValue": {
                                "fields": {
                                    "date": {"integerValue": str(e['date'])},
                                    "title": {"stringValue": e['title']},
                                    "tags": {
                                        "arrayValue": {
                                            "values": [{"stringValue": tag} for tag in e.get('tags', ['release'])]
                                        }
                                    }
                                }
                            }
                        }
                        for e in events
                    ]
                }
            },
            "lastUpdated": {"stringValue": datetime.now().isoformat()},
            "source": {"stringValue": "muko.kr/calender"}
        }
    }

    url = f"{FIREBASE_URL}/{key}?key={FIREBASE_KEY}"

    try:
        response = requests.patch(
            url,
            json=firestore_doc,
            timeout=10,
            headers={'Content-Type': 'application/json'}
        )

        if response.status_code in [200, 201]:
            print(f"✅ {key} 저장 완료 ({len(events)}개 이벤트)")
            return True
        else:
            print(f"❌ {key} 저장 실패: HTTP {response.status_code}")
            print(f"   {response.text[:200]}")
            return False

    except Exception as e:
        print(f"❌ {key} 저장 오류: {e}")
        return False

# 샘플 데이터 (실제 무코 캘린더에서 수집한 데이터)
SAMPLE_DATA = {
    2026: {
        3: [  # 2026년 3월
            {'date': 1, 'title': '2026 롯데시네마 아카데미 기획전', 'tags': ['premiere']},
            {'date': 3, 'title': '<센티멘탈 밸류> 영문 각본집 증정 상영회', 'tags': ['screening']},
            {'date': 5, 'title': '우리에게는 아직 내일이 있다', 'tags': ['release']},
            {'date': 7, 'title': '에반게리온 30주년 무비 페스티벌', 'tags': ['festival']},
            {'date': 10, 'title': '<호퍼스> 개봉 전 특별 상영회', 'tags': ['screening']},
            {'date': 12, 'title': '2026 메가박스 아카데미 기획전', 'tags': ['premiere']},
            {'date': 14, 'title': '<렌탈 패밀리> 사부작 상영회', 'tags': ['gv']},
            {'date': 16, 'title': '<브라이드!> 개봉 기념 굿즈 상영회', 'tags': ['release']},
            {'date': 19, 'title': '<허밍> 스페셜 GV', 'tags': ['gv']},
            {'date': 21, 'title': '라이카시네마 2관 개관 기획전', 'tags': ['premiere']},
            {'date': 23, 'title': '씨네큐브 2026 아카데미 화제작 열전', 'tags': ['screening']},
            {'date': 25, 'title': '<간첩사냥> 관객과의 대화', 'tags': ['gv']},
            {'date': 28, 'title': '2026 CGV 아카데미 기획전', 'tags': ['premiere']},
        ],
        4: [  # 2026년 4월
            {'date': 2, 'title': '아바타: 물의 길', 'tags': ['release']},
            {'date': 5, 'title': '결혼해줄래?', 'tags': ['release']},
            {'date': 8, 'title': '굿 윌 헌팅', 'tags': ['rerelease']},
            {'date': 12, 'title': '<브라이드!> 개봉', 'tags': ['release']},
            {'date': 15, 'title': '우리는 매일매일', 'tags': ['premiere']},
            {'date': 18, 'title': '호퍼스', 'tags': ['release']},
            {'date': 22, 'title': '다이 마이 러브', 'tags': ['release']},
            {'date': 25, 'title': '무귀객', 'tags': ['premiere']},
            {'date': 28, 'title': '좀비 랜드 사가: 유메긴가 파라다이스', 'tags': ['gv']},
        ]
    }
}

if __name__ == '__main__':
    print("\n📊 Firebase 샘플 데이터 초기화\n")

    success_count = 0
    total_count = 0

    for year, months in SAMPLE_DATA.items():
        for month, events in months.items():
            total_count += 1
            if save_movie_data(year, month, events):
                success_count += 1

    print(f"\n결과: {success_count}/{total_count} 저장 성공")

    if success_count == total_count:
        print("\n🎉 모든 데이터가 Firebase에 저장되었습니다!")
        print("   대시보드를 새로고침하면 영화 탭에 데이터가 나타납니다.")
    else:
        print(f"\n⚠️  {total_count - success_count}개 항목 저장 실패")
        print("   Firebase 연결을 확인해주세요.")
