#!/usr/bin/env node
// ================================================================
// crawl-movies-advanced.js
// Puppeteer를 사용해 동적 렌더링이 필요한 muko.kr 크롤링
// 실제 영화 데이터를 추출해서 Firebase에 저장
// ================================================================

import puppeteer from 'puppeteer';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCk2czvJ8DRautrUput8TLjdrArpQm7BBk",
  authDomain:        "exercise-management.firebaseapp.com",
  projectId:         "exercise-management",
  storageBucket:     "exercise-management.firebasestorage.app",
  messagingSenderId: "867781711662",
  appId:             "1:867781711662:web:8fe1e9904c94d021f2ccbf",
};

const MUKO_URL = 'https://muko.kr/calender';

const TAG_MAP = {
  '시사회': 'premiere',
  'GV': 'gv',
  '상영회': 'screening',
  '개봉일': 'release',
  '재개봉': 'rerelease',
  '무대인사': 'vip',
  '영화제': 'festival',
};

async function crawlMovies(year, month) {
  let browser;
  try {
    console.log(`\n[crawl] ${year}년 ${String(month).padStart(2, '0')}월 크롤링 시작...`);

    // 1. Puppeteer 브라우저 실행
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(10000);

    // 2. 페이지 로드
    console.log(`[crawl] ${MUKO_URL} 로드 중...`);
    await page.goto(MUKO_URL, { waitUntil: 'networkidle2' });

    // 3. 원하는 월로 네비게이션
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const monthDiff = (year - currentYear) * 12 + (month - currentMonth);

    if (monthDiff !== 0) {
      const button = monthDiff > 0 ? 'button:nth-child(3)' : 'button:nth-child(1)';
      for (let i = 0; i < Math.abs(monthDiff); i++) {
        await page.click(button);
        await page.waitForTimeout(300);
      }
    }

    // 4. 달력에서 이벤트 데이터 추출
    const events = await page.evaluate(() => {
      const result = [];

      // 각 이벤트 링크 찾기
      const links = document.querySelectorAll('a[href*="/calender/"]');
      const eventMap = {};

      links.forEach(link => {
        const text = link.textContent.trim();

        // [HH:MM~HH:MM] 영화제목 형식 파싱
        const match = text.match(/\[([^\]]+)\]\s*(.+)/);
        if (!match) return;

        const timeRange = match[1];
        const title = match[2];

        // 날짜 추출 (링크의 부모 요소 또는 주변 요소에서)
        let dateNum = null;
        let elem = link.parentElement;

        // 가장 가까운 날짜 정보 찾기
        for (let i = 0; i < 5; i++) {
          if (!elem) break;
          const dayAttr = elem.getAttribute('data-day') ||
                         elem.getAttribute('data-date') ||
                         elem.className.match(/day-(\d+)/)?.[1];

          if (dayAttr) {
            dateNum = parseInt(dayAttr);
            break;
          }
          elem = elem.parentElement;
        }

        // 날짜를 찾지 못한 경우 다른 방법 시도
        if (!dateNum) {
          const dayText = elem?.textContent.match(/(\d{1,2})(?=\D|$)/)?.[1];
          dateNum = dayText ? parseInt(dayText) : null;
        }

        if (!dateNum || dateNum > 31) return;

        // 태그 추출
        const tags = [];
        for (const [korean, id] of Object.entries(TAG_MAP)) {
          if (title.includes(korean) || text.includes(korean)) {
            tags.push(id);
          }
        }

        if (!eventMap[dateNum]) {
          eventMap[dateNum] = [];
        }

        eventMap[dateNum].push({
          title: title,
          timeRange: timeRange,
          tags: tags.length > 0 ? tags : ['release']
        });
      });

      // 결과 포맷팅
      Object.entries(eventMap).forEach(([date, events]) => {
        events.forEach(event => {
          result.push({
            date: parseInt(date),
            title: event.title,
            tags: event.tags
          });
        });
      });

      return result.sort((a, b) => a.date - b.date);
    });

    await browser.close();

    if (events.length === 0) {
      console.warn(`[crawl] 이벤트를 찾을 수 없습니다. DOM 구조 변경 가능성`);
      return null;
    }

    console.log(`[crawl] ${events.length}개의 이벤트를 찾았습니다`);

    return {
      year,
      month,
      events,
      lastUpdated: new Date().toISOString(),
      source: 'muko.kr/calender'
    };

  } catch (e) {
    console.error(`[crawl] 오류:`, e.message);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

async function saveToFirebase(data) {
  if (!data) return false;

  try {
    const app = initializeApp(FIREBASE_CONFIG);
    const db = getFirestore(app);

    const key = `${data.year}-${String(data.month).padStart(2, '0')}`;
    await setDoc(doc(db, 'movies', key), data);

    console.log(`[firebase] ${key} 저장 완료 (${data.events.length}개 이벤트)`);
    return true;
  } catch (e) {
    console.error(`[firebase] 저장 실패:`, e.message);
    return false;
  }
}

async function main() {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  console.log(`\n🎬 무코 영화 캘린더 크롤러 (Puppeteer)\n`);

  // 현재 월과 다음 월 크롤링
  for (let offset = 0; offset <= 1; offset++) {
    const data = await crawlMovies(year, month);
    if (data) {
      await saveToFirebase(data);
    }

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }

    // 재요청 제한
    await new Promise(r => setTimeout(r, 3000));
  }

  console.log(`\n✅ 크롤링 완료\n`);
  process.exit(0);
}

main().catch(e => {
  console.error('치명적 오류:', e);
  process.exit(1);
});
