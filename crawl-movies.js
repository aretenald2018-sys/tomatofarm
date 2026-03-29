#!/usr/bin/env node
// ================================================================
// crawl-movies.js
// 무코 캘린더에서 영화 데이터를 크롤링해서 Firebase에 저장
// 실행: node crawl-movies.js 또는 GitHub Actions에서 자동화
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
  '우대인사': 'vip',
  '영화제': 'festival',
};

// ── 메인 크롤링 함수 ──────────────────────────────────────────
async function crawlMovies(year, month) {
  try {
    console.log(`[crawl] ${year}년 ${String(month).padStart(2, '0')}월 크롤링 시작...`);

    // 1. 페이지 가져오기
    const html = await fetch(MUKO_URL).then(r => r.text());
    const $ = cheerio.load(html);

    // 2. 현재 월 찾기
    const monthLabel = $('span').filter((i, el) => {
      return $(el).text().includes(`${year}년`);
    });

    if (monthLabel.length === 0) {
      console.warn(`[crawl] ${year}년 ${month}월 레이블을 찾을 수 없습니다`);
      return null;
    }

    // 3. 영화 데이터 추출
    // ⚠️ 주의: muko.kr의 실제 DOM 구조에 따라 선택자 조정 필요
    const events = [];
    const movieCells = $('.monthly-cell, .calendar-day, [data-date]');

    movieCells.each((i, cell) => {
      const date = parseInt($(cell).attr('data-date')) || null;
      if (!date) return;

      const titles = $(cell).find('.movie-title, .event-title, p').toArray();
      titles.forEach(titleEl => {
        const text = $(titleEl).text().trim();
        if (!text) return;

        // 태그 추출 (색상 클래스나 뱃지에서)
        const tags = _extractTags($(titleEl));

        events.push({
          date,
          title: text,
          tags: tags.length > 0 ? tags : ['release'], // 기본값: 개봉일
        });
      });
    });

    if (events.length === 0) {
      console.warn(`[crawl] ${year}년 ${month}월 이벤트를 찾을 수 없습니다`);
      console.log('[crawl] 팁: muko.kr의 HTML 구조를 확인하고 선택자를 조정하세요');
      return null;
    }

    // 4. 데이터 정리
    const data = {
      year,
      month,
      events: events.sort((a, b) => a.date - b.date),
      lastUpdated: new Date().toISOString(),
      source: 'muko.kr/calender',
    };

    console.log(`[crawl] ${events.length}개의 이벤트를 찾았습니다`);
    return data;

  } catch (e) {
    console.error(`[crawl] 크롤링 실패: ${e.message}`);
    return null;
  }
}

// ── 태그 추출 함수 ────────────────────────────────────────────
function _extractTags(element) {
  const tags = [];
  const classList = element.attr('class') || '';
  const text = element.text();

  // 클래스 기반 추출
  for (const [korean, id] of Object.entries(TAG_MAP)) {
    if (classList.includes(id) || classList.includes(korean.toLowerCase())) {
      tags.push(id);
    }
  }

  // 텍스트 기반 추출
  for (const [korean, id] of Object.entries(TAG_MAP)) {
    if (text.includes(korean)) {
      tags.push(id);
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
    await setDoc(doc(db, 'movies', key), data);

    console.log(`[firebase] ${key} 저장 완료`);
    return true;
  } catch (e) {
    console.error(`[firebase] 저장 실패: ${e.message}`);
    return false;
  }
}

// ── 메인 실행 ──────────────────────────────────────────────────
async function main() {
  // 현재 달과 다음 달 크롤링
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  console.log(`\n🎬 무코 영화 캘린더 크롤러\n`);

  for (let offset = 0; offset <= 1; offset++) {
    let year = currentYear;
    let month = currentMonth + offset;

    if (month > 12) {
      month -= 12;
      year += 1;
    }

    const data = await crawlMovies(year, month);
    if (data) {
      await saveToFirebase(data);
    }

    // API 호출 제한 회피
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`\n✅ 크롤링 완료\n`);
}

main().catch(e => {
  console.error('치명적 오류:', e);
  process.exit(1);
});
