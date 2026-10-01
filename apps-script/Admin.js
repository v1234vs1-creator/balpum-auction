// 관리자: 등록된 물건 관리(상태 변경·숨기기·삭제), 시험 데이터 정리
const TEST_PHONE = '010-0000-0000';

function adminOk_(key) {
  const k = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  return !!k && String(key) === k;
}

// 모든 물건 + 신청 인원 + 리포트 링크
function adminItems_(key) {
  if (!adminOk_(key)) return { ok: false, error: 'key' };
  const counts = {}, sold = {};
  sheet_().getDataRange().getValues().slice(1).forEach(r => {
    const cs = String(r[C.caseNo]).replace(/\s/g, '');
    if (!cs || r[C.status] === '취소') return;
    if (r[C.kind] === '함께 신청' || r[C.kind] === '단독 임장') counts[cs] = (counts[cs] || 0) + 1;
    if (r[C.kind] === '신청 취소') counts[cs] = Math.max((counts[cs] || 0) - 1, 0);
    if (r[C.kind] === '리포트 열람' && r[C.status] === '결제 완료') sold[cs] = (sold[cs] || 0) + 1;
  });
  const reports = {};
  reportSheet_().getDataRange().getValues().slice(1).forEach(r => { reports[String(r[0])] = { token: r[1], status: r[2] }; });
  const items = itemSheet_().getDataRange().getValues().slice(1).filter(r => r[0]).map(r => {
    const cs = String(r[0]).replace(/\s/g, '');
    return { caseNo: cs, court: r[1], addr: r[3], name: r[4],
      date: r[10] instanceof Date ? Utilities.formatDate(r[10], 'Asia/Seoul', 'yyyy-MM-dd') : String(r[10]),
      status: r[12] || '모집', count: counts[cs] || 0, sold: sold[cs] || 0, report: reports[cs] || null };
  });
  return { ok: true, items };
}

// op: status(상태 바꾸기) · delete(물건·리포트 줄 삭제 + 사진 폴더 휴지통) · cleanTest(시험 데이터 정리)
function adminUpdate_(d) {
  if (!adminOk_(d.key)) return { ok: false, error: 'key' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (d.op === 'cleanTest') return cleanTest_();
    const cs = String(d.caseNo || '').replace(/\s/g, '');
    if (!cs) return { ok: false, error: 'case' };
    const is = itemSheet_();
    const iv = is.getDataRange().getValues();
    const k = iv.findIndex((r, n) => n > 0 && String(r[0]).replace(/\s/g, '') === cs);
    if (k < 1) return { ok: false, error: 'notfound' };
    if (d.op === 'status') {
      if (['모집', '확정', '리포트', '숨김'].indexOf(d.status) < 0) return { ok: false, error: 'status' };
      is.getRange(k + 1, 13).setValue(d.status);
      return { ok: true };
    }
    if (d.op === 'delete') {
      is.deleteRow(k + 1);
      deleteRows_(reportSheet_(), r => String(r[0]) === cs);
      trashPhotos_(cs);
      return { ok: true };
    }
    return { ok: false, error: 'op' };
  } finally { lock.releaseLock(); }
}

// 시험용 번호(010-0000-0000)로 들어온 신청·파트너 지원, '테스트'가 들어간 물건과 그 리포트·사진
function cleanTest_() {
  const n1 = deleteRows_(sheet_(), r => String(r[C.phone]).replace(/^'/, '') === TEST_PHONE || r[C.kind] === '테스트');
  const n2 = deleteRows_(ensure_(PARTNER_SHEET, PARTNER_HEAD), r => String(r[2]).replace(/^'/, '') === TEST_PHONE);
  const testCases = itemSheet_().getDataRange().getValues().slice(1).filter(r => /테스트/.test(String(r[4]) + String(r[3]))).map(r => String(r[0]).replace(/\s/g, ''));
  const n3 = deleteRows_(itemSheet_(), r => testCases.indexOf(String(r[0]).replace(/\s/g, '')) >= 0);
  deleteRows_(reportSheet_(), r => testCases.indexOf(String(r[0])) >= 0);
  testCases.forEach(trashPhotos_);
  rebuild_();
  return { ok: true, removed: { 신청: n1, 파트너: n2, 물건: n3 } };
}

// 조건에 맞는 줄을 아래에서부터 지운다 (머리줄 제외)
function deleteRows_(sh, test) {
  const v = sh.getDataRange().getValues();
  let n = 0;
  for (let i = v.length - 1; i >= 1; i--) if (test(v[i])) { sh.deleteRow(i + 1); n++; }
  return n;
}

// 사진 폴더는 바로 지우지 않고 휴지통으로 (30일 동안 되살릴 수 있음)
function trashPhotos_(cs) {
  const roots = DriveApp.getRootFolder().getFoldersByName(PHOTO_FOLDER);
  if (!roots.hasNext()) return;
  const it = roots.next().getFoldersByName(cs.replace(/[^0-9가-힣()]/g, ''));
  while (it.hasNext()) it.next().setTrashed(true);
}
