// 블로그 자동 글감: 발행된 리포트에서 공개해도 되는 것만 (요약 제목·주의 항목 이름·개수). 세부 설명·사진·숫자 카드는 유료라 주지 않는다
function blogFeed_() {
  const items = {};
  itemSheet_().getDataRange().getValues().slice(1).forEach(r => { if (r[0]) items[String(r[0]).replace(/\s/g, '')] = r; });
  const ymd = v => v instanceof Date ? Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd') : String(v || '').replace(/\./g, '-').slice(0, 10);
  const scrub = s => String(s || '').replace(/\d+\s*호/g, '○호').replace(/01\d[-\s]?\d{3,4}[-\s]?\d{4}/g, '').slice(0, 90);
  const posts = [];
  reportSheet_().getDataRange().getValues().slice(1).forEach(r => {
    if (r[2] !== '공개') return;
    const cs = String(r[0]);
    const it = items[cs];
    if (!it || it[12] === '숨김' || /테스트/.test(String(it[3]) + String(it[4]))) return;
    let R = {};
    try { R = JSON.parse(r[5] || '{}'); } catch (_) { return; }
    const rows = (R.sections || []).flatMap(s => (s.rows || []).filter(x => String(x.v || '').trim()).map(x => ({ sec: s.title, k: x.k, st: x.st })));
    const n = st => rows.filter(x => x.st === st).length;
    posts.push({
      caseNo: cs, court: it[1], region: it[2], addr: it[3], name: scrub(it[4]).replace(/\s*○호.*$/, ''), type: it[5], size: it[6],
      appr: Number(it[7]) || 0, min: Number(it[8]) || 0, fail: Number(it[9]) || 0, date: ymd(it[10]),
      visited: ymd(R.visitedAt || it[14]), published: ymd(r[4]), evict: String(R.evict || ''),
      counts: { ok: n('ok'), warn: n('warn'), na: n('na'), photos: (R.photos || []).length },
      summary: (R.summary || []).slice(0, 6).map(s => ({ st: s.st, t: scrub(s.t) })),
      warnItems: rows.filter(x => x.st === 'warn').slice(0, 8).map(x => ({ sec: x.sec, k: scrub(x.k) })),
      result: String(it[R_COL - 1] || ''), price: Number(it[R_COL]) || 0, bidders: Number(it[R_COL + 1]) || 0,
    });
  });
  return { ok: true, posts };
}
