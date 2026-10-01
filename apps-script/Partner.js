// 파트너: 지원 접수, 현장 리포트 작성(사진 업로드·임시 저장·발행), 리포트 열람
// 스크립트 속성: PARTNER_KEY(파트너용 비밀번호, ADMIN_KEY도 통과)

const PARTNER_SHEET = '파트너';
const PARTNER_HEAD = ['접수 시각', '이름', '연락처', '활동 지역', '자격', '차량', '가능한 때', '경력·소개', '처리 상태'];
const REPORT_SHEET = '리포트';
const REPORT_HEAD = ['사건번호', '토큰', '상태', '작성자', '수정 시각', '내용(JSON)'];
const PHOTO_FOLDER = '발품옥션 리포트 사진';
const SITE = 'https://v1234vs1-creator.github.io/balpum-auction/';

function partnerOk_(key) {
  const p = PropertiesService.getScriptProperties();
  const keys = [p.getProperty('PARTNER_KEY'), p.getProperty('ADMIN_KEY')].filter(Boolean);
  return !!key && keys.indexOf(String(key)) >= 0;
}

// 파트너 지원 (누구나)
function partnerApply_(d) {
  if (d.website) return { ok: true };
  const phone = String(d.phone || '').replace(/[^0-9]/g, '');
  if (!/^01\d{8,9}$/.test(phone)) return { ok: false, error: 'phone' };
  const tel = phone.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
  const row = [new Date(), clean(d.name, 40), "'" + tel, clean(d.region, 200), clean(d.license, 100), clean(d.car, 20), clean(d.days, 100), clean(d.intro, 1000), '신규'];
  ensure_(PARTNER_SHEET, PARTNER_HEAD).appendRow(row);
  MailApp.sendEmail(recipients_(), `[발품옥션] 파트너 지원 · ${row[1]} (${row[3]})`,
    PARTNER_HEAD.slice(0, 8).map((h, i) => `${h}: ${i === 2 ? tel : row[i]}`).join('\n') + '\n\n시트 열기: ' + SpreadsheetApp.getActiveSpreadsheet().getUrl());
  return { ok: true };
}

// 파트너 화면: 물건 목록 + 신청자 요청사항 + 저장된 초안
function partnerItems_(key) {
  if (!partnerOk_(key)) return { ok: false, error: 'key' };
  const memos = {};
  sheet_().getDataRange().getValues().slice(1).forEach(r => {
    const cs = String(r[C.caseNo]).replace(/\s/g, '');
    if (cs && r[8] && ['함께 신청', '단독 임장', '물건 요청'].indexOf(r[C.kind]) >= 0 && r[C.status] !== '취소') (memos[cs] = memos[cs] || []).push(String(r[8]));
  });
  const drafts = {};
  reportSheet_().getDataRange().getValues().slice(1).forEach(r => { drafts[String(r[0])] = { token: r[1], status: r[2], data: r[5] }; });
  const items = itemSheet_().getDataRange().getValues().slice(1).filter(r => r[0] && r[12] !== '숨김').map(r => {
    const cs = String(r[0]).replace(/\s/g, '');
    const date = r[10] instanceof Date ? Utilities.formatDate(r[10], 'Asia/Seoul', 'yyyy-MM-dd') : String(r[10]);
    return { caseNo: cs, court: r[1], region: r[2], addr: r[3], name: r[4], type: r[5], size: r[6], appr: Number(r[7]) || 0, min: Number(r[8]) || 0,
      date, status: r[12], memos: memos[cs] || [], draft: drafts[cs] || null };
  });
  return { ok: true, items };
}

// 사진 1장 업로드 → 구글 드라이브(링크 있는 사람만 보기)
function uploadPhoto_(d) {
  if (!partnerOk_(d.key)) return { ok: false, error: 'key' };
  const cs = String(d.caseNo || '').replace(/[^0-9가-힣()]/g, '') || '기타';
  const root = folder_(DriveApp.getRootFolder(), PHOTO_FOLDER);
  const dir = folder_(root, cs);
  const blob = Utilities.newBlob(Utilities.base64Decode(String(d.data || '')), String(d.mime || 'image/jpeg'), String(d.name || 'photo.jpg').slice(0, 80));
  const file = dir.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const id = file.getId();
  return { ok: true, id, url: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1600' };
}

function folder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// 리포트 임시 저장 / 발행
function saveReport_(d) {
  if (!partnerOk_(d.key)) return { ok: false, error: 'key' };
  const cs = String(d.caseNo || '').replace(/\s/g, '');
  if (!cs) return { ok: false, error: 'case' };
  const json = JSON.stringify(d.report || {});
  if (json.length > 48000) return { ok: false, error: 'size' };
  const sh = reportSheet_();
  const rows = sh.getDataRange().getValues();
  let i = rows.findIndex((r, n) => n > 0 && String(r[0]) === cs);
  let token = i > 0 ? rows[i][1] : Utilities.getUuid().replace(/-/g, '').slice(0, 20);
  const status = d.publish ? '공개' : (i > 0 && rows[i][2] === '공개' ? '공개' : '작성 중');
  const row = [cs, token, status, clean(d.author || (d.report && d.report.partner) || '', 60), new Date(), json];
  if (i > 0) sh.getRange(i + 1, 1, 1, row.length).setValues([row]); else sh.appendRow(row);

  if (d.publish) {
    // 물건 탭: 상태를 '리포트'로, 현장 확인일 기록
    const is = itemSheet_();
    const iv = is.getDataRange().getValues();
    const k = iv.findIndex((r, n) => n > 0 && String(r[0]).replace(/\s/g, '') === cs);
    if (k > 0) {
      is.getRange(k + 1, 13).setValue('리포트');
      if (d.report && d.report.visitedAt) is.getRange(k + 1, 15).setValue(d.report.visitedAt);
    }
    const link = SITE + 'report.html?id=' + token;
    MailApp.sendEmail(recipients_(), `[발품옥션] 리포트 발행 · ${cs}`,
      `${(d.report && d.report.title) || cs} 리포트가 발행되었습니다.\n\n결제한 신청자에게 보낼 링크:\n${link}\n\n시트 열기: ${SpreadsheetApp.getActiveSpreadsheet().getUrl()}`);
  }
  return { ok: true, token, status };
}

// 리포트 열람: 공개된 것만 (파트너 비밀번호가 있으면 작성 중인 것도)
function getReport_(p) {
  const rows = reportSheet_().getDataRange().getValues().slice(1);
  const r = rows.find(x => String(x[1]) === String(p.id || ''));
  if (!r) return { ok: false, error: 'notfound' };
  if (r[2] !== '공개' && !partnerOk_(p.key)) return { ok: false, error: 'draft' };
  return { ok: true, status: r[2], report: JSON.parse(r[5] || '{}') };
}

function reportSheet_() {
  return ensure_(REPORT_SHEET, REPORT_HEAD);
}
