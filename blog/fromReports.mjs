// 발행된 리포트 → 임장 노트 글(blog/posts/report-*.md) 자동 생성
// 공개 범위: 요약 제목, 주의 항목 이름, 개수, 매각 결과. 금액·세부 설명·사진은 유료 리포트에만 남긴다.
// 품질 기준을 못 넘는 리포트(시험 작성 등)는 글을 만들지 않는다.
// 실행: node blog/fromReports.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbzHqw1TadGxsVEYpnsnaBl2ZzXr0Ohn5uJ7bSRHe6LDLrDCNOPXfknYazCJImYj7QnvXQ/exec';
const COVERS = ['1706534272739-3ee946364de0', '1744273876148-71718f401231', '1691071207776-4c90bc27005d', '1788494835366-2f45563a8e12'];

const eok = won => { const v = Math.round((Number(won) || 0) / 10000), e = Math.floor(v / 10000), m = v % 10000; return (e ? e + '억' : '') + (m ? (e ? ' ' : '') + m.toLocaleString() + '만' : '') + '원'; };
const md = d => { const [, m, dd] = d.split('-').map(Number); return `${m}월 ${dd}일`; };
const one = s => String(s || '').replace(/[\r\n]+/g, ' ').replace(/[#>*\[\]]/g, '').trim();

function goodEnough(p) {
  const real = p.summary.filter(s => one(s.t).length >= 8).length;
  const rows = p.counts.ok + p.counts.warn + p.counts.na;
  if (real < 3) return `요약 제목이 충분하지 않음(${real}/3)`;
  if (rows < 10) return `확인 항목이 적음(${rows}/10)`;
  return '';
}

function post(p, i) {
  const slug = 'report-' + p.caseNo.replace(/타경/, '-').replace(/[()]/g, '-').replace(/-+$/, '');
  const where = one(`${p.addr} ${p.name}`);
  const kind = one([p.type, p.size].filter(Boolean).join(' '));
  const rate = p.appr ? Math.round(p.min / p.appr * 100) : 0;
  const warns = p.summary.filter(s => s.st === 'warn').map(s => one(s.t));
  const title = p.counts.warn ? `${one(p.addr)} ${one(p.type)} 경매 임장: 현장에서 찾은 주의 ${p.counts.warn}가지` : `${one(p.addr)} ${one(p.type)} 경매 임장 기록`;
  const desc = `${where} 경매 물건(${p.caseNo}) 현장 확인 기록. ${warns.length ? '주의: ' + warns.slice(0, 3).join(', ') + '.' : ''} ${md(p.visited || p.published)} 직접 다녀왔습니다.`.trim();
  const L = [];
  L.push(`${md(p.visited || p.published)}, ${one(p.court)} ${p.caseNo} 물건을 다녀왔습니다. ${where}${kind ? `, ${kind}` : ''}입니다. 매각기일은 ${md(p.date)}이고 최저가는 ${eok(p.min)}${rate ? `(감정가 ${eok(p.appr)}의 ${rate}%)` : ''}${p.fail ? `, 유찰 ${p.fail}회` : ''}입니다.`);
  L.push('');
  L.push('## 한눈에');
  L.push('');
  L.push([`- 이상 없음 ${p.counts.ok}개, **주의 ${p.counts.warn}개**, 미확인 ${p.counts.na}개`, p.counts.photos ? `- 현장 사진 ${p.counts.photos}장 (확인 시각 기록)` : '', p.evict ? `- 명도 난이도: **${one(p.evict)}**` : ''].filter(Boolean).join('\n'));
  L.push('');
  L.push('## 현장에서 확인한 것');
  L.push('');
  L.push(p.summary.filter(s => one(s.t)).map(s => `- ${s.st === 'warn' ? '**주의** · ' : s.st === 'na' ? '미확인 · ' : ''}${one(s.t)}`).join('\n'));
  if (p.warnItems.length) {
    L.push('');
    L.push('## 주의로 표시한 항목');
    L.push('');
    L.push(p.warnItems.map(w => `- ${one(w.sec)} · ${one(w.k)}`).join('\n'));
    L.push('');
    L.push('항목별 금액, 근거 사진 번호, 확인 시각은 리포트에 있습니다.');
  }
  if (p.result) {
    L.push('');
    L.push('## 매각 결과');
    L.push('');
    L.push(p.result === '낙찰'
      ? `${md(p.date)} ${eok(p.price)}에 낙찰되었습니다${p.appr ? `(감정가의 ${(p.price / p.appr * 100).toFixed(1)}%)` : ''}${p.bidders ? `. 응찰자는 ${p.bidders}명이었습니다` : ''}.`
      : `${md(p.date)} 매각기일 결과는 '${one(p.result)}'입니다.`);
  }
  L.push('');
  L.push('> 현장에서 본 사실만 적었습니다. 입찰가 추천이나 권리 분석은 하지 않습니다. 권리관계는 매각물건명세서로 확인하세요.');
  L.push('');
  L.push('관리비를 왜 공용부분과 연체료로 나눠 확인하는지는 [낙찰자가 떠안는 체납 관리비](../unpaid-fee-scope/), 명도 단서를 보는 방법은 [명도 난이도 단서](../eviction-clues/)에 정리했습니다.');

  const front = ['---', `title: ${title}`, `description: ${one(desc)}`, `date: ${p.published}`, ...(p.result ? [`updated: ${new Date().toISOString().slice(0, 10)}`] : []),
    `tag: 임장 기록`, `cover: https://images.unsplash.com/photo-${COVERS[i % COVERS.length]}?w=1600&q=80&auto=format&fit=crop`, 'cta: report', `photos: ${p.counts.photos || ''}`, '---'];
  return { slug, text: front.join('\n') + '\n' + L.join('\n') + '\n' };
}

// --feed=파일.json 이면 서버 대신 그 파일로 시험 (글은 --out 폴더에)
const arg = k => (process.argv.find(x => x.startsWith(`--${k}=`)) || '').split('=')[1];
const j = arg('feed') ? JSON.parse(fs.readFileSync(arg('feed'), 'utf8')) : await (await fetch(ENDPOINT + '?action=blogFeed')).json();
const OUT = arg('out') || path.join(DIR, 'posts');
if (!j.ok) throw new Error('글감을 가져오지 못했습니다');
let made = 0;
j.posts.forEach((p, i) => {
  const why = goodEnough(p);
  if (why) { console.log(`건너뜀 ${p.caseNo}: ${why}`); return; }
  const { slug, text } = post(p, i);
  const file = path.join(OUT, slug + '.md');
  const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  // updated 날짜만 다른 경우는 바꾸지 않는다
  if (old.replace(/^updated:.*\n/m, '') === text.replace(/^updated:.*\n/m, '')) return;
  fs.writeFileSync(file, text);
  console.log(`${old ? '고침' : '새 글'} ${slug}`);
  made++;
});
console.log(`리포트 ${j.posts.length}건 중 ${made}건 글 반영`);
