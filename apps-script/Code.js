// 발품옥션 백엔드: 신청 접수(시트 저장 + 메일 알림), 물건 목록 제공, 관리자 물건 등록, 적립금 자동 계산
// 스크립트 속성: NOTIFY(추가 알림 메일, 쉼표 구분), ADMIN_KEY(관리자 페이지 비밀번호)

const SHEET = '신청';
const HEAD = ['접수 시각', '종류', '물건', '법원', '사건번호', '매각기일', '진행 방식', '연락처', '요청사항', '페이지', '처리 상태', '금액', '적립금 사용'];
const C = { time: 0, kind: 1, caseNo: 4, mode: 6, phone: 7, status: 10, amount: 11, used: 12 };
const STATUSES = ['신규', '연락 완료', '결제 완료', '취소'];
const ITEM_SHEET = '물건';
// 상태: 모집(함께 신청 받는 중) · 확정(출발 확정) · 리포트(열람 판매 중) · 숨김
const ITEM_HEAD = ['사건번호', '법원', '지역', '주소', '단지명', '용도', '면적', '감정가', '최저가', '유찰', '매각기일', '관심수', '상태', '리포트 열람수', '현장 확인일', '사진', '등록 시각', '매각 결과', '낙찰가', '응찰자 수', '결과 입력일'];
const CREDIT_SHEET = '적립금';
const CREDIT_HEAD = ['연락처', '적립', '사용', '잔액', '내역'];
const GOAL = 3;
const SHARE = 20000;                         // 열람 1건마다 신청자에게 나눠 주는 적립금
const PRICE = { '함께 신청': 99000, '리포트 열람': 129000, '단독 임장': 250000, '정밀 임장': 450000, '안심 동행': 250000, '긴급 임장 문의': 300000 };
const SALE_UNTIL = new Date('2026-11-01T00:00:00+09:00'); // 오픈 30% 할인
const BIG = 1000000000;                      // 감정가 10억 이상 +5만

// 처음 한 번 편집기에서 실행: 권한 승인 + 시트 만들기 + 테스트 메일
function setup() {
  sheet_();
  itemSheet_();
  reportSheet_();
  ensure_(PARTNER_SHEET, PARTNER_HEAD);
  folder_(DriveApp.getRootFolder(), PHOTO_FOLDER); // 드라이브 권한 승인용
  rebuild_();
  MailApp.sendEmail(recipients_(), '[발품옥션] 신청 알림 연결 완료', '앞으로 사이트에 신청이 들어오면 이 메일로 알려드립니다.');
}

// 시트에서 '처리 상태'를 바꾸면 적립금·열람수를 다시 계산한다 (단순 트리거)
function onEdit(e) {
  const sh = e && e.range && e.range.getSheet();
  if (sh && sh.getName() === SHEET && e.range.getColumn() <= C.status + 1 && e.range.getLastColumn() >= C.status + 1) rebuild_();
}

function doPost(e) {
  try {
    const d = JSON.parse(e.postData.contents || '{}');
    if (d.action === 'addItems') return out(addItems_(d));
    if (d.action === 'partnerApply') return out(partnerApply_(d));
    if (d.action === 'uploadPhoto') return out(uploadPhoto_(d));
    if (d.action === 'saveReport') return out(saveReport_(d));
    if (d.action === 'adminUpdate') return out(adminUpdate_(d));
    if (d.website) return out({ ok: true }); // 스팸봇용 숨은 칸
    if (d.action === 'subscribe') return out(subscribe_(d));
    if (d.action === 'coSignup') return out(coSignup_(d));

    const phone = String(d.phone || '').replace(/[^0-9]/g, '');
    if (!/^01\d{8,9}$/.test(phone)) return out({ ok: false, error: 'phone' });
    const tel = phone.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');

    const kind = clean(d.kind);
    const amount = kind === '신청 취소' ? 0 : price_(kind, d.mode, d.caseNo);
    const row = [
      new Date(), kind, clean(d.item), clean(d.court), clean(d.caseNo), clean(d.date),
      clean(d.mode), "'" + tel, clean(d.memo, 500), clean(d.page), '신규', amount, 0,
    ];

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try { sheet_().appendRow(row); } finally { lock.releaseLock(); }

    const balance = rebuild_()[tel] || 0;
    notify_(row, balance);
    return out({ ok: true });
  } catch (err) {
    console.error(err);
    return out({ ok: false, error: 'server' });
  }
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === 'items') return out({ ok: true, items: items_() });
  if (p.action === 'partnerItems') return out(partnerItems_(p.key));
  if (p.action === 'report') return out(getReport_(p));
  if (p.action === 'myReport') return out(myReport_(p));
  if (p.action === 'adminItems') return out(adminItems_(p.key));
  if (p.action === 'records') return out(records_());
  if (p.action === 'coStats') return out(coStats_());
  if (p.action === 'pool') return out(pool_());
  if (p.action === 'blogFeed') return out(blogFeed_());
  if (p.action === 'unsub') return out(unsubscribe_(p.t));
  if (p.action === 'subCount') return out(subCount_(p.key));
  return out({ ok: true, service: 'balpum' });
}

// 서버에서 요금 계산: 오픈 할인, 감정가 10억 이상 추가금
function price_(kind, mode, caseNo) {
  let key = kind;
  if (kind === '물건 요청') {
    const m = String(mode || '');
    key = /정밀/.test(m) ? '정밀 임장' : /동행/.test(m) ? '안심 동행' : /단독/.test(m) ? '단독 임장' : '함께 신청';
  }
  let won = PRICE[key] || 0;
  if (!won) return 0;
  const item = findItem_(caseNo);
  if (item && Number(item[7]) >= BIG && key !== '리포트 열람') won += 50000;
  if (new Date() < SALE_UNTIL) won = Math.round(won * 0.7 / 1000) * 1000;
  return won;
}

function findItem_(caseNo) {
  const cs = String(caseNo || '').replace(/\s/g, '');
  if (!cs) return null;
  return itemSheet_().getDataRange().getValues().slice(1).find(r => String(r[0]).replace(/\s/g, '') === cs) || null;
}

// 적립금·사용액·리포트 열람수를 '신청' 탭에서 다시 계산해 기록한다. 번호별 잔액을 돌려준다.
function rebuild_() {
  const sh = sheet_();
  const values = sh.getDataRange().getValues();
  const rows = values.slice(1).map((r, i) => ({
    i, time: r[C.time] instanceof Date ? r[C.time].getTime() : 0, kind: r[C.kind],
    cs: String(r[C.caseNo]).replace(/\s/g, ''), tel: String(r[C.phone]).replace(/^'/, ''),
    paid: r[C.status] === '결제 완료', amount: Number(r[C.amount]) || 0,
  })).sort((a, b) => a.time - b.time);

  const bal = {}, earned = {}, spent = {}, log = {}, got = {}, used = rows.map(() => 0), sold = {};
  const note = (tel, s) => { (log[tel] = log[tel] || []).push(s); };

  rows.forEach(r => {
    if (!r.paid) return;
    // 1) 결제된 신청은 쌓인 적립금부터 차감
    if (bal[r.tel] > 0 && r.amount > 0) {
      const u = Math.min(bal[r.tel], r.amount);
      bal[r.tel] -= u; spent[r.tel] = (spent[r.tel] || 0) + u; used[r.i] = u;
      note(r.tel, `${r.cs || r.kind} 신청에 ${u.toLocaleString()}원 사용`);
    }
    // 2) 결제된 열람 → 그 물건의 결제한 함께 신청자에게 나눠 적립 (낸 금액까지만)
    if (r.kind === '리포트 열람' && r.cs) {
      sold[r.cs] = (sold[r.cs] || 0) + 1;
      const members = [];
      rows.forEach(m => {
        if (m.paid && m.kind === '함께 신청' && m.cs === r.cs && m.time <= r.time && !members.some(x => x.tel === m.tel)) members.push(m);
      });
      if (!members.length) return;
      const each = Math.floor(SHARE / members.length);
      members.forEach(m => {
        const k = r.cs + '|' + m.tel;
        const add = Math.max(0, Math.min(each, m.amount - (got[k] || 0)));
        if (!add) return;
        got[k] = (got[k] || 0) + add;
        bal[m.tel] = (bal[m.tel] || 0) + add; earned[m.tel] = (earned[m.tel] || 0) + add;
        note(m.tel, `${r.cs} 열람으로 ${add.toLocaleString()}원 적립`);
      });
    }
  });

  // 신청 탭: 적립금 사용 칸
  if (rows.length) sh.getRange(2, C.used + 1, values.length - 1, 1).setValues(values.slice(1).map((_, i) => [used[i] || 0]));

  // 적립금 탭
  const cs = creditSheet_();
  if (cs.getLastRow() > 1) cs.getRange(2, 1, cs.getLastRow() - 1, CREDIT_HEAD.length).clearContent();
  const tels = Object.keys(earned);
  if (tels.length) {
    cs.getRange(2, 1, tels.length, CREDIT_HEAD.length).setValues(tels.map(t =>
      ["'" + t, earned[t] || 0, spent[t] || 0, bal[t] || 0, (log[t] || []).slice(-5).join(' / ')]));
  }

  // 물건 탭: 리포트 열람수
  const is = itemSheet_();
  const iv = is.getDataRange().getValues();
  if (iv.length > 1) is.getRange(2, 14, iv.length - 1, 1).setValues(iv.slice(1).map(r => [sold[String(r[0]).replace(/\s/g, '')] || 0]));

  return bal;
}

// 사이트에 보여줄 물건 목록 + 실제 신청 인원
function items_() {
  const counts = {}, solo = {}, sold = {};
  sheet_().getDataRange().getValues().slice(1).forEach(r => {
    const cs = String(r[C.caseNo]).replace(/\s/g, '');
    if (!cs || r[C.status] === '취소') return;
    if (r[C.kind] === '함께 신청') counts[cs] = (counts[cs] || 0) + 1;
    if (r[C.kind] === '단독 임장') solo[cs] = true;
    if (r[C.kind] === '신청 취소') counts[cs] = Math.max((counts[cs] || 0) - 1, 0);
    if (r[C.kind] === '리포트 열람' && r[C.status] === '결제 완료') sold[cs] = (sold[cs] || 0) + 1;
  });

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const teasers = reportTeasers_();
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
        status, count, sold: sold[cs] || 0,
        visited: r[14] instanceof Date ? Utilities.formatDate(r[14], 'Asia/Seoul', 'yyyy-MM-dd') : String(r[14] || ''),
        photo: String(r[15] || ''), teaser: teasers[cs] || null,
      };
    })
    .filter(it => new Date(it.date) >= today);
}

// 관리자 페이지에서 정리한 물건을 '물건' 탭에 추가 (같은 사건번호는 건너뜀)
function addItems_(d) {
  const key = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  if (!key || d.key !== key) return { ok: false, error: 'key' };
  const sh = itemSheet_();
  const at = {};
  sh.getDataRange().getValues().forEach((r, i) => { if (i > 0) at[String(r[0]).replace(/\s/g, '')] = i + 1; });
  const list = (d.items || []).slice(0, 300);
  let added = 0, updated = 0, skipped = 0;
  const fresh = [];
  list.forEach(it => {
    const cs = String(it.caseNo || '').replace(/\s/g, '');
    const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
    if (!/^\d{4}타경\d+(\(\d+\))?$/.test(cs) || !it.date || String(it.date) < today) { skipped++; return; }   // 지난 날짜는 받지 않는다
    // 법원·지역·주소·단지·용도·면적·감정가·최저가·유찰·매각기일·관심수 (2~12번째 칸)
    const info = [clean(it.court), clean(it.region), clean(it.addr), clean(it.name), clean(it.type), clean(it.size),
      Number(it.appr) || 0, Number(it.min) || 0, Number(it.fail) || 0, clean(it.date), Number(it.interest) || 0];
    if (at[cs]) {   // 이미 있으면 정보만 새로 덮어쓴다 (상태·리포트 기록은 그대로)
      sh.getRange(at[cs], 2, 1, info.length).setValues([info]);
      updated++;
      return;
    }
    sh.appendRow([cs, ...info, d.hidden ? '숨김' : '모집', 0, '', clean(it.photo), new Date()]);   // 숨김: 시세 계산용 후보로만 저장
    at[cs] = sh.getLastRow();
    added++;
    fresh.push({ caseNo: cs, court: info[0], region: info[1], addr: info[2], name: info[3], type: info[4], size: info[5], appr: info[6], min: info[7], date: info[9] });
  });
  let notified = 0;
  if (!d.hidden) try { notified = notifySubscribers_(fresh); } catch (err) { console.error(err); }
  return { ok: true, added, updated, skipped, notified };
}

function clean(v, max) {
  let s = String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').slice(0, max || 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // 시트 수식 주입 방지
  return s;
}

function sheet_() {
  const sh = ensure_(SHEET, HEAD);
  // 예전 시트에 새 칸(금액, 적립금 사용)과 처리 상태 선택 목록을 붙인다
  if (sh.getLastColumn() < HEAD.length) {
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight('bold');
    sh.getRange(2, C.status + 1, 999, 1).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(true).build());
  }
  return sh;
}

function itemSheet_() {
  const sh = ensure_(ITEM_SHEET, ITEM_HEAD);
  // 예전 시트에 새 칸(매각 결과 등) 머리글을 붙인다
  if (sh.getLastColumn() < ITEM_HEAD.length) sh.getRange(1, 1, 1, ITEM_HEAD.length).setValues([ITEM_HEAD]).setFontWeight('bold');
  return sh;
}

function creditSheet_() {
  return ensure_(CREDIT_SHEET, CREDIT_HEAD);
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

function notify_(row, balance) {
  const phone = String(row[C.phone]).replace(/^'/, '');
  const amount = row[C.amount];
  const title = `[발품옥션] ${row[1]} · ${row[2] || (row[3] + ' ' + row[4])}`;
  const lines = HEAD.slice(0, 10).map((h, i) => `${h}: ${i === C.phone ? phone : row[i]}`);
  if (amount) {
    const use = Math.min(balance, amount);
    lines.push('', `요금: ${amount.toLocaleString()}원`);
    if (balance) lines.push(`이 번호의 적립금 잔액: ${balance.toLocaleString()}원`);
    if (use) lines.push(`적립금 차감: -${use.toLocaleString()}원`);
    lines.push(`청구할 금액: ${(amount - use).toLocaleString()}원`);
    lines.push('결제를 받으면 시트의 처리 상태를 "결제 완료"로 바꿔 주세요. 적립금은 자동으로 계산됩니다.');
  }
  MailApp.sendEmail(recipients_(), title, lines.join('\n') + '\n\n시트 열기: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl());
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
