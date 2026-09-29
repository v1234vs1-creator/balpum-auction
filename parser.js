// 법원경매정보 검색 결과(화면 전체 복사한 글)를 물건 목록으로 정리한다.
(function (root) {
  const COURT = /((?:서울(?:중앙|동부|서부|남부|북부)|의정부|인천|수원|춘천|청주|대전|대구|부산|울산|창원|광주|전주|제주)지방법원|[가-힣]{2,4}지원)\s*(\d{4}\s*타경\s*\d+)/g;
  const SIDO = /(서울특별시|경기도|인천광역시|부산광역시|대구광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|강원특별자치도|강원도|충청북도|충청남도|전북특별자치도|전라북도|전라남도|경상북도|경상남도|제주특별자치도)\s[^\n\[\t]+/;
  const SHORT = { 서울특별시: '서울', 경기도: '경기', 인천광역시: '인천' };
  const TYPES = /(아파트|오피스텔|다세대|연립|빌라|다가구|단독주택|근린|상가|대지|임야|공장|창고|기타)/;
  const FLAGS = ['지분', '유치권', '법정지상권', '선순위', '재매각', '특별매각조건', '대항력', '위반건축물', '토지별도등기', '대지권미등기', '분묘'];

  function parse(text) {
    text = String(text || '').replace(/\r/g, '').replace(/ /g, ' ');
    const hits = [...text.matchAll(COURT)].map(m => {
      const after = text.slice(m.index + m[0].length, m.index + m[0].length + 12);
      const n = (after.match(/^\s*(\d{1,3})\s/) || [])[1];
      return { idx: m.index, end: m.index + m[0].length, court: m[1], caseNo: m[2].replace(/\s/g, ''), no: n ? +n : 0 };
    });
    // 같은 사건이 연달아 나오면(표 머리 + 칸) 하나로 합친다
    const groups = [];
    hits.forEach(h => {
      const last = groups[groups.length - 1];
      if (last && last.caseNo === h.caseNo && (!h.no || !last.no || h.no === last.no) && h.idx - last.lastIdx < 400) {
        last.lastIdx = h.idx; if (h.no) last.no = h.no;
      } else groups.push({ ...h, lastIdx: h.idx });
    });
    const out = [];
    groups.forEach((g, i) => {
      const chunk = text.slice(g.idx, i + 1 < groups.length ? groups[i + 1].idx : g.idx + 1500);
      const it = one(chunk, g);
      if (it && !out.some(o => o.caseNo === it.caseNo)) out.push(it);
    });
    return out;
  }

  function one(chunk, g) {
    const am = chunk.match(SIDO);
    if (!am) return null;
    const full = am[0].trim();
    const amounts = (chunk.match(/\b\d{1,3}(?:,\d{3}){2,}\b/g) || []).map(v => +v.replace(/,/g, ''));
    const dm = chunk.match(/(\d{4})\.(\d{2})\.(\d{2})/);
    const date = dm ? `${dm[1]}-${dm[2]}-${dm[3]}` : '';
    let interest = 0;
    if (dm) {
      const after = chunk.slice(dm.index + 10, dm.index + 40);
      const im = after.match(/^\s*(\d{1,4})\s/);
      if (im) interest = +im[1];
    }
    const fm = chunk.match(/유찰\s*(\d+)\s*회/);
    const tail = dm ? chunk.slice(dm.index) : chunk;
    const tm = tail.match(TYPES) || chunk.match(TYPES);
    const area = (chunk.match(/([\d.]+)\s*㎡/) || [])[1];
    const flags = FLAGS.filter(f => chunk.includes(f));
    const a = address(full);
    return {
      caseNo: g.no > 1 ? `${g.caseNo}(${g.no})` : g.caseNo,
      court: g.court, region: a.region, addr: a.addr, name: a.name, fullAddr: full,
      type: tm ? tm[1] : '', size: area ? Math.round(+area) + '㎡' : '',
      appr: amounts[0] || 0, min: amounts[1] || amounts[0] || 0,
      fail: fm ? +fm[1] : 0, date, interest, flags,
    };
  }

  // 공개용 주소: 시·구·동 + 단지명 + 동 번호까지만 (층·호수는 뺀다)
  function address(full) {
    const sido = full.split(/\s+/)[0];
    const region = SHORT[sido] || '지방';
    const paren = (full.match(/\(([^)]*)\)/) || [])[1] || '';
    const base = full.replace(/\([^)]*\)/g, '').trim();
    const tk = base.split(/\s+/);
    let sigu = tk[1] || '';
    let i = 2;
    if (/시$/.test(sigu) && /구$/.test(tk[2] || '')) { sigu += ' ' + tk[2]; i = 3; }
    const bdong = (base.match(/(\S+동)\s*\d+층/) || [])[1] || '';
    let dong = '', name = '';
    if (paren) {
      const ps = paren.split(',').map(x => x.trim());
      dong = ps[0] || '';
      name = ps.slice(1).join(' ');
    } else {
      const rest = tk.slice(i);
      dong = rest.find(t => /(동|읍|면|리|가)$/.test(t) && !/^\d/.test(t)) || '';
      const lot = rest.findIndex(t => /^\d+(-\d+)?$/.test(t));
      name = lot >= 0 ? rest.slice(lot + 1).filter(t => !/^\d+동$|층|호$/.test(t)).join(' ') : '';
    }
    return {
      region,
      addr: [(SHORT[sido] || sido.replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, '')), sigu, dong].filter(Boolean).join(' '),
      name: [name || '아파트', bdong && !/^\d+동$/.test(dong) ? bdong : bdong].filter(Boolean).join(' '),
    };
  }

  root.parseCourtText = parse;
  if (typeof module !== 'undefined') module.exports = parse;
})(typeof window !== 'undefined' ? window : globalThis);
