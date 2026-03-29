// ================================================================
// sample-movie-data.js — 샘플 영화 데이터
// Firebase에 초기 데이터를 넣기 위한 샘플
// ================================================================

export const SAMPLE_MOVIE_DATA = {
  '2026-03': {
    year: 2026,
    month: 3,
    events: [
      {
        date: 1,
        title: '2026 부산시네마 아차데',
        tags: ['premiere']
      },
      {
        date: 3,
        title: '코야마스 2 기획전',
        tags: ['screening', 'gv']
      },
      {
        date: 5,
        title: '우리에게는 미래 닉 날라이',
        tags: ['release']
      },
      {
        date: 7,
        title: '도인스 VR 로맨스',
        tags: ['screening']
      },
      {
        date: 10,
        title: '스파이드: 거울 기지 2',
        tags: ['release', 'vip']
      },
      {
        date: 14,
        title: '딘 아마 리베 · 정영',
        tags: ['festival']
      },
      {
        date: 18,
        title: '신 여가처는 국항',
        tags: ['rerelease']
      },
      {
        date: 21,
        title: '조르추스 스페셜 로드',
        tags: ['release', 'gv']
      },
      {
        date: 25,
        title: '세더 패밀리 : 기록 흔적',
        tags: ['premiere']
      }
    ],
    lastUpdated: new Date().toISOString(),
    source: 'muko.kr/calender'
  },
  '2026-04': {
    year: 2026,
    month: 4,
    events: [
      {
        date: 2,
        title: '아바타: 물의 길',
        tags: ['release']
      },
      {
        date: 8,
        title: '무비극장 시사회',
        tags: ['premiere', 'gv']
      },
      {
        date: 15,
        title: '킹스맨 5',
        tags: ['release']
      },
      {
        date: 22,
        title: '한국영화제 특별 상영',
        tags: ['festival', 'screening']
      }
    ],
    lastUpdated: new Date().toISOString(),
    source: 'muko.kr/calender'
  }
};

// Firebase에 데이터 초기화하는 함수
export async function initializeSampleMovieData(db, setDoc, doc, collection, getDocs) {
  try {
    // 기존 데이터 확인
    const snap = await getDocs(collection(db, 'movies'));
    if (snap.size > 0) {
      console.log('[sample-movie] 이미 영화 데이터가 있어서 스킵합니다');
      return;
    }

    // 샘플 데이터 추가
    for (const [key, data] of Object.entries(SAMPLE_MOVIE_DATA)) {
      await setDoc(doc(db, 'movies', key), data);
    }
    console.log('[sample-movie] 샘플 데이터 초기화 완료');
  } catch(e) {
    console.error('[sample-movie] 초기화 실패:', e);
  }
}
