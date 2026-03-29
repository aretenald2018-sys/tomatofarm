#!/usr/bin/env node
// ================================================================
// crawl-movies-optimized.js
// 무코 캘린더 크롤링 - cheerio 기반 (HTML 파싱)
// 분석 결과: 모든 데이터가 초기 HTML title 속성에 있음
// ================================================================

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

// ── Firebase 설정 ──────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCk2czvJ8DRautrUput8TLjdrArpQm7BBk",
  authDomain:        "exercise-management.firebaseapp.com",
  projectId:         "exercise-management",
  storageBucket:     "exercise-management.firebasestorage.app",
  messagingSenderId: "867781711662",
  appId:             "1:867781711662:web:8fe1e9904c94d021f2ccbf",
};

// ── 크롤링 대상 ────────────────────────────────────────────────
const MUKO_URL = 'https://muko.kr/calender';

// 영화 태그 매핑
const TAG_MAP = {
  '시사회': 'premiere',
  'GV': 'gv',
  '상영회': 'screening',
  '개봉일': 'release',
  '재개봉': 'rerelease',
  '무대인사': 'vip',
  '우대인사': 'vip',
  '영화제': 'festival',
};

// ── 메인 크롤링 함수 ──────────────────────────────────────────
async function crawlMovies(year, month) {
  try {
    const monthStr = String(month).padStart(2, '0');
    console.log(`\n[crawl] ${year}년 ${monthStr}월 크롤링 시작...`);

    // 1. 페이지 가져오기
    console.log(`[fetch] ${MUKO_URL} 요청 중...`);
    const html = await fetch(MUKO_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }).then(r => r.text());

    console.log(`[parse] HTML 파싱 중... (${html.length}바이트)`);
    const $ = cheerio.load(html);

    // 2. 달력 그리드에서 영화 데이터 추출
    const events = [];

    // 핵심 구조:
    // .grid.grid-cols-7
    //   > div.border-b.min-h-[100px]
    //     > div (첫 번째: 날짜 헤더)
    //       > span (실제 날짜 숫자)
    //     > div.space-y-1 (이벤트 컨테이너)
    //       > a[href*="/calender/"]

    const dayElements = $('div.grid.grid-cols-7 > div.border-b');
    console.log(`[debug] 발견된 날짜 셀: ${dayElements.length}개`);

    dayElements.each((dayIdx, dayEl) => {
      // 날짜 추출 (첫 번째 span 안의 숫자)
      const dateText = $(dayEl).find('> div > span').first().text().trim();
      const date = parseInt(dateText);

      if (!date || date < 1 || date > 31) return;

      // 그 날의 모든 이벤트 링크
      $(dayEl).find('a[href*="/calender/"]').each((linkIdx, linkEl) => {
        const title = $(linkEl).attr('title') || '';

        if (!title) return;

        // "[HH:MM~HH:MM] 제목" 형식 파싱
        // 예: "[11:00~19:40] <휴민트> 3주차 무대인사"
        const match = title.match(/\[(.+?)\]\s*(.+)/);

        if (!match) return;

        const timeRange = match[1];    // "11:00~19:40"
        const eventTitle = match[2]    // "<휴민트> 3주차 무대인사"
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&');

        // 태그 추출
        const tags = _extractTags(eventTitle);

        events.push({
          date,
          title: eventTitle,
          tags: tags.length > 0 ? tags : ['release'], // 기본값: 개봉일
          time: timeRange
        });
      });
    });

    if (events.length === 0) {
      console.warn(`[crawl] ⚠️  이벤트를 찾을 수 없습니다`);
      console.warn(`[debug] 선택자 확인: .grid[class*="grid-cols-7"]`);
      return null;
    }

    // 3. 중복 제거 및 정렬
    const uniqueEvents = Array.from(
      new Map(events.map(e => [`${e.date}-${e.title}`, e])).values()
    ).sort((a, b) => a.date - b.date);

    // 4. 데이터 정리
    const data = {
      year,
      month,
      events: uniqueEvents,
      count: uniqueEvents.length,
      lastUpdated: new Date().toISOString(),
      source: 'muko.kr/calender',
      method: 'cheerio (HTML 파싱)'
    };

    console.log(`[crawl] ✅ ${uniqueEvents.length}개의 이벤트 추출 완료`);
    return data;

  } catch (e) {
    console.error(`[crawl] ❌ 크롤링 실패: ${e.message}`);
    return null;
  }
}

// ── 태그 추출 함수 ────────────────────────────────────────────
function _extractTags(text) {
  const tags = [];

  for (const [korean, tagId] of Object.entries(TAG_MAP)) {
    if (text.includes(korean)) {
      tags.push(tagId);
    }
  }

  return [...new Set(tags)]; // 중복 제거
}

// ── Firebase 저장 함수 ─────────────────────────────────────────
async function saveToFirebase(data) {
  if (!data) return false;

  try {
    const app = initializeApp(FIREBASE_CONFIG);
    const db = getFirestore(app);

    const key = `${data.year}-${String(data.month).padStart(2, '0')}`;
    await setDoc(doc(db, 'movies', key), data, { merge: true });

    console.log(`[firebase] ✅ ${key} 저장 완료 (${data.count}개 이벤트)`);
    return true;
  } catch (e) {
    console.error(`[firebase] ❌ 저장 실패: ${e.message}`);
    return false;
  }
}

// ── 메인 실행 ──────────────────────────────────────────────────
async function main() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎬 무코 영화 캘린더 크롤러 (cheerio 최적화)`);
  console.log(`${'='.repeat(60)}`);

  let successCount = 0;
  const crawlMonths = 2;

  // 현재 달과 다음 달 크롤링
  for (let offset = 0; offset < crawlMonths; offset++) {
    let year = currentYear;
    let month = currentMonth + offset;

    if (month > 12) {
      month -= 12;
      year += 1;
    }

    const data = await crawlMovies(year, month);
    if (data) {
      const saved = await saveToFirebase(data);
      if (saved) successCount++;
    }

    // API 호출 제한 회피
    if (offset < crawlMonths - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 결과: ${successCount}/${crawlMonths} 성공`);
  console.log(`${'='.repeat(60)}\n`);

  if (successCount === crawlMonths) {
    console.log('✅ 모든 월의 크롤링이 완료되었습니다!');
    process.exit(0);
  } else {
    console.log('⚠️  일부 월의 크롤링에 실패했습니다.');
    process.exit(1);
  }
}

main().catch(e => {
  console.error('💥 치명적 오류:', e);
  process.exit(1);
});
