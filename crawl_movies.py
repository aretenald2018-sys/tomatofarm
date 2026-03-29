#!/usr/bin/env python3
# -*- coding: utf-8 -*-
# ================================================================
# crawl_movies.py
# Python + requests + BeautifulSoup로 무코 캘린더 크롤링
# ================================================================

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import requests
from bs4 import BeautifulSoup
import json
from datetime import datetime, timedelta
import time

# Firebase 저장을 위한 간단한 REST API
FIREBASE_URL = "https://firestore.googleapis.com/v1/projects/exercise-management/databases/(default)/documents/movies"
FIREBASE_KEY = "AIzaSyCk2czvJ8DRautrUput8TLjdrArpQm7BBk"

MUKO_URL = "https://muko.kr/calender"

TAG_MAP = {
    '시사회': 'premiere',
    'GV': 'gv',
    '상영회': 'screening',
    '개봉일': 'release',
    '재개봉': 'rerelease',
    '무대인사': 'vip',
    '영화제': 'festival',
}

def crawl_muko(year, month):
    """무코에서 영화 데이터 크롤링"""
    print(f"\n[crawl] {year}년 {month:02d}월 크롤링 시작...")

    try:
        # 1. 페이지 요청
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
        response = requests.get(MUKO_URL, headers=headers, timeout=10)
        response.encoding = 'utf-8'

        if response.status_code != 200:
            print(f"[crawl] HTTP {response.status_code}")
            return None

        # 2. HTML 파싱
        soup = BeautifulSoup(response.text, 'html.parser')

        # 3. 이벤트 링크 찾기
        events_dict = {}
        links = soup.find_all('a', href=True)

        for link in links:
            href = link.get('href', '')
            text = link.get_text(strip=True)

            # /calender/로 시작하고 숫자가 아닌 링크
            if not href.startswith('/calender/'):
                continue
            if href.startswith('/calender/category/'):
                continue
            if href.startswith('/calender/selected_month/'):
                continue

            # [HH:MM~HH:MM] 영화제목 형식
            if not text.startswith('['):
                continue

            # 날짜 추출
            # 링크의 부모 요소들을 탐색해서 날짜 찾기
            parent = link.parent
            date_num = None

            for _ in range(5):
                if parent is None:
                    break

                # data 속성에서 날짜 찾기
                if parent.has_attr('data-day'):
                    date_num = int(parent.get('data-day'))
                    break
                if parent.has_attr('data-date'):
                    date_num = int(parent.get('data-date'))
                    break

                # 텍스트에서 날짜 찾기 (숫자만)
                parent_text = parent.get_text()
                for word in parent_text.split():
                    if word.isdigit():
                        num = int(word)
                        if 1 <= num <= 31:
                            date_num = num
                            break

                if date_num:
                    break
                parent = parent.parent

            if not date_num or date_num > 31:
                continue

            # 제목 추출
            # "[HH:MM~HH:MM] 제목" 형식
            match_text = text
            if '] ' in match_text:
                title = match_text.split('] ', 1)[1]
            else:
                title = match_text

            # 태그 추출
            tags = []
            for korean, tag_id in TAG_MAP.items():
                if korean in title or korean in text:
                    tags.append(tag_id)

            if not tags:
                tags = ['release']  # 기본값

            # 중복 제거
            tags = list(set(tags))

            if date_num not in events_dict:
                events_dict[date_num] = []

            events_dict[date_num].append({
                'title': title,
                'tags': tags
            })

        # 4. 이벤트 포맷팅
        events = []
        for date_num in sorted(events_dict.keys()):
            for event in events_dict[date_num]:
                events.append({
                    'date': date_num,
                    'title': event['title'],
                    'tags': event['tags']
                })

        if not events:
            print(f"[crawl] 이벤트를 찾을 수 없습니다")
            return None

        print(f"[crawl] {len(events)}개의 이벤트를 찾았습니다")

        return {
            'year': year,
            'month': month,
            'events': events,
            'lastUpdated': datetime.now().isoformat(),
            'source': 'muko.kr/calender'
        }

    except Exception as e:
        print(f"[crawl] 오류: {e}")
        return None

def save_to_firebase_rest(data):
    """REST API로 Firebase에 저장"""
    if not data:
        return False

    try:
        key = f"{data['year']}-{data['month']:02d}"

        # Firestore REST API 형식
        firestore_doc = {
            "fields": {
                "year": {"integerValue": str(data['year'])},
                "month": {"integerValue": str(data['month'])},
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
                                                "values": [{"stringValue": tag} for tag in e['tags']]
                                            }
                                        }
                                    }
                                }
                            }
                            for e in data['events']
                        ]
                    }
                },
                "lastUpdated": {"stringValue": data['lastUpdated']},
                "source": {"stringValue": data['source']}
            }
        }

        url = f"{FIREBASE_URL}/{key}?key={FIREBASE_KEY}"

        response = requests.patch(
            url,
            json=firestore_doc,
            timeout=10,
            headers={'Content-Type': 'application/json'}
        )

        if response.status_code in [200, 201]:
            print(f"[firebase] {key} 저장 완료 ({len(data['events'])}개 이벤트)")
            return True
        else:
            print(f"[firebase] HTTP {response.status_code}: {response.text[:100]}")
            return False

    except Exception as e:
        print(f"[firebase] 오류: {e}")
        return False

def main():
    print("\n🎬 무코 영화 캘린더 크롤러\n")

    # 현재 및 다음 달 크롤링
    now = datetime.now()
    year = now.year
    month = now.month

    for offset in range(2):
        data = crawl_muko(year, month)
        if data:
            save_to_firebase_rest(data)

        # 다음 달
        month += 1
        if month > 12:
            month = 1
            year += 1

        # API 제한 회피
        time.sleep(2)

    print("\n✅ 크롤링 완료\n")

if __name__ == '__main__':
    main()
