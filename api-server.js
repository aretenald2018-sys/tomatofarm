#!/usr/bin/env node
/**
 * API 서버
 * - muko.kr 스크린샷 캡처
 * - Claude Vision으로 데이터 추출
 * - Firebase에 저장
 */

import express from 'express';
import puppeteer from 'puppeteer';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// 정적 파일 서빙 (배포 환경에서)
app.use(express.static(__dirname, {
  setHeaders: (res, filePath) => {
    // HTML 파일은 캐시하지 않음
    if (filePath.endsWith('.html')) {
      res.set('Cache-Control', 'no-cache');
    }
  }
}));

// Firebase 설정
const FIREBASE_PROJECT_ID = 'exercise-management';
const FIREBASE_API_KEY = 'AIzaSyCk2czvJ8DRautrUput8TLjdrArpQm7BBk';
const FIRESTORE_API = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// Claude 초기화
const client = new Anthropic();

// CORS 미들웨어
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());

// 상태 추적용
let crawlStatus = { status: 'idle', message: '', progress: 0 };

/**
 * GET /api/status - 크롤링 상태 조회
 */
app.get('/api/status', (req, res) => {
  res.json(crawlStatus);
});

/**
 * POST /api/crawl-movies - 영화 데이터 크롤링
 */
app.post('/api/crawl-movies', async (req, res) => {
  // 크롤링 중이면 거절
  if (crawlStatus.status === 'crawling') {
    return res.status(429).json({ error: '이미 크롤링 중입니다' });
  }

  crawlStatus = { status: 'crawling', message: '시작...', progress: 0 };
  res.json({ status: 'started' });

  try {
    // 1. Puppeteer로 스크린샷 캡처
    crawlStatus.message = 'muko.kr 접속 중...';
    crawlStatus.progress = 20;

    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    } catch (e) {
      // Chromium 없으면 다운로드
      console.log('[server] Chromium 다운로드 중...');
      crawlStatus.message = 'Chromium 준비 중...';
      await import('puppeteer').then(p => p.default.createBrowserFetcher().download('1088391'));
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }

    const page = await browser.newPage();
    page.setDefaultTimeout(15000);

    // muko.kr 접속
    await page.goto('https://muko.kr/calender', { waitUntil: 'networkidle2' });

    crawlStatus.message = '스크린샷 캡처 중...';
    crawlStatus.progress = 40;

    // 스크린샷 캡처
    const screenshotPath = path.join(__dirname, '.temp-screenshot.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    await browser.close();

    console.log('[server] 스크린샷 저장:', screenshotPath);

    // 2. Claude Vision으로 이미지 분석
    crawlStatus.message = 'Claude로 데이터 추출 중...';
    crawlStatus.progress = 60;

    const imageData = fs.readFileSync(screenshotPath);
    const base64Image = imageData.toString('base64');

    const message = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: `이 이미지는 https://muko.kr/calender의 스크린샷입니다.

모든 영화 이벤트를 다음 JSON 형식으로 추출해주세요:
{
  "year": 2026,
  "month": 3,
  "events": [
    {
      "date": 1,
      "title": "영화 제목",
      "tags": ["premiere", "gv", "screening", "release", "rerelease", "vip", "festival"]
    }
  ]
}

규칙:
1. 날짜는 1-31 숫자
2. 제목은 정확하게 추출
3. 태그는 다음 중 해당하는 것 선택:
   - premiere: 시사회
   - gv: GV
   - screening: 상영회
   - release: 개봉일
   - rerelease: 재개봉
   - vip: 무대인사/우대인사
   - festival: 영화제
4. 같은 날에 여러 이벤트가 있으면 모두 추출
5. JSON만 반환 (설명 X)`
            }
          ],
        }
      ],
    });

    // 3. 응답 파싱
    crawlStatus.message = 'Firebase에 저장 중...';
    crawlStatus.progress = 80;

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    // JSON 추출
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Claude 응답에서 JSON을 찾을 수 없습니다');
    }

    const movieData = JSON.parse(jsonMatch[0]);

    // 4. 데이터 준비 (Firebase 없이 메모리만 사용)
    const docKey = `${movieData.year}-${String(movieData.month).padStart(2, '0')}`;
    movieData.lastUpdated = new Date().toISOString();
    movieData.source = 'muko.kr/calender (auto)';

    // 메모리에 캐시 (앱 재시작 시까지만 유지)
    if (!global.movieCache) global.movieCache = {};
    global.movieCache[docKey] = movieData;

    console.log(`[server] 데이터 메모리 저장: ${docKey} (${movieData.events.length}개 이벤트)`);
    console.log(`[server] 참고: Firebase 저장 제외 (클라이언트 localStorage 사용)`);

    // 5. 임시 파일 삭제
    fs.unlinkSync(screenshotPath);

    crawlStatus = {
      status: 'success',
      message: `✅ 완료! ${movieData.events.length}개 이벤트 저장됨`,
      progress: 100,
      data: movieData
    };

  } catch (error) {
    console.error('[server] 오류:', error);
    crawlStatus = {
      status: 'error',
      message: `❌ 오류: ${error.message}`,
      progress: 0
    };
  }
});

/**
 * 헬스체크
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 API 서버 시작: http://localhost:${PORT}`);
  console.log('   POST /api/crawl-movies - 영화 데이터 크롤링\n');
});
