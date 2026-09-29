// 발품옥션 백엔드: 신청 접수(시트 저장 + 메일 알림), 물건 목록 제공, 관리자 물건 등록
// 스크립트 속성: NOTIFY(추가 알림 메일, 쉼표 구분), ADMIN_KEY(관리자 페이지 비밀번호)

const SHEET = '신청';
const HEAD = ['접수 시각', '종류', '물건', '법원', '사건번호', '매각기일', '진행 방식', '연락처', '요청사항', '페이지', '처리 상태'];
const ITEM_SHEET = '물건';
// 상태: 모집(함께 신청 받는 중) · 확정(출발 확정) · 리포트(열람 판매 중) · 숨김
const ITEM_HEAD = ['사건번호', '법원', '지역', '주소', '단지명', '용도', '면적', '감정가', '최저가', '유찰', '매각기일', '관심수', '상태', '리포트 열람수', '현장 확인일', '사진', '등록 시각'];
const GOAL = 3;

// 처음 한 번 편집기에서 실행: 권한 승인 + 시트 만들기 + 테스트 메일
function setup() {
  sheet_();
  itemSheet_();
  MailApp.sendEmail(recipients_(), '[발품옥션] 신청 알림 연결 완료', '앞으로 사이트에 신청이 들어오면 이 메일로 알려드립니다.');
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents || '{}');
    if (d.action === 'addItems') return out(addItems_(d));
    if (d.website) return out({ ok: true }); // 스팸봇용 숨은 칸

    const phone = String(d.phone || '').replace(/[^0-9]/g, '');
    if (!/^01\d{8,9}$/.test(phone)) return out({ ok: false, error: 'phone' });

    const row = [
      new Date(), clean(d.kind), clean(d.item), clean(d.court), clean(d.caseNo), clean(d.date),
      clean(d.mode), "'" + phone.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3'), clean(d.memo, 500), clean(d.page), '신규',
    ];

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try { sheet_().appendRow(row); } finally { lock.releaseLock(); }

    notify_(row);
    return out({ ok: true });
  } catch (err) {
    console.error(err);
    return out({ ok: false, error: 'server' });
  }
}

function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'items') return out({ ok: true, items: items_() });
  return out({ ok: true, service: 'balpum' });
}

// 사이트에 보여줄 물건 목록 + 실제 신청 인원
function items_() {
  const counts = {};
  const solo = {};
  const rows = sheet_().getDataRange().getValues().slice(1);
  rows.forEach(r => {
    const cs = String(r[4]).replace(/\s/g, '');
    if (!cs) return;
    if (r[1] === '함께 신청') counts[cs] = (counts[cs] || 0) + 1;
    if (r[1] === '단독 임장') solo[cs] = true;
    if (r[1] === '신청 취소') counts[cs] = Math.max((counts[cs] || 0) - 1, 0);
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  return itemSheet_().getDataRange().getValues().slice(1)
    .filter(r => r[0] && r[12] !== '숨김')
    .map(r => {
      const cs = String(r[0]).replace(/\s/g, '');
      const date = r[10] instanceof Date ? r[10] : new Date(String(r[10]).replace(/\./g, '-'));
      let status = r[12] || '모집';
      const count = counts[cs] || 0;
      if (status === '모집' && (count >= GOAL || solo[cs])) status = '확정';
      return {
        caseNo: r[0], court: r[1], region: r[2], addr: r[3], name: r[4], type: r[5], size: r[6],
        appr: Number(r[7]) || 0, min: Number(r[8]) || 0, fail: Number(r[9]) || 0,
        date: Utilities.formatDate(date, 'Asia/Seoul', 'yyyy-MM-dd'), interest: Number(r[11]) || 0,
        status, count, sold: Number(r[13]) || 0,
        visited: r[14] instanceof Date ? Utilities.formatDate(r[14], 'Asia/Seoul', 'yyyy-MM-dd') : String(r[14] || ''),
        photo: String(r[15] || ''),
      };
    })
    .filter(it => new Date(it.date) >= today);
}

// 관리자 페이지에서 정리한 물건을 '물건' 탭에 추가 (같은 사건번호는 건너뜀)
function addItems_(d) {
  const key = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!key || d.key !== key) return { ok: false, error: 'key' };
  const sh = itemSheet_();
  const have = new Set(sh.getDataRange().getValues().slice(1).map(r => String(r[0]).replace(/\s/g, '')));
  const list = (d.items || []).slice(0, 50);
  let added = 0;
  list.forEach(it => {
    const cs = String(it.caseNo || '').replace(/\s/g, '');
    if (!/^\d{4}타경\d+(\(\d+\))?$/.test(cs) || have.has(cs)) return;
    sh.appendRow([
      cs, clean(it.court), clean(it.region), clean(it.addr), clean(it.name), clean(it.type), clean(it.size),
      Number(it.appr) || 0, Number(it.min) || 0, Number(it.fail) || 0, clean(it.date), Number(it.interest) || 0,
      '모집', 0, '', clean(it.photo), new Date(),
    ]);
    have.add(cs);
    added++;
  });
  return { ok: true, added, skipped: list.length - added };
}

function clean(v, max) {
  let s = String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').slice(0, max || 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // 시트 수식 주입 방지
  return s;
}

function sheet_() {
  return ensure_(SHEET, HEAD);
}

function itemSheet_() {
  return ensure_(ITEM_SHEET, ITEM_HEAD);
}

function ensure_(name, head) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(head);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold');
  }
  return sh;
}

function recipients_() {
  const extra = PropertiesService.getScriptProperties().getProperty('NOTIFY') || '';
  return [Session.getEffectiveUser().getEmail()].concat(extra.split(',')).map(s => s.trim()).filter(Boolean).join(',');
}

function notify_(row) {
  const phone = String(row[7]).replace(/^'/, '');
  const title = `[발품옥션] ${row[1]} · ${row[2] || (row[3] + ' ' + row[4])}`;
  const body = HEAD.slice(0, 10).map((h, i) => `${h}: ${i === 7 ? phone : row[i]}`).join('\n')
    + '\n\n시트 열기: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl();
  MailApp.sendEmail(recipients_(), title, body);
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
