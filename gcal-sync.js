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
  const gcalEvent = {
    summary: ev.title,
    start: { date: ev.start },
    end: { date: _addOneDay(ev.end) }, // Google Calendar end date is exclusive
    extendedProperties: {
      private: { appEventId: ev.id }
    }
  };

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

  // Google Calendar end date is exclusive, subtract one day
  if (gcalEv.end?.date) {
    end = _subtractOneDay(end);
  }

  return {
    id: gcalEv.extendedProperties?.private?.appEventId || `gcal_${gcalEv.id}`,
    gcalId: gcalEv.id,
    title: gcalEv.summary || '(제목 없음)',
    start,
    end,
    color: GCAL_TO_COLOR[gcalEv.colorId] || '#3b82f6',
  };
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
