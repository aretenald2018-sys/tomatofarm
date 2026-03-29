#!/usr/bin/env node
/**
 * GitHub Actions용 영화 크롤러
 * Ubuntu 환경에서 Puppeteer + Chromium 자동 설치 및 크롤링
 */

const puppeteer = require('puppeteer');
const admin = require('firebase-admin');
const fs = require('fs');

// Firebase 초기화
const serviceAccount = {
  projectId: "exercise-management",
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
};

if (!process.env.FIREBASE_PRIVATE_KEY) {
  console.error('❌ 환경변수 FIREBASE_PRIVATE_KEY 없음');
  console.log('\n설정 방법:');
  console.log('1. Firebase Console → 프로젝트 설정 → 서비스 계정');
  console.log('2. "새로운 비공개 키" 생성');
  console.log('3. JSON 다운로드 후 GitHub Secrets에 추가:');
  console.log('   - FIREBASE_PRIVATE_KEY');
  console.log('   - FIREBASE_CLIENT_EMAIL');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'exercise-management'
});

const db = admin.firestore();

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
    console.log(`\n[crawl] ${year}년 ${String(month).padStart(2, '0')}월 크롤링...`);

    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(15000);

    // 페이지 로드
    await page.goto(MUKO_URL, { waitUntil: 'networkidle2' });
    console.log('[crawl] 페이지 로드 완료');

    // 현재 월에서 원하는 월로 네비게이션
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const monthDiff = (year - currentYear) * 12 + (month - currentMonth);

    for (let i = 0; i < Math.abs(monthDiff); i++) {
      const button = monthDiff > 0 ? 'button:nth-of-type(3)' : 'button:nth-of-type(1)';
      try {
        await page.click(button);
        await page.waitForTimeout(500);
      } catch (e) {
        console.warn('[crawl] 월 네비게이션 실패:', e.message);
      }
    }

    // 이벤트 추출
    const events = await page.evaluate(() => {
      const result = [];
      const dateMap = {};

      // 모든 링크에서 이벤트 추출
      document.querySelectorAll('a').forEach(link => {
        const text = link.textContent.trim();
        const href = link.getAttribute('href') || '';

        // calender/ 경로 + 시간 형식 확인
        if (!href.startsWith('/calender/') || !text.startsWith('[')) return;
        if (href.includes('/category/') || href.includes('selected_month')) return;

        // 제목 추출
        const match = text.match(/\[([^\]]*)\]\s*(.+)/);
        if (!match) return;

        const title = match[2];

        // 날짜 찾기 (부모 요소 탐색)
        let elem = link.parentElement;
        let dateNum = null;

        for (let i = 0; i < 8; i++) {
          if (!elem) break;

          // data 속성
          if (elem.dataset.day) {
            dateNum = parseInt(elem.dataset.day);
            break;
          }
          if (elem.dataset.date) {
            dateNum = parseInt(elem.dataset.date);
            break;
          }

          // 텍스트에서 날짜 추출
          const text = elem.textContent;
          const dayMatch = text.match(/^(\d{1,2})(?:\s|$)/);
          if (dayMatch) {
            const d = parseInt(dayMatch[1]);
            if (d >= 1 && d <= 31) {
              dateNum = d;
              break;
            }
          }

          elem = elem.parentElement;
        }

        if (!dateNum || dateNum > 31) return;

        // 태그 추출
        const tags = [];
        Object.entries(TAG_MAP).forEach(([korean, id]) => {
          if (title.includes(korean)) tags.push(id);
        });

        if (!dateMap[dateNum]) dateMap[dateNum] = [];
        dateMap[dateNum].push({
          title,
          tags: tags.length > 0 ? tags : ['release']
        });
      });

      // 결과 정렬
      Object.entries(dateMap).forEach(([date, items]) => {
        items.forEach(item => {
          result.push({
            date: parseInt(date),
            title: item.title,
            tags: item.tags
          });
        });
      });

      return result.sort((a, b) => a.date - b.date);
    });

    await browser.close();

    if (events.length === 0) {
      console.warn('[crawl] 이벤트 없음 (페이지 구조 변경?)');
      return null;
    }

    console.log(`[crawl] ✅ ${events.length}개 이벤트 추출`);

    return {
      year,
      month,
      events,
      lastUpdated: new Date().toISOString(),
      source: 'muko.kr/calender'
    };

  } catch (e) {
    console.error(`[crawl] 오류: ${e.message}`);
    return null;
  } finally {
    if (browser) await browser.close();
  }
}

async function saveToFirebase(data) {
  if (!data) return false;

  try {
    const key = `${data.year}-${String(data.month).padStart(2, '0')}`;
    await db.collection('movies').doc(key).set(data, { merge: true });

    console.log(`[firebase] ✅ ${key} 저장 완료 (${data.events.length}개)`);
    return true;
  } catch (e) {
    console.error(`[firebase] 저장 실패: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log('\n🎬 muko.kr 자동 크롤러 (GitHub Actions)\n');

  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;

  // 현재 및 다음 2개월 크롤링
  for (let offset = 0; offset <= 2; offset++) {
    const data = await crawlMovies(year, month);
    if (data) {
      await saveToFirebase(data);
    }

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }

    // API 제한 회피
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n✅ 크롤링 완료\n');
  process.exit(0);
}

main().catch(e => {
  console.error('💥 오류:', e);
  process.exit(1);
});
