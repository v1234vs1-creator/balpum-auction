// 낙찰 결과 기록: 관리자가 매각 결과를 입력하면, 우리가 현장을 다녀온 물건의 결과를 사이트에 공개한다
// 법원 사이트는 자동 조회하지 않는다. 결과는 사람이 보고 입력한다.
const RESULTS = ['낙찰', '유찰', '취하', '변경', '기각', '정지'];
const R_COL = 18; // '물건' 탭의 매각 결과 칸(1부터). 이어서 낙찰가·응찰자 수·결과 입력일

// 관리자 화면에서 결과 저장 (빈 결과는 지우기)
function setResult_(is, k, d) {
  const result = String(d.result || '');
  if (result && RESULTS.indexOf(result) < 0) return { ok: false, error: 'result' };
  const digits = v => Number(String(v == null ? '' : v).replace(/[^\d]/g, '')) || 0;
  const price = result === '낙찰' ? digits(d.price) : 0;
  const bidders = result === '낙찰' ? Math.min(digits(d.bidders), 999) : 0;
  if (result === '낙찰' && !price) return { ok: false, error: 'price' };
  is.getRange(k + 1, R_COL, 1, 4).setValues([[result, price || '', bidders || '', result ? new Date() : '']]);
  return { ok: true };
}

// 사이트 공개용: 결과가 입력됐고, 리포트를 발행했거나 현장 확인일이 있는 물건만
function records_() {
  const published = {};
  reportSheet_().getDataRange().getValues().slice(1).forEach(r => { if (r[2] === '공개') published[String(r[0])] = true; });
  const teasers = reportTeasers_();
  const ymd = v => v instanceof Date ? Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd') : String(v || '').replace(/\./g, '-');
  const list = itemSheet_().getDataRange().getValues().slice(1)
    .filter(r => r[0] && r[R_COL - 1] && r[12] !== '숨김' && !/테스트/.test(String(r[3]) + String(r[4])))
    .map(r => {
      const cs = String(r[0]).replace(/\s/g, '');
      if (!published[cs] && !r[14]) return null;
      const appr = Number(r[7]) || 0, price = Number(r[R_COL]) || 0;
      return {
        caseNo: cs, court: r[1], region: r[2], addr: r[3], name: String(r[4]).replace(/\s*\d+\s*호.*$/, ''), type: r[5], size: r[6],
        appr, min: Number(r[8]) || 0, fail: Number(r[9]) || 0, date: ymd(r[10]), visited: ymd(r[14]),
        result: r[R_COL - 1], price, bidders: Number(r[R_COL + 1]) || 0,
        rate: appr && price ? Math.round(price / appr * 1000) / 10 : 0,
        teaser: teasers[cs] || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date));
  const sold = list.filter(x => x.result === '낙찰' && x.rate);
  const avgRate = sold.length ? Math.round(sold.reduce((s, x) => s + x.rate, 0) / sold.length * 10) / 10 : 0;
  return { ok: true, records: list, summary: { count: list.length, sold: sold.length, avgRate } };
}

// 시세 계산 도구(tools/price.mjs)용 후보 목록: 숨김 포함, 매각기일이 지나지 않은 물건 (법원 공개 정보만)
function pool_() {
  const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  const ymd = v => v instanceof Date ? Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd') : String(v || '').replace(/\./g, '-').slice(0, 10);
  const items = itemSheet_().getDataRange().getValues().slice(1).filter(r => r[0] && ymd(r[10]) >= today).map(r => ({
    caseNo: String(r[0]), court: r[1], region: r[2], addr: r[3], name: r[4], type: r[5], size: r[6],
    appr: Number(r[7]) || 0, min: Number(r[8]) || 0, fail: Number(r[9]) || 0, date: ymd(r[10]), status: r[12] || '모집',
  }));
  return { ok: true, items };
}
