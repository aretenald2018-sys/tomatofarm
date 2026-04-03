// ================================================================
// gcal-sync.js — Google Calendar 양방향 동기화
// ================================================================

const SCOPES = 'https://www.googleapis.com/auth/calendar';
const CALENDAR_ID = 'primary';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';
const GCAL_CLIENT_ID = '28566238351-5pdka3va2riocuj2quvr7juo5cim3v91.apps.googleusercontent.com';

let _tokenClient = null;
let _gapiInited = false;
let _gisInited = false;
let _accessToken = null;

// 색상 매핑: 앱 색상 → Google Calendar colorId
const COLOR_TO_GCAL = {
  '#f59e0b': '5',  // banana (yellow)
  '#ef4444': '11', // tomato (red)
  '#3b82f6': '9',  // blueberry (blue)
  '#10b981': '2',  // sage (green)
  '#8b5cf6': '3',  // grape (purple)
  '#ec4899': '4',  // flamingo (pink)
  '#6b7280': '8',  // graphite (gray)
};

// Google colorId → 앱 색상
const GCAL_TO_COLOR = {
  '1':  '#8b5cf6', // lavender → purple
  '2':  '#10b981', // sage → green
  '3':  '#8b5cf6', // grape → purple
  '4':  '#ec4899', // flamingo → pink
  '5':  '#f59e0b', // banana → amber
  '6':  '#f59e0b', // tangerine → amber
  '7':  '#6b7280', // peacock → gray
  '8':  '#6b7280', // graphite → gray
  '9':  '#3b82f6', // blueberry → blue
  '10': '#10b981', // basil → green
  '11': '#ef4444', // tomato → red
};

/**
 * GAPI 라이브러리 로드
 */
export function loadGapiScript() {
  return new Promise((resolve, reject) => {
    if (window.gapi) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/**
 * GIS (Google Identity Services) 라이브러리 로드
 */
export function loadGisScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

/**
 * GAPI client 초기화
 */
async function initGapi() {
  if (_gapiInited) return;
  await new Promise((resolve) => gapi.load('client', resolve));
  await gapi.client.init({});
  await gapi.client.load(DISCOVERY_DOC);
  _gapiInited = true;
}

/**
 * GIS token client 초기화
 */
function initGis(clientId) {
  if (_gisInited) return;
  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: () => {}, // 나중에 덮어씌움
  });
  _gisInited = true;
}

/**
 * Google Calendar 연결 (OAuth2 인증)
 * @returns {Promise<boolean>}
 */
export async function connectGoogleCalendar() {
  try {
    await loadGapiScript();
    await loadGisScript();
    await initGapi();
    initGis(GCAL_CLIENT_ID);

    return new Promise((resolve) => {
      _tokenClient.callback = (resp) => {
        if (resp.error) {
          console.error('[GCal] 인증 실패:', resp);
          resolve(false);
          return;
        }
        _accessToken = resp.access_token;
        localStorage.setItem('gcal_connected', 'true');
        console.log('[GCal] 연결 성공');
        resolve(true);
      };
      _tokenClient.requestAccessToken({ prompt: 'consent' });
    });
  } catch (e) {
    console.error('[GCal] 연결 오류:', e);
    return false;
  }
}

/**
 * 저장된 토큰으로 자동 재연결 시도 (무음)
 */
export async function tryAutoConnect() {
  if (!localStorage.getItem('gcal_connected')) return false;

  try {
    await loadGapiScript();
    await loadGisScript();
    await initGapi();
    initGis(GCAL_CLIENT_ID);

    return new Promise((resolve) => {
      _tokenClient.callback = (resp) => {
        if (resp.error) { resolve(false); return; }
        _accessToken = resp.access_token;
        resolve(true);
      };
      _tokenClient.requestAccessToken({ prompt: '' });
    });
  } catch {
    return false;
  }
}

/**
 * 연결 해제
 */
export function disconnectGoogleCalendar() {
  if (_accessToken) {
    google.accounts.oauth2.revoke(_accessToken);
  }
  _accessToken = null;
  localStorage.removeItem('gcal_connected');
}

/**
 * 연결 상태 확인
 */
export function isGCalConnected() {
  return !!_accessToken;
}

// ── CRUD 동기화 함수들 ──────────────────────────────────────────

/**
 * 앱 이벤트 → Google Calendar 이벤트 변환
 */
function toGCalEvent(ev) {
  // ev.title은 이미 cleanTitle (시간 제거됨), 시간은 ev.startTime에 있음
  const gcalEvent = {
    summary: ev.title,
    extendedProperties: {
      private: { appEventId: ev.id }
    }
  };

  // startTime이 있으면 시간 포함 이벤트
  if (ev.startTime) {
    const [hh, mm] = ev.startTime.split(':');
    const hour = parseInt(hh), minute = parseInt(mm);
    const endHour = hour + 1;
    const ehh = String(endHour).padStart(2, '0');
    gcalEvent.start = { dateTime: `${ev.start}T${hh}:${mm}:00`, timeZone: 'Asia/Seoul' };
    gcalEvent.end   = { dateTime: `${ev.end}T${ehh}:${mm}:00`, timeZone: 'Asia/Seoul' };
    gcalEvent.reminders = {
      useDefault: false,
      overrides: _calcReminders(ev.start, hour, minute),
    };
  } else {
    // 종일 이벤트
    gcalEvent.start = { date: ev.start };
    gcalEvent.end   = { date: _addOneDay(ev.end) };
  }

  const colorId = COLOR_TO_GCAL[ev.color];
  if (colorId) gcalEvent.colorId = colorId;

  return gcalEvent;
}

/**
 * Google Calendar 이벤트 → 앱 이벤트 변환
 */
function fromGCalEvent(gcalEv) {
  const start = gcalEv.start?.date || gcalEv.start?.dateTime?.substring(0, 10);
  let end = gcalEv.end?.date || gcalEv.end?.dateTime?.substring(0, 10);

  // Google Calendar end date is exclusive for all-day events, subtract one day
  if (gcalEv.end?.date) {
    end = _subtractOneDay(end);
  }

  const rawTitle = gcalEv.summary || '(제목 없음)';
  const parsed = parseTimeFromTitle(rawTitle);
  const ev = {
    id: gcalEv.extendedProperties?.private?.appEventId || `gcal_${gcalEv.id}`,
    gcalId: gcalEv.id,
    title: parsed?.cleanTitle || rawTitle,
    start,
    end,
    color: GCAL_TO_COLOR[gcalEv.colorId] || '#3b82f6',
  };

  // 시간 정보 보존 (dateTime 또는 제목 파싱)
  if (gcalEv.start?.dateTime) {
    ev.startTime = gcalEv.start.dateTime.substring(11, 16); // "HH:MM"
  } else if (parsed) {
    ev.startTime = `${String(parsed.hour).padStart(2,'0')}:${String(parsed.minute).padStart(2,'0')}`;
  }
  if (gcalEv.end?.dateTime) {
    ev.endTime = gcalEv.end.dateTime.substring(11, 16);
  }

  return ev;
}

/**
 * 이벤트 생성 → Google Calendar에 추가
 */
export async function syncCreateToGCal(ev) {
  if (!_accessToken) return null;
  try {
    const resp = await gapi.client.calendar.events.insert({
      calendarId: CALENDAR_ID,
      resource: toGCalEvent(ev),
    });
    return resp.result.id;
  } catch (e) {
    console.warn('[GCal] 생성 동기화 실패:', e);
    return null;
  }
}

/**
 * 이벤트 수정 → Google Calendar에 반영
 */
export async function syncUpdateToGCal(ev) {
  if (!_accessToken || !ev.gcalId) return;
  try {
    await gapi.client.calendar.events.update({
      calendarId: CALENDAR_ID,
      eventId: ev.gcalId,
      resource: toGCalEvent(ev),
    });
  } catch (e) {
    console.warn('[GCal] 수정 동기화 실패:', e);
  }
}

/**
 * 이벤트 삭제 → Google Calendar에서 제거
 */
export async function syncDeleteToGCal(gcalId) {
  if (!_accessToken || !gcalId) return;
  try {
    await gapi.client.calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId: gcalId,
    });
  } catch (e) {
    console.warn('[GCal] 삭제 동기화 실패:', e);
  }
}

/**
 * Google Calendar에서 이벤트 가져오기 (Pull)
 * @param {string} timeMin - 시작일 (YYYY-MM-DD)
 * @param {string} timeMax - 종료일 (YYYY-MM-DD)
 * @returns {Array} 앱 형식 이벤트 배열
 */
export async function fetchGCalEvents(timeMin, timeMax) {
  if (!_accessToken) return [];
  try {
    const resp = await gapi.client.calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: `${timeMin}T00:00:00Z`,
      timeMax: `${timeMax}T23:59:59Z`,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
    });
    return (resp.result.items || []).map(fromGCalEvent);
  } catch (e) {
    console.warn('[GCal] 이벤트 가져오기 실패:', e);
    return [];
  }
}

// ── 시간 파싱 (한글/숫자 → 24시간) ─────────────────────────────

const KR_NUM = { '한':1,'두':2,'세':3,'네':4,'다섯':5,'여섯':6,'일곱':7,'여덟':8,'아홉':9,'열':10,
                 '열한':11,'열하나':11,'열두':12,'열둘':12 };

/**
 * 제목에서 시간 정보 추출 + 시간 부분 제거된 cleanTitle 반환
 * "영화모임 다섯시 반" → { hour:17, minute:30, cleanTitle:"영화모임" }
 * "3시 성빈" → { hour:15, minute:0, cleanTitle:"성빈" }
 * "7시 30분" → { hour:19, minute:30, cleanTitle:"" }
 * 시간 없으면 null 반환
 */
export function parseTimeFromTitle(title) {
  if (!title) return null;

  let hour = null, minute = 0;
  let matchedPattern = null;

  // 패턴1: 숫자시 (예: 3시, 12시, 3시반, 3시 30분)
  const numMatch = title.match(/(\d{1,2})\s*시\s*(반|(\d{1,2})\s*분)?/);
  if (numMatch) {
    hour = parseInt(numMatch[1]);
    if (numMatch[2] === '반') minute = 30;
    else if (numMatch[3]) minute = parseInt(numMatch[3]);
    matchedPattern = numMatch[0];
  }

  // 패턴2: 한글시 (예: 다섯시, 세시 반)
  if (hour === null) {
    for (const [kr, num] of Object.entries(KR_NUM)) {
      const re = new RegExp(`${kr}\\s*시\\s*(반|(\\d{1,2})\\s*분)?`);
      const m = title.match(re);
      if (m) {
        hour = num;
        if (m[1] === '반') minute = 30;
        else if (m[2]) minute = parseInt(m[2]);
        matchedPattern = m[0];
        break;
      }
    }
  }

  // 패턴3: HH:MM 형식 (예: 17:30, 5:00)
  if (hour === null) {
    const colonMatch = title.match(/(\d{1,2}):(\d{2})/);
    if (colonMatch) {
      hour = parseInt(colonMatch[1]);
      minute = parseInt(colonMatch[2]);
      matchedPattern = colonMatch[0];
      if (hour >= 0 && hour <= 23) {
        const cleanTitle = title.replace(matchedPattern, '').replace(/\s+/g, ' ').trim();
        return { hour, minute, cleanTitle };
      }
    }
  }

  if (hour === null) return null;

  // 항상 오후 처리 (새벽 약속 없음)
  if (hour >= 1 && hour <= 11) hour += 12;

  const cleanTitle = title.replace(matchedPattern, '').replace(/\s+/g, ' ').trim();
  return { hour, minute, cleanTitle };
}

/**
 * 시간이 있는 이벤트의 알림 분 계산
 * - 오전 8시 알림
 * - 1시간 전 알림
 */
function _calcReminders(dateStr, hour, minute) {
  // 이벤트 시각 (분 단위, 자정 기준)
  const eventMin = hour * 60 + minute;
  const morning8 = 8 * 60; // 오전 8시 = 480분

  // 이벤트까지 남은 분 (오전 8시 기준)
  const minFrom8 = eventMin - morning8;

  const reminders = [{ method: 'popup', minutes: 60 }]; // 1시간 전

  if (minFrom8 > 60) {
    // 오전 8시 알림 (이벤트 시간 - 8시 = 분 차이)
    reminders.push({ method: 'popup', minutes: minFrom8 });
  }

  return reminders;
}

// ── 유틸 ────────────────────────────────────────────────────────

function _addOneDay(dateStr) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return d.toISOString().substring(0, 10);
}

function _subtractOneDay(dateStr) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().substring(0, 10);
}
