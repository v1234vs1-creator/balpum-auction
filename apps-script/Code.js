// 발품옥션 신청 접수: 사이트 → 구글 시트 저장 + 메일 알림
// 알림을 더 받을 메일은 스크립트 속성 NOTIFY에 쉼표로 넣는다.

const SHEET = '신청';
const HEAD = ['접수 시각', '종류', '물건', '법원', '사건번호', '매각기일', '진행 방식', '연락처', '요청사항', '페이지', '처리 상태'];

// 처음 한 번 편집기에서 실행: 권한 승인 + 시트 만들기 + 테스트 메일
function setup() {
  sheet_();
  MailApp.sendEmail(recipients_(), '[발품옥션] 신청 알림 연결 완료', '앞으로 사이트에 신청이 들어오면 이 메일로 알려드립니다.');
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents || '{}');
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

function doGet() {
  return out({ ok: true, service: 'balpum' });
}

function clean(v, max) {
  let s = String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').slice(0, max || 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // 시트 수식 주입 방지
  return s;
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET, 0);
    sh.appendRow(HEAD);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEAD.length).setFontWeight('bold');
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
