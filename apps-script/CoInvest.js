// 공동투자 장부(준비 중) 사전 신청: 수요 확인용. 이메일과 설문 답만 받고, 공개 집계는 숫자만 준다
const CO_SHEET = '공동투자 사전신청';
const CO_HEAD = ['신청 시각', '이메일', '공동투자 경험', '보통 인원', '가장 귀찮은 점', '낼 의향 가격', '하고 싶은 말'];
const CO_PAINS = ['약정서 작성', '납입 기록', '비용 분담', '임대수익 분배', '매각 정산', '의견 합의', '일정 관리'];
const CO_EXP = ['해 봤음', '하는 중', '계획 중', '관심만'];
const CO_SIZE = ['2명', '3~4명', '5명 이상'];
const CO_PRICE = ['무료만', '약정서 1건 1~2만 원', '물건당 월 9,900원', '월 2만 원 이상도 괜찮음'];

function coSheet_() {
  return ensure_(CO_SHEET, CO_HEAD);
}

function coSignup_(d) {
  const email = String(d.email || '').trim().toLowerCase();
  if (email.length > 100 || !/^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/.test(email)) return { ok: false, error: 'email' };
  if (d.agree !== true) return { ok: false, error: 'agree' };
  const pick = (v, list) => list.indexOf(String(v)) >= 0 ? String(v) : '';
  const pains = (Array.isArray(d.pains) ? d.pains : []).filter(p => CO_PAINS.indexOf(p) >= 0);
  const row = [new Date(), email, pick(d.exp, CO_EXP), pick(d.size, CO_SIZE), pains.join(','), pick(d.price, CO_PRICE), clean(d.memo, 300)];
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = coSheet_();
    const v = sh.getDataRange().getValues();
    const k = v.findIndex((r, i) => i > 0 && String(r[1]).toLowerCase() === email);
    if (k > 0) sh.getRange(k + 1, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
    return { ok: true, updated: k > 0 };
  } finally { lock.releaseLock(); }
}

// 공개 집계: 신청 수와 항목별 개수만 (이메일·메모는 주지 않는다)
function coStats_() {
  const rows = coSheet_().getDataRange().getValues().slice(1).filter(r => r[1]);
  const count = (i, list, multi) => Object.fromEntries(list.map(x => [x, rows.filter(r => multi ? String(r[i]).split(',').indexOf(x) >= 0 : r[i] === x).length]));
  return { ok: true, total: rows.length, exp: count(2, CO_EXP), size: count(3, CO_SIZE), pains: count(4, CO_PAINS, true), price: count(5, CO_PRICE) };
}
