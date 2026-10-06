# 매각물건명세서 PDF → 서류상 위험 신호 판정 (사장님 PC에서만 실행, 사람 이름은 저장하지 않는다)
# 실행: python tools/spec.py            (다운로드 폴더의 *매각물건명세서*.pdf 전부)
#       python tools/spec.py 폴더경로
# 결과: tools/.cache/specs.json  (사건번호·물건번호별 판정, 날짜·금액·사유만)
# 판정은 '서류상 위험 신호' 표시일 뿐 권리분석이 아니다. 애매하면 제외 쪽으로 보수적으로 판정한다.
import json, os, re, sys, glob
import fitz  # pymupdf

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, '.cache', 'specs.json')
FOLDER = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.expanduser('~'), 'Downloads')

DATE = r'(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})'
RISK = ['유치권', '법정지상권', '분묘', '지분', '대지권 미등기', '대지권미등기', '토지별도등기', '토지 별도등기', '위반건축물',
        '선순위 가처분', '선순위 가등기', '선순위 전세권', '재매각', '특별매각조건', '매수인에게 대항할 수 있는', '인수함', '인수한다', '인수됨']

def d(m):
    return '%04d-%02d-%02d' % (int(m[0]), int(m[1]), int(m[2]))

def between(t, a, b):
    i = t.find(a)
    if i < 0: return ''
    if not b: return t[i + len(a):]
    j = t.find(b, i + len(a))
    return t[i + len(a): j] if j >= 0 else ''

def judge(path):
    doc = fitz.open(path)
    raw = '\n'.join(p.get_text() for p in doc)
    t = re.sub(r'개인정보유출주의[^\n]*\n', '\n', raw)          # 다운로드 표시 줄 제거
    body = '\n'.join(l for l in t.split('\n') if not l.strip().startswith('※') and not re.match(r'^\s*\d:\s', l))  # 안내 문구 제거
    cm = re.search(r'(\d{4})\s*타경\s*(\d+)', t)
    case = f'{cm.group(1)}타경{cm.group(2)}' if cm else os.path.basename(path)
    nm = re.search(r'물건번호\s*(\d+)', t)
    no = int(nm.group(1)) if nm else 1
    fm = re.search(r'최선순위\s*설정\s*' + DATE, t)
    first = d(fm.groups()) if fm else ''
    keep = between(t, '매각으로 그 효력이 소멸되지 아니하는 것', '매각에 따라 설정된 것으로 보는 지상권의 개요').strip()
    sup = between(t, '지상권의 개요', '비고란').strip()
    # 점유자 표: 머리줄(배당요구일자) 다음부터 다음 구역 전까지
    occ = between(t, '(배당요구일자)', '\n<비고>') or between(t, '(배당요구일자)', '부동산의 표시') or between(t, '(배당요구일자)', '[물건')
    occ_dates = [d(m) for m in re.findall(DATE, occ)]
    deposits = [int(x.replace(',', '')) for x in re.findall(r'\b\d{1,3}(?:,\d{3}){2,}\b', occ)]
    no_tenant = bool(re.search(r'임차\s*내역\s*없음|조사된\s*임차', t))
    has_tenant = bool(re.search(r'임차인|임차권', occ))
    owner_only = bool(re.search(r'소유자', occ)) and not has_tenant

    reasons, verdict = [], '통과'
    if keep and not re.fullmatch(r'[-\s해당사항없음]*', keep):
        reasons.append('소멸되지 않는 권리 있음: ' + re.sub(r'\s+', ' ', keep)[:120])
    if sup and not re.fullmatch(r'[-\s해당사항없음]*', sup):
        reasons.append('지상권 관련 기재 있음')
    early = [x for x in occ_dates if first and x < first]
    if has_tenant and early:
        reasons.append(f'최선순위({first})보다 앞선 임차인 관련 날짜(전입·확정일자 등) {min(early)} → 대항력 의심' + (f', 보증금 {max(deposits):,}원' if deposits else ''))
    hits = sorted({w for w in RISK if w in body})
    if hits:
        reasons.append('위험 문구: ' + ', '.join(hits))
    if reasons:
        verdict = '제외'
    elif not first:
        verdict, reasons = '확인 필요', ['최선순위 설정일을 읽지 못함']
    elif has_tenant and not occ_dates:
        verdict, reasons = '확인 필요', ['임차인이 있으나 전입일을 읽지 못함']
    elif not (no_tenant or owner_only or has_tenant):
        verdict, reasons = '확인 필요', ['점유자 정보가 비어 있음 (폐문부재 등) → 현장 확인 필요']
    elif has_tenant:
        reasons = [f'임차인 있음, 모두 최선순위({first}) 이후 전입 → 대항력 없음으로 보임']
    else:
        reasons = ['임차인 없음 또는 소유자 점유']
    return {'caseNo': case, 'no': no, 'key': case if no <= 1 else f'{case}({no})', 'first': first,
            'tenantDates': occ_dates, 'deposits': deposits, 'verdict': verdict, 'reasons': reasons,
            'file': os.path.basename(path)}

files = sorted(glob.glob(os.path.join(FOLDER, '*매각물건명세서*.pdf')))
old = {}
if os.path.exists(OUT):
    try: old = {x['key']: x for x in json.load(open(OUT, encoding='utf-8'))}
    except Exception: pass
for f in files:
    try:
        r = judge(f); old[r['key']] = r
    except Exception as e:
        print('읽지 못함', os.path.basename(f), e)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(list(old.values()), open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'명세서 {len(files)}개 판정 (누적 {len(old)}건)')
for r in old.values():
    print(f"- {r['key']}: {r['verdict']} | " + ' / '.join(r['reasons']))
