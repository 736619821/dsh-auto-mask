// test/review2.test.mjs — 修复后验证测试
import { createStripper, BUILTIN_PATTERNS, regexDetect } from '../lib/strip.mjs'

let pass = 0
let fail = 0
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`✅ ${name}${detail ? ' — ' + detail : ''}`) }
  else { fail++; console.log(`❌ ${name}${detail ? ' — ' + detail : ''}`) }
}

// ===== 测试1: 邮箱分类（修复后） =====
console.log('\n=== 测试1: 邮箱分类 ===')
const personal = ['user@gmail.com', 'john.doe@qq.com', 'mary@163.com', 'test@foxmail.com', 'dev@protonmail.com', 'user@yahoo.com', 'someone@icloud.com', 'charter@charter.net']
const enterprise = ['zhang@alibaba.com', 'li@tencent.com', 'wang@bytedance.com', 'chen@huawei.com', 'lisi@microsoft.com', 'zhaoliu@amazon.com', 'sun@oracle.com', 'zhou@salesforce.com']

for (const email of personal) {
  const [e] = regexDetect(email, BUILTIN_PATTERNS, true)
  if (e) { check(`个人邮箱 ${email}`, e.entity === 'email_personal', `got ${e.entity}`) }
  else { check(`个人邮箱 ${email}`, false, 'not detected') }
}
for (const email of enterprise) {
  const [e] = regexDetect(email, BUILTIN_PATTERNS, true)
  if (e) { check(`企业邮箱 ${email}`, e.entity === 'email_enterprise', `got ${e.entity}`) }
  else { check(`企业邮箱 ${email}`, false, 'not detected') }
}

// ===== 测试2: 核心 Bug 1 修复验证 — 显式配置 email_personal/enterprise 也能脱敏 =====
console.log('\n=== 测试2: 显式 email_personal/enterprise 配置脱敏 ===')
const s2 = createStripper({ entities: ['email_personal', 'email_enterprise', 'phone'], maxEntries: 100, enableEmailClassification: true })
const t2 = '联系我: john@gmail.com 或公司: zhang@alibaba.com, 手机13812345678'
const r2 = s2.strip(t2)
console.log(`  脱敏: ${r2}`)
check('个人邮箱被脱敏', r2.includes('***@example.com_'), r2)
check('企业邮箱被脱敏', r2.includes('***@example.com_'), r2)
check('手机号被脱敏', r2.includes('<PHONE_1>'), r2)
check('原文不再出现', !r2.includes('john@gmail.com') && !r2.includes('zhang@alibaba.com'), r2)
console.log(`  统计: ${JSON.stringify(s2.stats())}`)
console.log(`  映射: ${JSON.stringify(s2.mapping())}`)

// ===== 测试3: Bug 3 修复验证 — 个人+企业占位符不冲突 =====
console.log('\n=== 测试3: 个人+企业邮箱占位符唯一性 ===')
const s3 = createStripper({ entities: ['email_personal', 'email_enterprise'], maxEntries: 100, enableEmailClassification: true })
const r3 = s3.strip('a@gmail.com, b@alibaba.com, c@gmail.com, d@tencent.com, e@163.com')
console.log(`  脱敏: ${r3}`)
const m3 = s3.mapping()
const placeholders3 = Object.keys(m3)
check('5 个邮箱产生 5 个唯一占位符', placeholders3.length === 5, JSON.stringify(placeholders3))
check('占位符全部唯一', new Set(placeholders3).size === 5, JSON.stringify(placeholders3))

// ===== 测试4: 还原功能 =====
console.log('\n=== 测试4: 还原 ===')
const s4 = createStripper({ entities: ['email_personal', 'email_enterprise', 'phone'], maxEntries: 100, enableEmailClassification: true })
const t4 = '联系 john@gmail.com 和 zhang@alibaba.com, 电话 13812345678'
const m4 = s4.strip(t4)
const back4 = s4.restore(m4)
check('还原正确', back4 === t4, `还原: ${back4}`)

// ===== 测试5: loadMapping 回载后继续计数（Bug 2 验证） =====
console.log('\n=== 测试5: loadMapping 回载 ===')
const s5a = createStripper({ entities: ['email_personal', 'email_enterprise'], maxEntries: 100, enableEmailClassification: true })
s5a.stripInto('x@qq.com, y@alibaba.com')  // 消耗 1,2（stripInto 不 reset）
const persisted = s5a.mapping()
const s5b = createStripper({ entities: ['email_personal', 'email_enterprise'], maxEntries: 100, enableEmailClassification: true })
s5b.loadMapping(persisted)
const r5b = s5b.stripInto('z@gmail.com')  // 新邮箱应生成 _3 而非 _1
check('回载后新邮箱计数不冲突', r5b.text.includes('***@example.com_3'), `结果: ${r5b.text}`)
check('回载后还原正确', s5b.restore(r5b.text) === 'z@gmail.com', `还原: ${s5b.restore(r5b.text)}`)

// ===== 测试6: 无分类模式 enableEmailClassification=false =====
console.log('\n=== 测试6: enableEmailClassification=false ===')
const s6 = createStripper({ entities: ['email'], maxEntries: 100, enableEmailClassification: false })
const r6 = s6.strip('联系 a@gmail.com')
console.log(`  脱敏: ${r6}`)
console.log(`  统计: ${JSON.stringify(s6.stats())}`)
check('邮箱仍被替换（email 实体）', s6.stats().replaced === 1, r6)
check('占位符为 ***@example.com_N', r6.includes('***@example.com_1'), r6)

// ===== 测试7: 完整端到端（默认配置，模拟 mask_test） =====
console.log('\n=== 测试7: 默认配置端到端 ===')
const s7 = createStripper({ maxEntries: 500, enableEmailClassification: true })
const t7 = '用户邮箱: david@gmail.com, 紧急联系: tom@tencent.com, 电话: 13999998888, 身份证: 110101199001011234'
const r7 = s7.strip(t7)
console.log(`  脱敏: ${r7}`)
console.log(`  统计: ${JSON.stringify(s7.stats())}`)
check('邮箱被脱敏', r7.includes('***@example.com_'), r7)
check('电话被脱敏', r7.includes('<PHONE_'), r7)
check('身份证被脱敏', r7.includes('<ID_CARD_'), r7)

// ===== 测试8: 用户需求格式验证 =====
console.log('\n=== 测试8: 需求格式 ***@example.com ===')
const s8 = createStripper({ entities: ['email_personal', 'email_enterprise'], maxEntries: 100, enableEmailClassification: true })
const r8 = s8.strip('发邮件到 alice@gmail.com 或 bob@microsoft.com')
console.log(`  脱敏: ${r8}`)
check('占位符为 ***@example.com_N 格式', /^\*\*\*@example\.com_\d+$/.test(r8.match(/\*\*\*@example\.com_\d+/g)?.[0] ?? ''), r8)

console.log(`\n=== 结果: ${pass} 通过, ${fail} 失败 ===`)
process.exit(fail > 0 ? 1 : 0)