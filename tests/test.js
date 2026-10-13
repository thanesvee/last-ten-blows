// รัน: node tests/test.js   — ดึงส่วน CORE จาก index.html มาทดสอบ (ไม่ต้องใช้ DOM)
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const m = html.match(/CORE-BEGIN[\s\S]*?\*\/([\s\S]*?)\/\* CORE-END/);
assert(m, 'ไม่พบส่วน CORE');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(m[1] + '\nthis.__=({U,G,EQS,PARAMS,HAMMERS,SECTIONS,sectionAreaM2,pileEp_kPa,buildX,solveS,solveEq,checks,RHO,PILE_TYPES});', ctx);
const { U, G, EQS, PARAMS, HAMMERS, SECTIONS, sectionAreaM2, pileEp_kPa, buildX, solveEq, checks } = ctx.__;
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
// Gates: s = 10^(2.4 − Ru/(27√E))  (นิ้ว, kip, ft-kip)
{ const Xg = buildX(Object.assign({}, base, { Qa_t: 30 })); const r = solveEq(by('gates'), Xg, 3);
  const Rk = U.kN_to_kip(30 * G * 3), Eft = U.kNm_to_ftkip(0.8 * E); const sin = Math.pow(10, 2.4 - Rk / (27 * Math.sqrt(Eft)));
  near(r.s, U.in_to_m(sin), 1e-8, 'Gates s'); }
// Pacific Coast
{ const Xp = buildX(Object.assign({}, base, { Qa_t: 30 })); const r = solveEq(by('pcubc'), Xp, 4); const Ru = 30 * G * 4;
  const q = (Wr + 0.10 * Wp) / (Wr + Wp); near(r.s, 0.8 * E * q / Ru - Ru * L / (A * Ep), 1e-8, 'PCUBC s'); near(Xp.k, 0.10, 1e-12, 'k คอนกรีต'); }
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
console.log(`ผ่านทั้งหมด ${n} การตรวจสอบ`);
