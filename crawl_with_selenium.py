#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Selenium을 사용한 실시간 muko.kr 크롤링"""

import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service
import requests
import time
from datetime import datetime

MUKO_URL = "https://muko.kr/calender"
FIREBASE_URL = "https://firestore.googleapis.com/v1/projects/exercise-management/databases/(default)/documents/movies"
FIREBASE_KEY = "AIzaSyCk2czvJ8DRautrUput8TLjdrArpQm7BBk"

TAG_MAP = {
    '시사회': 'premiere',
    'GV': 'gv',
    '상영회': 'screening',
    '개봉일': 'release',
    '재개봉': 'rerelease',
    '무대인사': 'vip',
    '영화제': 'festival',
}

def crawl_with_selenium(year, month):
    """Selenium으로 muko.kr 크롤링"""
    print(f"\n[crawl] {year}년 {month:02d}월 Selenium 크롤링 시작...")

    # Chrome 옵션
    chrome_options = Options()
    chrome_options.add_argument("--start-maximized")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option('useAutomationExtension', False)

    # WebDriver 초기화
    driver = None
    try:
        service = Service(ChromeDriverManager().install())
        driver = webdriver.Chrome(service=service, options=chrome_options)
        driver.get(MUKO_URL)

        print("[crawl] 페이지 로드 중...")
        WebDriverWait(driver, 10).until(
            EC.presence_of_all_elements_located((By.TAG_NAME, "a"))
        )

        print("[crawl] 페이지 로드 완료")
        time.sleep(2)

        # 현재 월에서 원하는 월로 네비게이션
        current_month = datetime.now().month
        current_year = datetime.now().year
        month_diff = (year - current_year) * 12 + (month - current_month)

        if month_diff != 0:
            # 월 네비게이션 버튼 찾기
            buttons = driver.find_elements(By.TAG_NAME, "button")
            nav_buttons = [b for b in buttons if b.text in ['◀', '▶']]

            for _ in range(abs(month_diff)):
                try:
                    if month_diff > 0:
                        nav_buttons[-1].click()  # 다음 달
                    else:
                        nav_buttons[0].click()  # 이전 달
                    time.sleep(1)
                except Exception as e:
                    print(f"[crawl] 월 네비게이션 실패: {e}")
                    pass

        # 모든 이벤트 링크 추출
        events_dict = {}
        links = driver.find_elements(By.TAG_NAME, "a")

        print(f"[crawl] 총 {len(links)}개 링크 분석 중...")

        for link in links:
            try:
                text = link.text.strip()
                href = link.get_attribute("href") or ""

                # calender/ 경로 확인
                if not href.startswith("/calender/"):
                    continue
                if "/category/" in href or "selected_month" in href:
                    continue
                if not text.startswith("["):
                    continue

                # 제목 파싱
                if "] " not in text:
                    continue
                title = text.split("] ", 1)[1]

                # 날짜 찾기
                date_num = None
                elem = link
                for _ in range(10):
                    if elem is None:
                        break

                    # data 속성
                    day = elem.get_attribute("data-day")
                    if day:
                        date_num = int(day)
                        break

                    # 부모 요소 텍스트에서 날짜 찾기
                    try:
                        parent_text = elem.text
                        for word in parent_text.split():
                            if word.isdigit():
                                d = int(word)
                                if 1 <= d <= 31:
                                    date_num = d
                                    break
                        if date_num:
                            break
                    except:
                        pass

                    elem = elem.find_element(By.XPATH, "..")

                if not date_num or date_num > 31:
                    continue

                # 태그 추출
                tags = []
                for korean, tag_id in TAG_MAP.items():
                    if korean in title or korean in text:
                        tags.append(tag_id)

                if not tags:
                    tags = ['release']

                if date_num not in events_dict:
                    events_dict[date_num] = []
                events_dict[date_num].append({
                    'title': title,
                    'tags': tags
                })

            except Exception as e:
                continue

        # 이벤트 정리
        events = []
        for date_num in sorted(events_dict.keys()):
            for event in events_dict[date_num]:
                events.append({
                    'date': date_num,
                    'title': event['title'],
                    'tags': event['tags']
                })

        if not events:
            print("[crawl] 이벤트를 찾을 수 없습니다")
            return None

        print(f"[crawl] ✅ {len(events)}개 이벤트 추출 완료")

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

    finally:
        if driver:
            driver.quit()

def save_to_firebase(data):
    """Firebase에 저장"""
    if not data:
        return False

    try:
        key = f"{data['year']}-{data['month']:02d}"

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
        response = requests.patch(url, json=firestore_doc, timeout=10)

        if response.status_code in [200, 201]:
            print(f"[firebase] ✅ {key} 저장 완료 ({len(data['events'])}개 이벤트)")
            return True
        else:
            print(f"[firebase] 저장 실패: HTTP {response.status_code}")
            return False

    except Exception as e:
        print(f"[firebase] 오류: {e}")
        return False

def main():
    print("\n🎬 Selenium 자동 크롤러 (실시간 데이터)\n")

    now = datetime.now()
    year = now.year
    month = now.month

    success = 0
    total = 2

    # 현재 및 다음 달 크롤링
    for offset in range(total):
        data = crawl_with_selenium(year, month)
        if data:
            if save_to_firebase(data):
                success += 1

        month += 1
        if month > 12:
            month = 1
            year += 1

        time.sleep(3)

    print(f"\n결과: {success}/{total} 성공")
    print("\n✅ 크롤링 완료! 대시보드를 새로고침하면 최신 데이터가 표시됩니다.")

if __name__ == '__main__':
    main()
