// 임장 노트 자동 갱신: 리포트 → 글 생성 → 블로그 만들기 → 바뀐 게 있으면 커밋·푸시 (GitHub Pages가 1~2분 뒤 반영)
// 실행: node blog/auto.mjs
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = cmd => execSync(cmd, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });

console.log(run('node blog/fromReports.mjs').trim());
console.log(run('node blog/build.mjs').trim());
const changed = run('git status --porcelain -- blog sitemap.xml').trim();
if (!changed) { console.log('바뀐 글이 없습니다.'); process.exit(0); }
run('git add -- blog sitemap.xml');
run('git commit -m "임장 노트 자동 갱신"');
run('git push origin main');
console.log('커밋·푸시했습니다:\n' + changed);
