// 경매 물건에 실거래 시세 붙이기: 같은 단지·비슷한 면적의 최근 매매가·전세가 → 할인율·전세가율·거래량
// 실행: node tools/price.mjs            (관리자 화면에 올린 물건 전부, 숨김 포함)
//       node tools/price.mjs --in=파일.json (시험용 물건 목록)
// 키: Windows 사용자 환경변수 DATA_GO_KR_KEY (공공데이터포털 국토교통부 아파트 매매·전월세 실거래가). 키는 출력하지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(DIR, '.cache');
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbzHqw1TadGxsVEYpnsnaBl2ZzXr0Ohn5uJ7bSRHe6LDLrDCNOPXfknYazCJImYj7QnvXQ/exec';
const MONTHS = 6;          // 최근 몇 달 거래로 시세를 잡을지
const AREA_GAP = 3;        // 전용면적 ±3㎡ 를 같은 평형으로 본다

const KEY = (process.env.DATA_GO_KR_KEY || execSync(`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('DATA_GO_KR_KEY','User')"`, { encoding: 'utf8' })).trim();
if (!KEY) { console.error('DATA_GO_KR_KEY 환경변수가 없습니다.'); process.exit(1); }

// 수도권 시군구 → 법정동 코드 앞 5자리. 모를 때는 '코드 없음'으로 건너뛴다 (API 응답으로 검증)
const SGG = {
  '서울 종로구': '11110', '서울 중구': '11140', '서울 용산구': '11170', '서울 성동구': '11200', '서울 광진구': '11215', '서울 동대문구': '11230',
  '서울 중랑구': '11260', '서울 성북구': '11290', '서울 강북구': '11305', '서울 도봉구': '11320', '서울 노원구': '11350', '서울 은평구': '11380',
  '서울 서대문구': '11410', '서울 마포구': '11440', '서울 양천구': '11470', '서울 강서구': '11500', '서울 구로구': '11530', '서울 금천구': '11545',
  '서울 영등포구': '11560', '서울 동작구': '11590', '서울 관악구': '11620', '서울 서초구': '11650', '서울 강남구': '11680', '서울 송파구': '11710', '서울 강동구': '11740',
  '경기 수원시 장안구': '41111', '경기 수원시 권선구': '41113', '경기 수원시 팔달구': '41115', '경기 수원시 영통구': '41117',
  '경기 성남시 수정구': '41131', '경기 성남시 중원구': '41133', '경기 성남시 분당구': '41135', '경기 의정부시': '41150',
  '경기 안양시 만안구': '41171', '경기 안양시 동안구': '41173', '경기 광명시': '41210', '경기 평택시': '41220', '경기 동두천시': '41250',
  '경기 안산시 상록구': '41271', '경기 안산시 단원구': '41273', '경기 고양시 덕양구': '41281', '경기 고양시 일산동구': '41285', '경기 고양시 일산서구': '41287',
  '경기 과천시': '41290', '경기 구리시': '41310', '경기 남양주시': '41360', '경기 오산시': '41370', '경기 시흥시': '41390', '경기 군포시': '41410',
  '경기 의왕시': '41430', '경기 하남시': '41450', '경기 용인시 처인구': '41461', '경기 용인시 기흥구': '41463', '경기 용인시 수지구': '41465',
  '경기 파주시': '41480', '경기 이천시': '41500', '경기 안성시': '41550', '경기 김포시': '41570', '경기 광주시': '41610', '경기 양주시': '41630', '경기 포천시': '41650',
  '경기 화성시': '41590', '경기 부천시 원미구': '41192', '경기 부천시 소사구': '41194', '경기 부천시 오정구': '41196', '경기 연천군': '41800', '경기 가평군': '41820', '경기 양평군': '41830', '경기 여주시': '41670', '경기 동두천시': '41250',
  '인천 제물포구': '28125', '인천 영종구': '28155', '인천 서해구': '28275', '인천 검단구': '28290',
  '인천 중구': '28125', '인천 동구': '28125', '인천 서구': '28275', '인천 미추홀구': '28177', '인천 연수구': '28185', '인천 남동구': '28200', '인천 부평구': '28237', '인천 계양구': '28245',
};
const norm = s => String(s || '').replace(/특별시|광역시|특별자치시/g, '').replace(/경기도/, '경기').replace(/\s+/g, ' ').trim();
function sggOf(addr) {
  const a = norm(addr).replace(/^서울특별시/, '서울');
  const keys = Object.keys(SGG).sort((x, y) => y.length - x.length);
  const k = keys.find(k => a.startsWith(k));
  if (!k) return null;
  const dong = a.slice(k.length).trim().split(' ')[0];
  let code = SGG[k];
  // 인천 개편(2026.7): 예전 중구의 영종도 → 영종구, 예전 서구의 검단 → 검단구 (국토부 API로 확인한 코드)
  if (k === '인천 중구' && /^(운서|중산|운남|운북|을왕|덕교|무의|남북|덕교)동$/.test(dong)) code = '28155';
  if (k === '인천 서구' && /^(원당|당하|마전|불로|백석|왕길|오류|금곡|대곡)동$/.test(dong)) code = '28290';
  return { name: k, code, dong };
}

const ym = back => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - back); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`; };
const num = s => Number(String(s || '').replace(/[^\d.]/g, '')) || 0;

// 실거래 조회 (지역·월 단위 캐시: 지난달 이전은 하루, 이번 달은 6시간)
async function fetchMonth(kind, code, month) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, `${kind}-${code}-${month}.json`);
  const ttl = month === ym(0) ? 6 * 3600e3 : 24 * 3600e3;
  if (fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < ttl) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const p = kind === 'trade' ? 'RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade' : 'RTMSDataSvcAptRent/getRTMSDataSvcAptRent';
  const rows = [];
  for (let page = 1; page < 30; page++) {
    const url = `https://apis.data.go.kr/1613000/${p}?serviceKey=${encodeURIComponent(KEY)}&LAWD_CD=${code}&DEAL_YMD=${month}&numOfRows=1000&pageNo=${page}`;
    let t = '';
    for (let tryN = 0; tryN < 4; tryN++) {
      try { t = await (await fetch(url)).text(); if (/<resultCode>/.test(t)) break; } catch (_) {}
      await new Promise(r => setTimeout(r, 1500 * (tryN + 1)));
    }
    const rc = (t.match(/<resultCode>([^<]*)/) || [])[1];
    if (rc !== '000') throw new Error(`실거래 API 오류 ${kind} ${code} ${month}: ${(t.match(/<(?:resultMsg|errMsg)>([^<]*)/) || [])[1] || t.slice(0, 80)}`);
    const items = [...t.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => Object.fromEntries([...m[1].matchAll(/<(\w+)>([^<]*)<\/\1>/g)].map(x => [x[1], x[2].trim()])));
    rows.push(...items);
    const total = num((t.match(/<totalCount>([^<]*)/) || [])[1]);
    if (rows.length >= total || !items.length) break;
  }
  fs.writeFileSync(file, JSON.stringify(rows));
  return rows;
}
const MEMO = {};
async function recent(kind, code, months) {
  const mk = kind + code + months;
  if (MEMO[mk]) return MEMO[mk];
  return (MEMO[mk] = recent0(kind, code, months));
}
async function recent0(kind, code, months) {
  const out = [];
  const all = await Promise.all(Array.from({ length: months }, (_, b) => fetchMonth(kind, code, ym(b)).then(rows => rows.map(r => ({ ...r, _ym: ym(b) })))));
  all.forEach(rows => out.push(...rows));
  return out;
}

// 단지명 비교: 공백·'아파트'·동 번호·괄호를 지우고 포함 관계로
const cleanName = s => String(s || '').replace(/\(.*?\)/g, '').replace(/제?\s*\d+\s*동.*$/, '').replace(/\s[A-Za-z가-힣]동(\s.*)?$/, '').replace(/아파트|APT|apt|단지/g, '').replace(/[\s·.,-]/g, '');
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

async function price(it) {
  const res = { caseNo: it.caseNo, court: it.court, addr: it.addr, name: it.name, type: it.type, size: it.size, appr: it.appr, min: it.min, date: it.date };
  if (!/아파트/.test(it.type || '')) return { ...res, note: '아파트가 아님 → 시세 자료 부족, 현장 탐문 필요' };
  const s = sggOf(it.addr);
  if (!s) return { ...res, note: '시군구 코드 없음 (수도권 목록 밖이거나 새로 바뀐 구)' };
  const area = num(it.size);
  const target = cleanName(it.name);
  const [trades, rents] = [await recent('trade', s.code, MONTHS), await recent('rent', s.code, MONTHS)];
  const sameDong = r => !s.dong || r.umdNm === s.dong;
  const sameApt = r => target && (cleanName(r.aptNm).includes(target) || target.includes(cleanName(r.aptNm)));
  const sameSize = r => !area || Math.abs(num(r.excluUseAr) - area) <= AREA_GAP;
  const valid = r => !String(r.cdealType || '').trim() && r.dealingGbn !== '직거래';   // 해제(취소)된 거래와 직거래(가족 간 등 특수 거래 가능) 제외
  let t = trades.filter(r => valid(r) && sameDong(r) && sameApt(r) && sameSize(r));
  let level = '같은 단지·평형';
  let perM2 = 0, nearby = 0;
  // 같은 평형 거래가 적으면 12개월까지 넓힌다
  let long = null;
  if (t.length < 2) {
    long = await recent('trade', s.code, 12);
    const t12 = long.filter(r => valid(r) && sameDong(r) && sameApt(r) && sameSize(r));
    if (t12.length > t.length) { t = t12; level = '같은 단지·평형 (12개월)'; }
  }
  // 그래도 없으면 같은 단지 다른 평형의 ㎡당 가격으로 환산 (면적 차이 ±40% 안쪽)
  if (!t.length && area) {
    const other = (long || trades).filter(r => valid(r) && sameDong(r) && sameApt(r) && num(r.excluUseAr) / area > 0.6 && num(r.excluUseAr) / area < 1.4);
    if (other.length >= 2) { perM2 = median(other.map(r => num(r.dealAmount) * 10000 / num(r.excluUseAr))); t = other; level = '같은 단지 다른 평형 (㎡당 환산)'; }
  }
  if (!t.length) {
    const n = trades.filter(r => valid(r) && sameDong(r) && sameSize(r));
    nearby = median(n.map(r => num(r.dealAmount) * 10000));
    level = '단지 거래 없음';
  }
  const j = rents.filter(r => num(r.monthlyRent) === 0 && sameDong(r) && sameApt(r) && (level.includes('환산') ? true : sameSize(r)));
  const sale = perM2 ? Math.round(perM2 * area / 1e5) * 1e5 : median(t.map(r => num(r.dealAmount) * 10000));
  const jeonse = level.includes('환산') && j.length ? Math.round(median(j.map(r => num(r.deposit) * 10000 / num(r.excluUseAr))) * area / 1e5) * 1e5 : median(j.map(r => num(r.deposit) * 10000));
  return {
    ...res, sgg: s.name, level, apt: t[0]?.aptNm || '',
    saleMedian: sale, saleCount: t.length, jeonseMedian: jeonse, jeonseCount: j.length, nearby, perM2: Math.round(perM2),
    discount: sale && it.min ? Math.round((1 - it.min / sale) * 1000) / 10 : null,
    jeonseRatio: jeonse && it.min ? Math.round(jeonse / it.min * 1000) / 10 : null,
    gap: jeonse && it.min ? it.min - jeonse : null,
    recent: t.sort((a, b) => (b.dealYear + b.dealMonth.padStart(2, '0') + b.dealDay.padStart(2, '0')).localeCompare(a.dealYear + a.dealMonth.padStart(2, '0') + a.dealDay.padStart(2, '0')))
      .slice(0, 3).map(r => `${r.dealYear}.${r.dealMonth}.${r.dealDay} ${r.floor}층 ${num(r.excluUseAr)}㎡ ${eok(num(r.dealAmount) * 10000)}`),
  };
}

const eok = won => { const v = Math.round((Number(won) || 0) / 10000), e = Math.floor(v / 10000), m = v % 10000; return (e ? e + '억' : '') + (m ? (e ? ' ' : '') + m.toLocaleString() + '만' : '') || '0'; };
// 점수: 할인율 중심 + 전세가율 보너스 + 거래량(자료 신뢰도). 같은 단지를 못 찾으면 감점
function score(p) {
  if (p.discount == null || p.saleCount < 2) return -1;   // 단지 거래 2건 미만은 순위에서 뺀다
  let s = p.discount;
  if (p.jeonseRatio) s += Math.max(0, Math.min(p.jeonseRatio, 100) - 60) * 0.3;
  s += Math.min(p.saleCount, 10) * 0.5;
  if (p.level.includes('환산')) s -= 5;
  if (p.level.includes('12개월')) s -= 2;
  return Math.round(s * 10) / 10;
}

const arg = k => (process.argv.find(x => x.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=');
const items = arg('in') ? JSON.parse(fs.readFileSync(arg('in'), 'utf8')) : ((await (await fetch(ENDPOINT + '?action=pool')).json()).items || []);
const out = [];
for (const it of items) {
  try { const p = await price(it); out.push({ ...p, score: score(p) }); }
  catch (e) { out.push({ caseNo: it.caseNo, addr: it.addr, name: it.name, note: e.message, score: -1 }); }
}
out.sort((a, b) => b.score - a.score);
// 명세서 판정(tools/spec.py 결과)을 붙인다: 통과 / 제외 / 확인 필요 / 명세서 없음
const SPECS = path.join(CACHE, 'specs.json');
const specs = fs.existsSync(SPECS) ? Object.fromEntries(JSON.parse(fs.readFileSync(SPECS, 'utf8')).map(x => [x.key, x])) : {};
out.forEach(p => { const sp = specs[p.caseNo]; p.spec = sp ? sp.verdict : '명세서 없음'; p.specWhy = sp ? sp.reasons.join(' / ') : ''; });
fs.mkdirSync(CACHE, { recursive: true });
fs.writeFileSync(path.join(CACHE, 'result.json'), JSON.stringify(out, null, 1));
console.log(`물건 ${items.length}건 시세 계산 (최근 ${MONTHS}개월 실거래)\n`);
out.forEach((p, i) => {
  console.log(`${i + 1}. ${p.addr} ${p.name} · ${p.type || ''} ${p.size || ''} · ${p.caseNo}`);
  if (p.note) { console.log(`   ${p.note}\n`); return; }
  if (p.level === '단지 거래 없음') { console.log(`   최근 ${MONTHS}개월 이 단지 거래 없음 → 시세 없음, 현장 탐문 필요${p.nearby ? ` (같은 동 비슷한 면적 참고 ${eok(p.nearby)})` : ''}\n`); return; }
  console.log(`   최저가 ${eok(p.min)} | 시세(중간값) ${eok(p.saleMedian)} (${p.saleCount}건, ${p.level}) | 할인율 ${p.discount ?? '-'}%`);
  console.log(`   전세 ${p.jeonseMedian ? eok(p.jeonseMedian) : '-'} (${p.jeonseCount}건) | 전세가율 ${p.jeonseRatio ?? '-'}% | 최저가-전세 ${p.gap != null ? eok(p.gap) : '-'} | 점수 ${p.score}`);
  if (p.recent?.length) console.log(`   최근 거래: ${p.recent.join(' / ')}`);
  console.log(`   명세서: ${p.spec}${p.specWhy ? ' — ' + p.specWhy : ''}`);
  console.log('');
});

// 요약: 서류상 위험 신호 없음 + 시세보다 싼 물건
const ranked = out.filter(p => p.score >= 0);
const pass = ranked.filter(p => p.spec === '통과');
const need = ranked.filter(p => p.spec === '명세서 없음').slice(0, 15);
console.log('==================================================');
console.log(`서류상 위험 신호 없음 + 시세 대비 할인 (명세서 통과 ${pass.length}건)`);
pass.slice(0, 10).forEach((p, i) => console.log(`${i + 1}. ${p.caseNo} ${p.addr} ${p.name} · 최저 ${eok(p.min)} · 시세 ${eok(p.saleMedian)} · 할인 ${p.discount}% · 전세율 ${p.jeonseRatio ?? '-'}%`));
const excl = ranked.filter(p => p.spec === '제외');
if (excl.length) { console.log(`\n명세서에서 제외된 상위 물건 ${excl.length}건`); excl.slice(0, 10).forEach(p => console.log(`- ${p.caseNo} ${p.addr} ${p.name}: ${p.specWhy.slice(0, 90)}`)); }
console.log(`\n다음에 명세서를 받아 볼 후보 (점수 순, 명세서 없음):`);
need.forEach((p, i) => console.log(`${i + 1}. ${p.court || ''} ${p.caseNo} · ${p.date} · ${p.addr} ${p.name} · 할인 ${p.discount}%`));
