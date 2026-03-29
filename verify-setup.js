#!/usr/bin/env node
/**
 * 영화 크롤링 시스템 검증 스크립트
 * 모든 구성 요소가 올바르게 설정되었는지 확인합니다
 */

import fs from 'fs';
import path from 'path';

const checks = [];

function check(name, condition, details = '') {
  const status = condition ? '✅' : '❌';
  checks.push({ name, status, condition, details });
  console.log(`${status} ${name}${details ? ` - ${details}` : ''}`);
}

console.log('\n🔍 영화 캘린더 크롤링 시스템 검증\n');

// 1. 파일 존재 여부
console.log('📁 필수 파일 검증:');
check('api-server.js', fs.existsSync('api-server.js'), '백엔드 API 서버');
check('render-movie.js', fs.existsSync('render-movie.js'), '프론트엔드 렌더링');
check('index.html', fs.existsSync('index.html'), 'HTML 템플릿');
check('data.js', fs.existsSync('data.js'), '데이터 레이어');
check('app.js', fs.existsSync('app.js'), '메인 앱 파일');
check('config.js', fs.existsSync('config.js'), '설정 파일');
check('package.json', fs.existsSync('package.json'), 'NPM 설정');
check('.claude/launch.json', fs.existsSync('.claude/launch.json'), 'Claude 런처 설정');

// 2. 코드 검증
console.log('\n💻 코드 구조 검증:');

const apiServer = fs.readFileSync('api-server.js', 'utf8');
check('API 서버 - Express 초기화', apiServer.includes('express()'));
check('API 서버 - Puppeteer 임포트', apiServer.includes('puppeteer'));
check('API 서버 - Claude 임포트', apiServer.includes('@anthropic-ai/sdk'));
check('API 서버 - CORS 미들웨어', apiServer.includes('Access-Control'));
check('API 서버 - /api/crawl-movies', apiServer.includes('/api/crawl-movies'));
check('API 서버 - /api/status', apiServer.includes('/api/status'));
check('API 서버 - Firestore REST API', apiServer.includes('firestore.googleapis.com'));

const renderMovie = fs.readFileSync('render-movie.js', 'utf8');
check('프론트엔드 - startMovieCrawl 함수', renderMovie.includes('export async function startMovieCrawl'));
check('프론트엔드 - _checkCrawlStatus 함수', renderMovie.includes('_checkCrawlStatus'));
check('프론트엔드 - window.startMovieCrawl', renderMovie.includes('window.startMovieCrawl'));
check('프론트엔드 - 상태 폴링', renderMovie.includes('setTimeout(_checkCrawlStatus'));

const html = fs.readFileSync('index.html', 'utf8');
check('HTML - 새로고침 버튼', html.includes('movie-refresh-btn'));
check('HTML - onclick 핸들러', html.includes('onclick="startMovieCrawl()"'));

// 3. 의존성 검증
console.log('\n📦 의존성 검증:');

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const deps = packageJson.dependencies || {};

check('puppeteer 설치', 'puppeteer' in deps);
check('@anthropic-ai/sdk 설치', '@anthropic-ai/sdk' in deps);
check('express 설치', 'express' in deps);
check('firebase 설치', 'firebase' in deps);

// 4. 스크립트 검증
console.log('\n🔧 NPM 스크립트 검증:');

const scripts = packageJson.scripts || {};
check('npm start (웹 서버)', 'start' in scripts);
check('npm run server (API 서버)', 'server' in scripts);

// 5. 설정 검증
console.log('\n⚙️  설정 검증:');

let launchJson = {};
try {
  launchJson = JSON.parse(fs.readFileSync('.claude/launch.json', 'utf8'));
} catch (e) {
  // 파일 없음
}

check('Firebase 설정', packageJson.type === 'module', 'ES6 modules');
check('API 서버 포트 설정', launchJson.configurations?.some(c => c.port === 3000), 'port 3000');
check('웹 서버 포트 설정', launchJson.configurations?.some(c => c.port === 5500), 'port 5500');

// 6. 환경 검증
console.log('\n🌍 환경 검증:');

check('ANTHROPIC_API_KEY', !!process.env.ANTHROPIC_API_KEY,
  process.env.ANTHROPIC_API_KEY ? 'SET' : '⚠️  NOT SET (필수)');

// 7. 노드 버전 검증
console.log('\n📊 시스템 검증:');

const nodeVersion = process.versions.node;
const majorVersion = parseInt(nodeVersion.split('.')[0]);
check('Node.js 버전', majorVersion >= 18, `v${nodeVersion} (최소: 18.x)`);

// 종합 결과
console.log('\n📋 검증 결과 종합\n');

const passed = checks.filter(c => c.condition).length;
const failed = checks.filter(c => !c.condition).length;

console.log(`총 검사 항목: ${checks.length}`);
console.log(`✅ 통과: ${passed}`);
console.log(`❌ 실패: ${failed}`);

if (failed > 0) {
  console.log('\n⚠️  실패 항목:');
  checks.filter(c => !c.condition).forEach(c => {
    console.log(`  - ${c.name}`);
  });
}

console.log('\n' + '─'.repeat(60));

if (failed === 0) {
  console.log('\n✨ 모든 검증 통과! 시스템이 준비되었습니다.\n');
  console.log('다음 단계:');
  console.log('1. 환경변수 설정: export ANTHROPIC_API_KEY="your-key"');
  console.log('2. 터미널 1: npm start (웹 서버)');
  console.log('3. 터미널 2: npm run server (API 서버)');
  console.log('4. http://localhost:5500 접속');
  console.log('5. 영화 탭 → "🔄 새로고침" 버튼 클릭\n');
} else if (failed === 1 && checks.find(c => c.name.includes('ANTHROPIC_API_KEY'))) {
  console.log('\n⚠️  API 키만 설정하면 됩니다!\n');
  console.log('설정:');
  console.log('  export ANTHROPIC_API_KEY="your-key-here"\n');
  console.log('그 후 위의 다음 단계를 진행하세요.\n');
} else {
  console.log('\n❌ 일부 항목이 실패했습니다.\n');
  console.log('실패한 항목을 확인하고 설정을 수정해주세요.\n');
  process.exit(1);
}

console.log('─'.repeat(60) + '\n');
