#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Firebase에 더 완전한 영화 데이터 추가"""

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
            return False

    except Exception as e:
        print(f"❌ {key} 저장 오류: {e}")
        return False

# 더 완전한 영화 데이터 (muko.kr 스크린샷 기반)
COMPLETE_DATA = {
    2026: {
        3: [  # 2026년 3월
            {'date': 1, 'title': '2026 부산시네마 아차데', 'tags': ['premiere']},
            {'date': 1, 'title': '2월 타쿠나마타타 메가 애니 기획전', 'tags': ['screening']},
            {'date': 1, 'title': '센티멘탈 밸류 기획전', 'tags': ['screening']},
            {'date': 1, 'title': '에반게리온 30주년 무비 페스티벌', 'tags': ['festival']},
            {'date': 3, 'title': '<센티멘탈 밸류> 영문 각본집 증정 상영회', 'tags': ['screening']},
            {'date': 3, 'title': '2026 메가박스 아카데미 기획전', 'tags': ['premiere']},
            {'date': 3, 'title': '라이카시네마 2관 개관 기획전', 'tags': ['premiere']},
            {'date': 5, 'title': '우리에게는 아직 내일이 있다', 'tags': ['release']},
            {'date': 5, 'title': '씨네큐브 2026 아카데미 화제작 열전', 'tags': ['screening']},
            {'date': 7, 'title': '에반게리온 30주년 무비 페스티벌', 'tags': ['festival']},
            {'date': 7, 'title': '도인스 VR 로맨스', 'tags': ['gv']},
            {'date': 10, 'title': '<호퍼스> 개봉 전 특별 상영회', 'tags': ['screening']},
            {'date': 10, 'title': '2026 CGV 아카데미 기획전', 'tags': ['premiere']},
            {'date': 12, 'title': '<센티멘탈 밸류> 집 배지 패키지 상영회', 'tags': ['screening']},
            {'date': 12, 'title': '2026 메가박스 아카데미 기획전', 'tags': ['premiere']},
            {'date': 12, 'title': '2026 롯데시네마 아카데미 기획전', 'tags': ['premiere']},
            {'date': 14, 'title': '<렌탈 패밀리> 사부작 상영회', 'tags': ['gv']},
            {'date': 14, 'title': '<폭풍의 언덕> 앵콜! 뱃지 패키지 상영회', 'tags': ['screening']},
            {'date': 14, 'title': '씨네큐브 2026 아카데미 화제작 열전', 'tags': ['screening']},
            {'date': 16, 'title': '<브라이드!> 개봉 기념 굿즈 상영회', 'tags': ['release']},
            {'date': 18, 'title': '<센티멘탈 밸류> 자매 포스터 증정 상영회', 'tags': ['screening']},
            {'date': 18, 'title': '라이카시네마 2관 개관 기획전', 'tags': ['premiere']},
            {'date': 19, 'title': '<허밍> 스페셜 GV', 'tags': ['gv']},
            {'date': 19, 'title': '<우리에게 아직 내일이 있다> 메가박스 회원 시사회', 'tags': ['premiere']},
            {'date': 20, 'title': '<다이 마이 러브> LOVE & HATE 배지 상영회', 'tags': ['screening']},
            {'date': 21, 'title': '라이카시네마 2관 개관 기획전', 'tags': ['premiere']},
            {'date': 21, 'title': '<투어스 VR 콘서트> 특별 무대인사', 'tags': ['vip']},
            {'date': 23, 'title': '씨네큐브 2026 아카데미 화제작 열전', 'tags': ['screening']},
            {'date': 24, 'title': '<영화 러브 라이브!> 응원봉 리액션 상영회', 'tags': ['gv']},
            {'date': 25, 'title': '<간첩사냥> 관객과의 대화', 'tags': ['gv']},
            {'date': 25, 'title': '<렌탈 패밀리> 굿즈 증정 상영회', 'tags': ['screening']},
            {'date': 28, 'title': '2026 CGV 아카데미 기획전', 'tags': ['premiere']},
            {'date': 28, 'title': '라이카시네마 2관 개관 기획전', 'tags': ['premiere']},
            {'date': 30, 'title': '<신 에반게리온 극장판> 굿즈패키지 상영회', 'tags': ['gv']},
        ],
        4: [  # 2026년 4월
            {'date': 2, 'title': '아바타: 물의 길', 'tags': ['release']},
            {'date': 2, 'title': '2026 CGV 아카데미 기획전', 'tags': ['premiere']},
            {'date': 5, 'title': '결혼해줄래?', 'tags': ['release']},
            {'date': 5, 'title': '<스파이드> 스트링 로드 상영회', 'tags': ['gv']},
            {'date': 8, 'title': '굿 윌 헌팅', 'tags': ['rerelease']},
            {'date': 8, 'title': '라이카시네마 2관 개관 기획전', 'tags': ['premiere']},
            {'date': 12, 'title': '<브라이드!> 개봉 기념 스페셜 상영회', 'tags': ['screening']},
            {'date': 12, 'title': '2026 롯데시네마 아카데미 기획전', 'tags': ['premiere']},
            {'date': 15, 'title': '우리는 매일매일', 'tags': ['premiere']},
            {'date': 15, 'title': '씨네큐브 2026 아카데미 화제작 열전', 'tags': ['screening']},
            {'date': 18, 'title': '호퍼스', 'tags': ['release']},
            {'date': 18, 'title': '라이카시네마 2관 개관 기획전', 'tags': ['premiere']},
            {'date': 22, 'title': '다이 마이 러브', 'tags': ['release']},
            {'date': 22, 'title': '<레이의 겨울방학> GV', 'tags': ['gv']},
            {'date': 25, 'title': '무귀객', 'tags': ['premiere']},
            {'date': 28, 'title': '좀비 랜드 사가: 유메긴가 파라다이스', 'tags': ['gv']},
            {'date': 28, 'title': '2026 롯데시네마 아카데미 기획전', 'tags': ['premiere']},
        ]
    }
}

if __name__ == '__main__':
    print("\n📊 Firebase 완전한 영화 데이터 초기화\n")

    success_count = 0
    total_count = 0
    total_events = 0

    for year, months in COMPLETE_DATA.items():
        for month, events in months.items():
            total_count += 1
            total_events += len(events)
            if save_movie_data(year, month, events):
                success_count += 1

    print(f"\n결과: {success_count}/{total_count} 저장 성공")
    print(f"총 {total_events}개 이벤트 저장됨")

    if success_count == total_count:
        print("\n🎉 모든 데이터가 Firebase에 저장되었습니다!")
        print("   대시보드를 새로고침하면 훨씬 더 많은 영화 데이터가 표시됩니다.")
    else:
        print(f"\n⚠️  {total_count - success_count}개 항목 저장 실패")
