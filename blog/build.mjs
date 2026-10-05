// 임장 노트(블로그) 만들기: blog/posts/*.md → blog/index.html, blog/<slug>/index.html, sitemap.xml
// 실행: node blog/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(DIR, '..');
const SITE = 'https://v1234vs1-creator.github.io/balpum-auction/';
const BRAND = '발품옥션';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 머리말(--- key: value ---) + 본문
function parse(file) {
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error('머리말 없음: ' + file);
  const meta = {};
  m[1].split('\n').forEach(l => { const i = l.indexOf(':'); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
  meta.slug = path.basename(file, '.md');
  meta.body = m[2];
  meta.draft = meta.draft === 'true';
  return meta;
}

// 필요한 만큼만 지원하는 마크다운: ## ### 문단, - 목록, 1. 목록, > 안내 상자, **굵게**, [링크](주소)
function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\[(.+?)\]\((.+?)\)/g, (_, t, u) => `<a href="${u.replace(/&amp;/g, '&')}">${t}</a>`);
}
function md(src) {
  const out = [];
  src.trim().split(/\n{2,}/).forEach(block => {
    const lines = block.split('\n');
    if (/^## /.test(block)) out.push(`<h2>${inline(block.slice(3))}</h2>`);
    else if (/^### /.test(block)) out.push(`<h3>${inline(block.slice(4))}</h3>`);
    else if (lines.every(l => /^- /.test(l))) out.push(`<ul>${lines.map(l => `<li>${inline(l.slice(2))}</li>`).join('')}</ul>`);
    else if (lines.every(l => /^\d+\. /.test(l))) out.push(`<ol>${lines.map(l => `<li>${inline(l.replace(/^\d+\. /, ''))}</li>`).join('')}</ol>`);
    else if (lines.every(l => /^> ?/.test(l))) out.push(`<div class="callout">${lines.map(l => inline(l.replace(/^> ?/, ''))).join('<br>')}</div>`);
    else out.push(`<p>${lines.map(inline).join('<br>')}</p>`);
  });
  return out.join('\n');
}

const dateKo = d => { const [y, m, dd] = d.split('-').map(Number); return `${y}년 ${m}월 ${dd}일`; };
const minutes = body => Math.max(2, Math.round(body.replace(/\s/g, '').length / 500));

const LOGO = `<svg viewBox="0 0 64 64" width="26" height="26" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#0e1116"/><path d="M20 44c6-2 9-8 9-14s5-10 15-10" stroke="#c8f03c" stroke-width="7" fill="none" stroke-linecap="round"/></svg>`;
const ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='16' fill='%230e1116'/%3E%3Cpath d='M20 44c6-2 9-8 9-14s5-10 15-10' stroke='%23c8f03c' stroke-width='7' fill='none' stroke-linecap='round'/%3E%3C/svg%3E";

const CSS = `
:root{--bg:#fff;--gray:#f4f5f7;--ink:#0e1116;--ink2:#333d4b;--muted:#6b7684;--faint:#b0b8c1;--line:#e5e8eb;--navy:#0b1220;--lime:#c8f03c;--warn:#e8590c;--warn-bg:#fdf0e7;
--ease-out:cubic-bezier(.23,1,.32,1);--head:"Wanted Sans Variable","Wanted Sans",Pretendard,system-ui,sans-serif}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Pretendard Variable",Pretendard,system-ui,sans-serif;font-size:17px;line-height:1.75;letter-spacing:-.012em;word-break:keep-all;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
img{display:block;max-width:100%}
.top{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.9);backdrop-filter:saturate(1.6) blur(16px);box-shadow:0 1px 0 var(--line)}
.top .in{max-width:1080px;margin:0 auto;padding:0 20px;height:64px;display:flex;align-items:center;justify-content:space-between;gap:20px}
.logo{display:flex;align-items:center;gap:9px;font-family:var(--head);font-weight:700;font-size:19px;letter-spacing:-.045em}
.nav{display:flex;gap:22px;font-size:15px;color:var(--ink2)}
.nav a.on{color:var(--ink);font-weight:600}
@media (max-width:560px){.nav .hide{display:none}}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
.art{max-width:720px;margin:0 auto;padding:56px 20px 40px}
.tag{display:inline-block;font-size:13px;font-weight:600;color:var(--ink2);background:var(--gray);border-radius:8px;padding:3px 10px}
h1{font-family:var(--head);font-size:clamp(28px,4.4vw,40px);line-height:1.3;letter-spacing:-.04em;font-weight:680;margin:14px 0 12px}
.meta{font-size:14px;color:var(--muted)}
.cover{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:20px;margin:28px 0 8px;background:var(--gray)}
.body h2{font-family:var(--head);font-size:24px;letter-spacing:-.03em;font-weight:660;line-height:1.4;margin:48px 0 12px}
.body h3{font-size:19px;font-weight:650;margin:32px 0 8px}
.body p{margin:0 0 18px;color:var(--ink2)}
.body ul,.body ol{margin:0 0 20px;padding-left:22px;color:var(--ink2)}
.body li{margin:6px 0}
.body li::marker{color:var(--faint)}
.body b{color:var(--ink)}
.body a{text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--faint)}
.callout{background:var(--gray);border-radius:14px;padding:16px 18px;margin:0 0 20px;font-size:15.5px;color:var(--ink2)}
.callout.warn{background:var(--warn-bg)}
.cta{margin:52px 0 0;background:var(--navy);color:#fff;border-radius:22px;padding:30px 28px}
.cta b{display:block;font-family:var(--head);font-size:22px;letter-spacing:-.03em;line-height:1.4;margin-bottom:6px}
.cta p{margin:0 0 20px;color:rgba(255,255,255,.66);font-size:15.5px}
.cta .row{display:flex;gap:8px;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;justify-content:center;height:50px;padding:0 22px;border-radius:14px;font-weight:600;font-size:15.5px;transition:transform 160ms var(--ease-out)}
.btn:active{transform:scale(.97)}
.btn.lime{background:var(--lime);color:var(--ink)}
.btn.ghost{background:rgba(255,255,255,.1);color:#fff}
.note{font-size:13.5px;color:var(--muted);margin-top:28px;border-top:1px solid var(--line);padding-top:18px}
.more{max-width:720px;margin:0 auto;padding:8px 20px 80px}
.more h2{font-family:var(--head);font-size:20px;margin:0 0 8px}
.more a{display:flex;justify-content:space-between;gap:16px;padding:14px 0;border-top:1px solid var(--line);font-size:16px}
.more a span{color:var(--muted);font-size:14px;white-space:nowrap}
.head{padding:64px 0 8px}
.head h1{font-size:clamp(32px,5vw,48px);margin:0 0 10px}
.head p{margin:0;color:var(--muted);font-size:17px;max-width:560px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:40px 24px;padding:40px 0 96px}
@media (max-width:900px){.grid{grid-template-columns:1fr 1fr}}
@media (max-width:600px){.grid{grid-template-columns:1fr;gap:32px}}
.card{display:block;transition:transform 160ms var(--ease-out)}
.card:active{transform:scale(.985)}
.card img{width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:16px;background:var(--gray);margin-bottom:14px}
.card h2{font-family:var(--head);font-size:20px;line-height:1.4;letter-spacing:-.03em;font-weight:650;margin:10px 0 6px}
.card p{margin:0 0 8px;font-size:15px;color:var(--muted);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card small{font-size:13px;color:var(--faint)}
.empty{padding:60px 0;color:var(--muted)}
footer{border-top:1px solid var(--line);padding:32px 0 48px;font-size:13px;color:var(--muted)}
@media (hover:hover) and (pointer:fine){.card:hover h2{text-decoration:underline;text-underline-offset:4px;text-decoration-thickness:1px}.more a:hover{color:var(--ink2)}}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
`;

function page({ title, desc, url, image, body, up, jsonld, type = 'website' }) {
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<link rel="alternate" type="application/rss+xml" title="${BRAND} 임장 노트" href="${SITE}blog/feed.xml">
<link rel="icon" href="${ICON}">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css">
<style>${CSS}</style>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
</head>
<body>
<header class="top"><div class="in">
  <a class="logo" href="${up}">${LOGO}${BRAND}</a>
  <nav class="nav"><a class="hide" href="${up}#list">물건</a><a class="hide" href="${up}#price">요금</a><a class="on" href="${up}blog/">임장 노트</a></nav>
</div></header>
${body}
<footer><div class="wrap">${BRAND}은 현장에서 확인한 사실을 제공하며 입찰 대리, 법률 자문, 명도 대리를 하지 않습니다. 글은 일반적인 정보이며 개별 사건의 판단은 서류 확인과 전문가 상담이 필요합니다.<br>© 2026 Balpum Auction</div></footer>
</body>
</html>
`;
}

function cta(post, up) {
  if (post.cta === 'report') return `<div class="cta"><b>이 물건 리포트 전체가 궁금하다면</b><p>관리비 금액, 수리비 범위, 명도 난이도, 사진 ${esc(post.photos || '')}장과 확인 시각까지 리포트에 모두 들어 있습니다.</p>
<div class="row"><a class="btn lime" href="${up}#list">리포트 열람 신청</a><a class="btn ghost" href="${up}#alert">새 물건 알림 받기</a></div></div>`;
  return `<div class="cta"><b>가보지 못한 경매 물건, 먼저 다녀옵니다</b><p>지역 파트너가 이 순서대로 확인하고 사진과 시각을 붙여 리포트로 드립니다. 같은 물건을 보는 사람과 함께 신청하면 비용을 나눕니다.</p>
<div class="row"><a class="btn lime" href="${up}#list">신청 받는 물건 보기</a><a class="btn ghost" href="${up}#alert">새 물건 알림 받기</a></div></div>`;
}

const files = fs.readdirSync(path.join(DIR, 'posts')).filter(f => f.endsWith('.md'));
const posts = files.map(f => parse(path.join(DIR, 'posts', f))).filter(p => !p.draft).sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));

// 예전에 만든 글 폴더 중 지금 없는 글은 지운다 (blog/ 안의 글 폴더만)
const keep = new Set(posts.map(p => p.slug).concat(['posts']));
fs.readdirSync(DIR, { withFileTypes: true }).filter(d => d.isDirectory() && !keep.has(d.name) && fs.existsSync(path.join(DIR, d.name, 'index.html')))
  .forEach(d => fs.rmSync(path.join(DIR, d.name), { recursive: true }));

posts.forEach(p => {
  const up = '../../';
  const url = `${SITE}blog/${p.slug}/`;
  const others = posts.filter(o => o !== p).slice(0, 4);
  const body = `<article class="art">
  <span class="tag">${esc(p.tag || '임장 노트')}</span>
  <h1>${esc(p.title)}</h1>
  <div class="meta">${dateKo(p.date)} · ${minutes(p.body)}분 읽기</div>
  ${p.cover ? `<img class="cover" src="${esc(p.cover)}" alt="${esc(p.coverAlt || '')}">` : ''}
  <div class="body">${md(p.body)}</div>
  ${cta(p, up)}
  <p class="note">${esc(p.note || '글에 담긴 내용은 일반적인 정보입니다. 개별 물건의 권리관계와 인수 금액은 매각물건명세서 등 서류와 관리사무소 확인, 필요하면 전문가 상담으로 판단하세요.')}</p>
</article>
${others.length ? `<section class="more"><h2>다른 임장 노트</h2>${others.map(o => `<a href="../${o.slug}/">${esc(o.title)}<span>${o.date.slice(5).replace('-', '.')}</span></a>`).join('')}</section>` : ''}`;
  const jsonld = { '@context': 'https://schema.org', '@type': 'Article', headline: p.title, description: p.description, datePublished: p.date, dateModified: p.updated || p.date,
    image: p.cover ? [p.cover] : undefined, author: { '@type': 'Organization', name: BRAND }, publisher: { '@type': 'Organization', name: BRAND }, mainEntityOfPage: url };
  fs.mkdirSync(path.join(DIR, p.slug), { recursive: true });
  fs.writeFileSync(path.join(DIR, p.slug, 'index.html'), page({ title: `${p.title} | ${BRAND}`, desc: p.description, url, image: p.cover, body, up, jsonld, type: 'article' }));
});

// 목록
const list = posts.length ? posts.map(p => `<a class="card" href="${p.slug}/">
    ${p.cover ? `<img src="${esc(p.cover.replace(/w=\d+/, 'w=800'))}" alt="" loading="lazy">` : ''}
    <span class="tag">${esc(p.tag || '임장 노트')}</span>
    <h2>${esc(p.title)}</h2><p>${esc(p.description)}</p><small>${dateKo(p.date)}</small></a>`).join('\n') : '<p class="empty">아직 글이 없습니다.</p>';
fs.writeFileSync(path.join(DIR, 'index.html'), page({
  title: `임장 노트 | ${BRAND}`, desc: '경매 물건 현장에서 직접 확인한 것과 임장 방법을 기록합니다. 관리비, 명도 단서, 하자, 주차까지.',
  url: `${SITE}blog/`, image: posts[0]?.cover, up: '../',
  body: `<div class="wrap"><div class="head"><h1>임장 노트</h1><p>경매 물건 현장에서 직접 확인한 것과, 서류에는 없는 것을 보는 방법을 기록합니다.</p></div>
<div class="grid">${list}</div></div>`,
}));

// 첫 화면 '경매가 처음이라면' 칸에서 읽는 최신 글 목록
fs.writeFileSync(path.join(DIR, 'posts.json'), JSON.stringify(posts.map(p => ({ slug: p.slug, title: p.title, tag: p.tag || '', date: p.date, cover: p.cover || '' }))));

// RSS
const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>${BRAND} 임장 노트</title><link>${SITE}blog/</link><description>경매 물건 현장 확인 기록</description><language>ko</language>
${posts.map(p => `<item><title>${esc(p.title)}</title><link>${SITE}blog/${p.slug}/</link><guid>${SITE}blog/${p.slug}/</guid><pubDate>${new Date(p.date + 'T09:00:00+09:00').toUTCString()}</pubDate><description>${esc(p.description)}</description></item>`).join('\n')}
</channel></rss>
`;
fs.writeFileSync(path.join(DIR, 'feed.xml'), rss);

// 사이트맵 (서치 콘솔·네이버 서치어드바이저에 제출)
const today = new Date().toISOString().slice(0, 10);
const urls = [[SITE, today], [SITE + 'report.html', today], [SITE + 'blog/', posts[0]?.date || today], ...posts.map(p => [`${SITE}blog/${p.slug}/`, p.updated || p.date])];
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, d]) => `<url><loc>${u}</loc><lastmod>${d}</lastmod></url>`).join('\n')}
</urlset>
`);

console.log(`임장 노트 ${posts.length}개 글을 만들었습니다.`);
