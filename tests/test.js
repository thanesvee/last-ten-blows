// รัน: node tests/test.js   — ดึงส่วน CORE จาก index.html มาทดสอบ (ไม่ต้องใช้ DOM)
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const m = html.match(/CORE-BEGIN[\s\S]*?\*\/([\s\S]*?)\/\* CORE-END/);
assert(m, 'ไม่พบส่วน CORE');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.__=({flagOutliers,U,G,EQS,PARAMS,HAMMERS,SECTIONS,sectionAreaM2,pileEp_kPa,buildX,solveS,solveEq,checks,RHO,PILE_TYPES});', ctx);
const { flagOutliers, U, G, EQS, PARAMS, HAMMERS, SECTIONS, sectionAreaM2, pileEp_kPa, buildX, solveEq, checks } = ctx.__;
let n = 0; const ok = (c, msg) => { assert(c, msg); n++; };
const near = (a, b, tol, msg) => { assert(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`); n++; };

// --- หน่วย ---
near(U.tf_to_kN(1), 9.80665, 1e-12, 'tf→kN'); near(U.kN_to_tf(U.tf_to_kN(7.3)), 7.3, 1e-12, 'roundtrip tf');
near(U.m_to_in(0.0254), 1, 1e-12, 'm→in'); near(U.in_to_m(1), 0.0254, 1e-12, 'in→m');
near(U.kNm_to_ftkip(1.3558179483), 1, 1e-9, 'kNm→ft-kip'); near(U.kN_to_kip(4.4482216153), 1, 1e-9, 'kN→kip');
near(U.m_to_ft(0.3048), 1, 1e-12, 'm→ft'); near(U.cm2_to_m2(100), 0.01, 1e-12, 'cm²→m²');

// --- หน้าตัด/E ---
near(sectionAreaM2('sq', { B: 300 }), 0.09, 1e-12, 'A สี่เหลี่ยม');
near(sectionAreaM2('st', { B: 200, D: 200, tw: 8, tf: 12 }), (2 * 200 * 12 + 176 * 8) * 1e-6, 1e-12, 'A I/H');
near(pileEp_kPa('concrete', 35), 4700 * Math.sqrt(35) * 1000, 1e-12, 'Ec'); near(pileEp_kPa('steel'), 2e8, 1e-12, 'Es');

// --- ชุดอินพุตตัวอย่าง: เสาเข็ม □0.30, L=24 ม., f'c=35, ลูกตุ้ม 6 ตัน, H=1.2 ม., Qa=60 ตัน ---
const A = 0.09, L = 24, Ep = pileEp_kPa('concrete', 35);
const Wp_t = A * L * 2.4 + 0.2;
const base = { c: { hammer: 'drop', pileType: 'pc', mat: 'concrete' }, A_m2: A, Ep_kPa: Ep, L, h: 1.2, Qa_t: 60, Wr_t: 6, Wp_t, par: {} };
const X = buildX(base); const Wr = 6 * G, Wp = Wp_t * G, E = Wr * 1.2, Rt6 = 60 * G * 6;
near(X.E, 70.6, 0.01, 'Eh'); near(X.eh, 0.8, 1e-12, 'eh default'); near(X.n, 0.45, 1e-12, 'n default');
const by = id => EQS.find(e => e.id === id);

// ENR: s = Wr·h/Ru − c  (c = 25.4 มม. สำหรับค้อนปล่อยตก)
{ const Ru = X.Qa * 6; const sExp = Wr * 1.2 / Ru - 0.0254; const r = solveEq(by('enr'), X, 6);
  if (sExp > 0) near(r.s, sExp, 1e-9, 'ENR s'); else ok(!r.ok && r.reason === 'no_solution', 'ENR ไม่มีคำตอบเมื่อ c ใหญ่กว่า'); }
{ const X2 = buildX(Object.assign({}, base, { Qa_t: 20 })); const r = solveEq(by('enr'), X2, 6); const sExp = Wr * 1.2 / (20 * G * 6) - 0.0254;
  near(r.s, sExp, 1e-9, 'ENR s (Qa=20)'); near(r.ten_mm, 10 * sExp * 1000, 1e-9, 'ENR 10s'); }
// Modified ENR
{ const r = solveEq(by('menr'), buildX(Object.assign({}, base, { Qa_t: 20 })), 6); const q = (Wr + 0.45 ** 2 * Wp) / (Wr + Wp);
  near(r.s, 0.8 * Wr * 1.2 * q / (20 * G * 6) - 0.00254, 1e-9, 'MENR s'); }
// Hiley (C2 auto): แก้ s ย้อนกลับ
{ const Xh = buildX(Object.assign({}, base, { Qa_t: 30 })); const r = solveEq(by('hiley'), Xh, 2.5); const Ru = 30 * G * 2.5;
  const q = (Wr + 0.45 ** 2 * Wp) / (Wr + Wp); const C2 = Ru * L / (A * Ep);
  near(r.s, 0.8 * E * q / Ru - (0.005 + C2 + 0.0025) / 2, 1e-8, 'Hiley s'); near(r.extra.C2, C2, 1e-8, 'Hiley C2'); }
// Hiley C2 กรอกเอง
{ const Xh = buildX(Object.assign({}, base, { Qa_t: 30, par: { C2: { sel: 'custom', custom: 10 } } })); const r = solveEq(by('hiley'), Xh, 2.5); const Ru = 30 * G * 2.5;
  const q = (Wr + 0.45 ** 2 * Wp) / (Wr + Wp); near(r.s, 0.8 * E * q / Ru - (0.005 + 0.010 + 0.0025) / 2, 1e-8, 'Hiley s C2 manual'); }
// Danish
{ const Xd = buildX(Object.assign({}, base, { Qa_t: 30 })); const r = solveEq(by('danish'), Xd, 3); const Ru = 30 * G * 3;
  near(r.s, 0.8 * E / Ru - Math.sqrt(0.8 * E * L / (2 * A * Ep)), 1e-8, 'Danish s'); }
// Janbu: ตรวจย้อน Ru จากสูตรโดยตรงที่ s ที่แก้ได้
{ const Xj = buildX(Object.assign({}, base, { Qa_t: 30 })); const r = solveEq(by('janbu'), Xj, 3); const s = r.s, e = 0.8 * E;
  const Cd = 0.75 + 0.15 * Wp / Wr, lam = e * L / (A * Ep * s * s), Ku = Cd * (1 + Math.sqrt(1 + lam / Cd));
  near(e / (Ku * s), 30 * G * 3, 1e-8, 'Janbu Ru'); near(r.extra.Cd, Cd, 1e-12, 'Janbu Cd'); }
// Gates (FHWA-modified): ตรวจเทียบสูตรเขียนใหม่ในเทสต์ + ตัวเลขคำนวณมือ
{ const Xg = buildX(Object.assign({}, base, { Qa_t: 30 })); const r = solveEq(by('gates'), Xg, 3.5);
  const Rk = U.kN_to_kip(30 * G * 3.5), Eftlb = 0.8 * E / 1.3558179483 * 1000; const N = Math.pow(10, (Rk + 100) / (1.75 * Math.sqrt(Eftlb))) / 10;
  near(r.s, U.in_to_m(1 / N), 1e-8, 'Gates s'); }
{ // มือ: eh·Wr·h = 30 kN·m → 22.127 ft-kip = 22,127 ft-lb ; √ = 148.75 ; s = 12.7 มม. = 0.5 นิ้ว → N = 2 ; Rn = 1.75×148.75×log10(20) − 100 = 238.7 kip = 1061.8 kN
  const Xg = { eh: 1, E: 30, Wr: 1, h: 1, Wp: 0 }; const Ru = by('gates').calc(Xg, 0.0127).Ru;
  near(Ru, 1061.8, 2e-3, 'Gates มือ (N=2, E=22,127 ft-lb)'); }
// WSDOT: ln, Fe, kip/ft  (drop hammer → Fe = 0.28)
{ near(buildX(base).Fe, 0.28, 1e-12, 'Fe drop'); const Xw = buildX(Object.assign({}, base, { Qa_t: 30 })); const r = solveEq(by('wsdot'), Xw, 2.6);
  const Rk = U.kN_to_kip(30 * G * 2.6), den = 6.6 * 0.28 * U.kN_to_kip(Wr) * U.m_to_ft(1.2); const sin = 10 / Math.exp(Rk / den);
  near(r.s, U.in_to_m(sin), 1e-8, 'WSDOT s (ln)'); }
{ // มือ: Wr = 10 kip, h = 4 ft, Fe = 0.5, N = 2 → 6.6×0.5×40×ln(20) = 395.4 kip = 1758.9 kN
  const Xw = { Fe: 0.5, Wr: U.kip_to_kN(10), h: U.in_to_m(48) }; near(by('wsdot').calc(Xw, 0.0127).Ru, U.kip_to_kN(6.6 * 0.5 * 40 * Math.log(20)), 1e-9, 'WSDOT มือ');
  near(by('wsdot').calc(Xw, 0.0127).Ru, 1758.9, 2e-3, 'WSDOT มือ kN'); }
// Pacific Coast: Ru(s + (Ru/FS)·L/AE) = eh·Eh·r  → s = eh·Eh·r/Ru − (Ru/FS)·L/AE
{ const Xp = buildX(Object.assign({}, base, { Qa_t: 30 })); const r = solveEq(by('pcubc'), Xp, 4); const Ru = 30 * G * 4;
  const q = (Wr + 0.10 * Wp) / (Wr + Wp); near(r.s, 0.8 * E * q / Ru - (Ru / 4) * L / (A * Ep), 1e-8, 'PCUBC s'); near(Xp.k, 0.10, 1e-12, 'k คอนกรีต'); }
// Navy-McKay, Eytelwein
{ const Xn = buildX(Object.assign({}, base, { Qa_t: 30 })); const Ru = 30 * G * 6;
  near(solveEq(by('navy'), Xn, 6).s, Wr * 1.2 / (Ru * (1 + 0.3 * Wp / Wr)), 1e-8, 'Navy s');
  near(solveEq(by('eyt'), Xn, 6).s, Wr * Wr * 1.2 / (Ru * (Wr + Wp)), 1e-8, 'Eyt s'); }
// WSDOT: s(นิ้ว) = 10/exp(Ru/(6.6 Fe W h))
{ const Xw = buildX(Object.assign({}, base, { Qa_t: 30 })); const r = solveEq(by('wsdot'), Xw, 2.6);
  const Rk = U.kN_to_kip(30 * G * 2.6), den = 6.6 * Xw.Fe * U.kN_to_kip(Wr) * U.m_to_ft(1.2); const sin = 10 / Math.exp(Rk / den);
  near(r.s, U.in_to_m(sin), 1e-8, 'WSDOT s'); }

// --- ทุกสมการ: Ru(s*) = Ru เป้าหมาย และ ten_mm = 10 s ---
for (const eq of EQS) { const r = solveEq(eq, buildX(Object.assign({}, base, { Qa_t: 25 })), eq.fs.def);
  ok(r.ok, `${eq.id} ควรมีคำตอบ`); near(r.Ru, r.Rt, 1e-9, `${eq.id} Ru`); near(r.ten_mm, r.s_mm * 10, 1e-12, `${eq.id} 10s`); near(r.per25, 250 / r.s_mm, 1e-12, `${eq.id} per25`); }
ok(EQS.length === 10 && EQS[0].id === 'enr' && EQS[1].id === 'hiley', '10 สมการ ENR/Hiley อยู่บนสุด');

// --- กรณีไม่มีคำตอบ / เตือน ---
{ const r = solveEq(by('enr'), buildX(Object.assign({}, base, { Qa_t: 100 })), 6); ok(!r.ok && r.reason === 'no_solution', 'ENR Qa สูงมาก → ไม่มีคำตอบ'); }
{ const Xs = buildX(Object.assign({}, base, { Qa_t: 400 })); const r = solveEq(by('hiley'), Xs, 2.5); ok(!r.ok, 'Hiley Qa สูงมาก → ไม่มีคำตอบ'); }
{ // s น้อย → เตือน
  const b = Object.assign({}, base, { Qa_t: 70, Wr_t: 8, h: 1.5 }); const Xs = buildX(b); const eq = by('navy'); const r = solveEq(eq, Xs, 6); ok(r.ok, 'navy ok');
  const w = checks(Object.assign({ fc: 35, secMaxMm: 300, Wp_t }, b), Xs, r, eq, 6); console.log('   s =', r.s_mm.toFixed(3), 'mm →', r.s_mm < 2 ? 'เตือน s น้อย' : 'ไม่เตือน'); ok(r.s_mm < 2 ? w.some(x => x[0] === 'bad') : true, 'เตือน s น้อย'); }
{ const w = checks(Object.assign({ fc: 350, secMaxMm: 3, Wp_t }, base), X, null, by('enr'), 3); ok(w.length >= 3, 'เตือนหน่วย f\'c / ขนาด / FS'); }
// พารามิเตอร์ตามชนิดเสาเข็ม/ค้อน
{ const xs = buildX({ c: { hammer: 'diesel', pileType: 'steel', mat: 'steel' }, A_m2: 0.0092, Ep_kPa: 2e8, L: 30, h: 2, Qa_t: 80, Wr_t: 4.5, Wp_t: 2.5, par: {} });
  near(xs.k, 0.25, 1e-12, 'k เหล็ก'); near(xs.n, 0.35, 1e-12, 'n เหล็ก'); near(xs.c_enr, 0.00254, 1e-12, 'c steam'); near(xs.eh, 0.85, 1e-12, 'eh diesel'); }

// --- ตรวจทิศทาง: Qa↑ → s↓ ; Wr↑ → s↑ ; h↑ → s↑ (ทุกสมการ) ---
for (const eq of EQS) {
  const sOf = o => { const r = solveEq(eq, buildX(Object.assign({}, base, { Qa_t: 20 }, o)), eq.fs.def); ok(r.ok, `${eq.id} ต้องมีคำตอบ ${JSON.stringify(o)}`); return r.s; };
  const s0 = sOf({});
  ok(sOf({ Qa_t: 25 }) < s0, `${eq.id}: Qa เพิ่ม → s ต้องลด`); ok(sOf({ Qa_t: 15 }) > s0, `${eq.id}: Qa ลด → s ต้องเพิ่ม`);
  ok(sOf({ Wr_t: 7 }) > s0, `${eq.id}: ลูกตุ้มหนักขึ้น → s ต้องเพิ่ม`); ok(sOf({ h: 1.5 }) > s0, `${eq.id}: ยกสูงขึ้น → s ต้องเพิ่ม`);
}
// --- ตัวเลขคำนวณมือ: ENR / Navy-McKay / Eytelwein (Wr = 50 kN, h = 1 m, Wp = 100 kN, s = 20 มม.) ---
{ const Xm = { Wr: 50, Wp: 100, h: 1, E: 50, c_enr: 0.0254 };
  near(by('enr').calc(Xm, 0.02).Ru, 50 / (0.02 + 0.0254), 1e-12, 'ENR'); near(by('enr').calc(Xm, 0.02).Ru, 1101.3, 1e-3, 'ENR มือ');   // 50/0.0454
  near(by('navy').calc(Xm, 0.02).Ru, 50 / (0.02 * (1 + 0.3 * 2)), 1e-12, 'Navy'); near(by('navy').calc(Xm, 0.02).Ru, 1562.5, 1e-9, 'Navy มือ'); // 50/(0.02×1.6)
  near(by('eyt').calc(Xm, 0.02).Ru, 2500 / (0.02 * 150), 1e-12, 'Eyt'); near(by('eyt').calc(Xm, 0.02).Ru, 833.333, 1e-6, 'Eyt มือ'); }
// --- ตัวอย่างมาตรฐาน (□0.30, L=21, Wr=4.5 ตัน, H=1.0, Qa=40, drop): ทุกสมการที่มีคำตอบต้องอยู่ภายใน 5 เท่าของมัธยฐาน ---
{ const { standard, median } = require('./standard.js'); const rows = standard(); const ss = rows.filter(x => x.r.ok).map(x => x.r.s_mm); const med = median(ss);
  console.log('   ตัวอย่างมาตรฐาน: มัธยฐาน s =', med.toFixed(2), 'มม. ; ' + rows.map(x => x.eq.id + '=' + (x.r.ok ? x.r.s_mm.toFixed(1) : 'ไม่มีคำตอบ')).join(', '));
  rows.forEach(x => { if (x.r.ok) ok(x.r.s_mm / med < 5 && x.r.s_mm / med > 0.2, `${x.eq.id} s=${x.r.s_mm} ต่างจากมัธยฐาน ${med} เกิน 5 เท่า`); });
  ok(!rows.find(x => x.eq.id === 'enr').r.ok, 'ENR (c = 25.4 มม.) ไม่มีคำตอบ เพราะ Wr·h = 44.1 < Ru·c = 2354×0.0254 = 59.8 kN·m');
  ok(rows.filter(x => !x.r.ok).length === 1, 'มีเพียง ENR ที่ไม่มีคำตอบ'); }
// --- เตือนช่วง Gates / s ---
{ const Xg = buildX(Object.assign({}, base, { Qa_t: 30 })); const eq = by('gates'); const r = solveEq(eq, Xg, 3.5);
  const w = checks(Object.assign({ fc: 35, secMaxMm: 300, Wp_t }, base), Xg, r, eq, 3.5); const N = 25.4 / r.s_mm;
  ok((N < 3 || N > 10) === w.some(x => x[1].startsWith('Gates: N')), 'เตือนช่วง N ของ Gates สอดคล้องกับ N'); }
// --- เตือน s ผิดปกติ ---
{ const eq = by('navy'), Xs = buildX(base), mk = s_mm => ({ ok: true, s_mm });
  const wc = s => checks(Object.assign({ fc: 35, secMaxMm: 300, Wp_t }, base), Xs, mk(s), eq, 6).filter(x => x[0] === 'warn').map(x => x[1]);
  ok(wc(0.5).some(x => x.includes('น้อยกว่า 1 มม.')), 's < 1 มม. ต้องเตือนเหลือง'); ok(wc(30).some(x => x.includes('มากกว่า 25 มม.')), 's > 25 มม. ต้องเตือนเหลือง');
  ok(!wc(10).some(x => x.includes('1 มม.') || x.includes('25 มม.')), 's ปกติไม่เตือน'); }
// --- ไฮไลต์ outlier ในตารางเปรียบเทียบ ---
{ const rows = [1, 10, 12, 100].map(s => ({ r: { ok: true, s_mm: s } })).concat([{ r: { ok: false } }]); const med = flagOutliers(rows);
  ok(Math.abs(med - 11) < 1e-12, 'มัธยฐาน'); ok(rows[0].outlier && rows[3].outlier && !rows[1].outlier && !rows[2].outlier && !rows[4].outlier, 'ไฮไลต์เฉพาะที่เกิน 5 เท่า'); }
console.log(`ผ่านทั้งหมด ${n} การตรวจสอบ`);
