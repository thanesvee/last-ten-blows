// ตารางตัวอย่างมาตรฐาน: □0.30 ม. ยาว 21 ม., ลูกตุ้ม 4.5 ตัน, ยก 1.0 ม., Qa 40 ตัน, ค้อนปล่อยตก, ค่าเริ่มต้นทุกสมการ
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const m = html.match(/CORE-BEGIN[\s\S]*?\*\/([\s\S]*?)\/\* CORE-END/);
const ctx = {}; vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.__=({U,EQS,PARAMS,PILE_TYPES,buildX,solveEq,pileEp_kPa,RHO});', ctx);
const { EQS, buildX, solveEq, pileEp_kPa } = ctx.__;
function standard(over = {}) {
  const A = 0.09, L = 21, fc = 50;
  const inp = Object.assign({ c: { hammer: 'drop', pileType: 'pc', mat: 'concrete' }, A_m2: A, Ep_kPa: pileEp_kPa('concrete', fc), L,
    h: 1.0, Qa_t: 40, Wr_t: 4.5, Wp_t: A * L * 2.4 + 0.2, par: {} }, over);
  const X = buildX(inp);
  return EQS.map(eq => ({ eq, r: solveEq(eq, X, eq.fs.def) }));
}
function median(a) { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }
if (require.main === module) {
  const rows = standard(); const med = median(rows.filter(x => x.r.ok).map(x => x.r.s_mm));
  console.log('สมการ'.padEnd(22), 'FS'.padStart(5), 's (มม.)'.padStart(9), '10 ครั้ง (ซม.)'.padStart(15), 'เทียบมัธยฐาน'.padStart(13));
  rows.forEach(({ eq, r }) => console.log(eq.name.padEnd(22), String(eq.fs.def).padStart(5), (r.ok ? r.s_mm.toFixed(2) : 'ไม่มีคำตอบ').padStart(9), (r.ok ? r.ten_cm.toFixed(2) : '–').padStart(15), (r.ok ? (r.s_mm / med).toFixed(2) + '×' : '–').padStart(13)));
  console.log('มัธยฐาน s =', med.toFixed(2), 'มม.');
}
module.exports = { standard, median };
