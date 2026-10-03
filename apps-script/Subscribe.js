// 새 물건 알림 구독: 손님이 지역·최저가 상한·이메일을 남기면, 관리자가 새 물건을 올릴 때 맞는 물건을 메일로 알린다
const SUB_SHEET = '알림 구독';
const SUB_HEAD = ['등록 시각', '이메일', '지역', '최저가 상한', '해지 코드', '최근 알림', '받은 알림 수'];
const SUB_REGIONS = ['서울', '경기', '인천', '지방'];

function subSheet_() {
  return ensure_(SUB_SHEET, SUB_HEAD);
}

const regionOf_ = r => ['서울', '경기', '인천'].indexOf(String(r)) >= 0 ? String(r) : '지방';

function subscribe_(d) {
  const email = String(d.email || '').trim().toLowerCase();
  if (email.length > 100 || !/^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/.test(email)) return { ok: false, error: 'email' };
  if (d.agree !== true) return { ok: false, error: 'agree' };
  const regions = (Array.isArray(d.regions) ? d.regions : []).filter(r => SUB_REGIONS.indexOf(r) >= 0);
  const max = Math.max(0, Math.round(Number(d.max) || 0));
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let token, isNew;
  try {
    const sh = subSheet_();
    const v = sh.getDataRange().getValues();
    const k = v.findIndex((r, i) => i > 0 && String(r[1]).toLowerCase() === email);
    isNew = k < 1;
    if (isNew) {
      token = Utilities.getUuid().replace(/-/g, '');
      sh.appendRow([new Date(), email, regions.join(','), max, token, '', 0]);
    } else {
      token = String(v[k][4]);
      sh.getRange(k + 1, 3, 1, 2).setValues([[regions.join(','), max]]);
    }
  } finally { lock.releaseLock(); }

  // 처음 등록할 때만 안내 메일 (남의 주소로 반복 발송되는 것을 막는다)
  if (isNew) {
    const cond = `${regions.length ? regions.join('·') : '전체 지역'} · ${max ? '최저가 ' + eok_(max) + ' 이하' : '가격 제한 없음'}`;
    mail_(email, '[발품옥션] 새 물건 알림을 신청하셨습니다', [
      '발품옥션 새 물건 알림에 등록되었습니다.',
      '',
      `조건: ${cond}`,
      '조건에 맞는 경매 물건이 목록에 올라오면 이 주소로 알려드립니다. 물건은 법원 공고(매각기일 약 2주 전)에 맞춰 올라옵니다.',
      '',
      '직접 신청하지 않으셨다면 아래 링크로 바로 해지해 주세요. 해지하면 주소는 즉시 지웁니다.',
    ], token);
  }
  return { ok: true, updated: !isNew };
}

function unsubscribe_(t) {
  const token = String(t || '').replace(/[^0-9a-f]/g, '');
  if (token.length < 20) return { ok: false, error: 'token' };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return { ok: true, removed: deleteRows_(subSheet_(), r => String(r[4]) === token) > 0 };
  } finally { lock.releaseLock(); }
}

// 새로 올라온 물건을 조건이 맞는 구독자에게 한 통씩 묶어서 보낸다. 보낸 사람 수를 돌려준다.
function notifySubscribers_(items) {
  items = items.filter(it => !/테스트/.test(String(it.name) + String(it.addr)));
  if (!items.length) return 0;
  const sh = subSheet_();
  const v = sh.getDataRange().getValues();
  let sent = 0;
  for (let i = 1; i < v.length; i++) {
    const email = String(v[i][1]);
    if (!email) continue;
    const regions = String(v[i][2] || '').split(',').filter(Boolean);
    const max = Number(v[i][3]) || 0;
    const hit = items.filter(it => (!regions.length || regions.indexOf(regionOf_(it.region)) >= 0) && (!max || Number(it.min) <= max));
    if (!hit.length) continue;
    if (MailApp.getRemainingDailyQuota() < 5) { console.warn('메일 한도 부족, 알림 중단'); break; }
    const lines = [`조건에 맞는 경매 물건 ${hit.length}건이 새로 올라왔습니다.`, ''];
    hit.forEach(it => {
      const rate = it.appr ? Math.round(it.min / it.appr * 100) : 0;
      lines.push(`■ ${it.addr} ${it.name}`.trim());
      lines.push(`   ${it.court} ${it.caseNo} · ${[it.type, it.size].filter(Boolean).join(' ')}`);
      lines.push(`   최저가 ${eok_(it.min)}${rate ? ` (감정가 ${eok_(it.appr)}의 ${rate}%)` : ''} · 매각기일 ${it.date} · 모집 마감 ${cutoff_(it.date)}`);
      lines.push('');
    });
    lines.push(`3명이 모이면 파트너가 현장에 갑니다. 신청과 상세 정보: ${SITE}#list`);
    try {
      mail_(email, `[발품옥션] 새 경매 물건 ${hit.length}건 · ${hit[0].addr || hit[0].court}`, lines, String(v[i][4]));
      sh.getRange(i + 1, 6, 1, 2).setValues([[new Date(), (Number(v[i][6]) || 0) + 1]]);
      sent++;
    } catch (err) { console.error(email, err); }
  }
  return sent;
}

function mail_(to, subject, lines, token) {
  const body = lines.join('\n') + `\n\n알림 그만 받기: ${SITE}?unsub=${token}\n발품옥션 · 경매 물건 현장 확인 리포트`;
  MailApp.sendEmail({ to, subject, body, name: '발품옥션' });
}

function eok_(won) {
  won = Number(won) || 0;
  const e = Math.floor(won / 1e8), m = Math.round(won % 1e8 / 1e4);
  return e ? `${e}억${m ? ' ' + m.toLocaleString() + '만' : ''}원` : `${m.toLocaleString()}만원`;
}

// 모집 마감 = 매각기일 5일 전
function cutoff_(date) {
  const d = new Date(String(date) + 'T00:00:00+09:00');
  if (isNaN(d)) return '-';
  d.setDate(d.getDate() - 5);
  return Utilities.formatDate(d, 'Asia/Seoul', 'M월 d일');
}

// 관리자 화면용 구독자 수
function subCount_(key) {
  if (!adminOk_(key)) return { ok: false, error: 'key' };
  return { ok: true, count: Math.max(subSheet_().getLastRow() - 1, 0) };
}
