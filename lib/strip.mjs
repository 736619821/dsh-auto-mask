// lib/strip.mjs — PII 脱敏/还原纯函数（零依赖）。
//
// Enhanced email detection: distinguishes personal vs enterprise emails and replaces
// with ***@example.com to preserve domain context for the model.

import { ENTITY_LABELS, LIMITS } from './constants.mjs'

/**
 * 企业邮箱域名列表（常见企业域名后缀，用于区分个人邮箱和企业邮箱）。
 */
const ENTERPRISE_EMAIL_DOMAINS = new Set([
  // 国内常见企业邮箱
  'alibaba.com', 'aliyun.com', 'alipay.com',
  'tencent.com', 'qq.com',
  'baidu.com',
  'jd.com', 'jdpay.com',
  'meituan.com', 'dianping.com',
  'bytedance.com', 'toutiao.com', 'feishu.cn', 'larksuite.com',
  'huawei.com', 'huaweicloud.com',
  'alibaba-inc.com',
  'microsoft.com', 'microsoftonline.com',
  'google.com', 'googlegmail.com',
  'amazon.com', 'aws.amazon.com',
  'apple.com',
  'intel.com',
  'ibm.com',
  'oracle.com',
  'salesforce.com',
  'sap.com',
  'adobe.com',
  'cisco.com',
  'dell.com',
  'hp.com', 'hpe.com',
  'siemens.com',
  '通用电气.com', 'ge.com',
  '博世.com', 'bosch.com',
  '大众汽车.com', 'volkswagen.com',
  '宝马.com', 'bmw.com',
  '奔驰.com', 'mercedes-benz.com',
  '特斯拉.com', 'tesla.com',
  '索尼.com', 'sony.com',
  '松下.com', 'panasonic.com',
  '三星.com', 'samsung.com',
  'LG.com',
  '飞利浦.com', 'philips.com',
  '西门子.com',
  '施耐德.com', 'schneider-electric.com',
  'ABB.com',
  '罗克韦尔.com', 'rockwellautomation.com',
  '霍尼韦尔.com', 'honeywell.com',
  '艾默生.com', 'emerson.com',
  '江森自控.com', 'johnsoncontrols.com',
  '派特盟.com',
  '网易.com', '126.com', '163.com', 'yeah.net',
  '新浪.com', 'sina.com', 'weibo.com',
  '搜狐.com', 'sohu.com',
  '凤凰网.com', 'ifeng.com',
  'TOM.com',
  '沃达丰.com', 'vodafone.com',
  'AT&T.com',
  '威瑞森.com', 'verizon.com',
  '美国电话电报公司.com',
  'SKYPE.com',
  'ZOOM.us',
  'slack.com',
  'teams.microsoft.com',
  '工作邮箱.com', '企业邮箱.com', '公司邮箱.com',
])

/**
 * 常见免费/个人邮箱域名列表。
 */
const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.com.cn', 'ymail.com',
  'hotmail.com', 'hotmail.co.uk', 'live.com', 'msn.com',
  'outlook.com', 'office.com',
  'qq.com', 'foxmail.com',
  '163.com', '126.com', 'yeah.net', '188.com',
  'sina.com', 'sina.cn', 'vip.sina.com',
  'sohu.com', 'chinaren.com',
  'tom.com', 'tom.net',
  '21cn.com',
  '188.com',
  '139.com',
  '189.com',
  'wo.cn',
  '189.cn',
  'aliyun.com', 'alicloud.com',
  '263.net', '263.com',
  '35.com', '35.cn',
  '21cn.net',
  'etang.com',
  'elong.com',
  'china.com', 'sohu.com',
  'icloud.com',
  'me.com', 'mac.com', 'apple.com',
  'protonmail.com', 'proton.me',
  'tutanota.com',
  'gmx.com', 'gmx.de', 'web.de', 'mail.de',
  'yandex.com', 'yandex.ru', 'yandex.ua',
  'mail.ru', 'bk.ru', 'list.ru',
  'inbox.ru',
  'zoho.com',
  'aol.com', 'aim.com',
  'comcast.net', 'att.net', 'verizon.net', 'cox.net',
  'charter.net', 'spectrum.net',
  'icloud.com',
  'live.com', 'msn.com',
  'yahoo.co.jp', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.it',
  'mail.com', 'email.com', 'iname.com',
  'fastmail.com',
  'pm.me', 'hey.com',
  'outlook.com', 'live.com', 'hotmail.com',
])

/**
 * 常见企业邮箱域名后缀（用于检测非个人邮箱的企业域名）。
 */
const COMMON_ENTERPRISE_SUFFIXES = [
  '.com.cn', '.com.tw', '.com.hk', '.co.jp', '.co.kr', '.co.uk', '.co.nz', '.co.au', '.co.in',
  '.net.cn', '.org.cn', '.gov.cn', '.edu.cn',
  '.com', '.net', '.org', '.biz', '.info', '.name', '.mobi', '.travel', '.pro',
  '.coop', '.aero', '.museum',
  '.ltd', '.company', '.corp', '.group', '.inc',
]

/**
 * 判断是否为个人邮箱。
 * @param {string} domain - 邮箱域名（小写）。
 * @returns {boolean}
 */
function isPersonalEmailDomain(domain) {
  const d = domain.toLowerCase()
  if (PERSONAL_EMAIL_DOMAINS.has(d)) return true
  if (ENTERPRISE_EMAIL_DOMAINS.has(d)) return false
  // 检查常见企业后缀但不是已知个人域名
  for (const suffix of COMMON_ENTERPRISE_SUFFIXES) {
    if (d.endsWith(suffix)) {
      return false
    }
  }
  // 默认按个人邮箱处理
  return true
}

/**
 * 检测邮箱类型并返回实体类型。
 * @param {string} email - 邮箱地址。
 * @returns {'email_personal' | 'email_enterprise'}
 */
function detectEmailType(email) {
  const atIndex = email.indexOf('@')
  if (atIndex === -1) return 'email_personal'
  const domain = email.substring(atIndex + 1).toLowerCase()
  return isPersonalEmailDomain(domain) ? 'email_personal' : 'email_enterprise'
}

/**
 * 内置正则检测器（实体 -> 多条 pattern，各自带置信度）。
 * 邮箱检测增强：区分个人邮箱和企业邮箱。
 */
export const BUILTIN_PATTERNS = Object.freeze([
  { entity: 'phone', source: /(?<!\d)1[3-9]\d{9}(?!\d)/gu, score: 0.95 },
  { entity: 'id-card', source: /(?<!\d)\d{17}[\dXx](?!\d)/gu, score: 0.92 },
  // 邮箱正则：通用邮箱检测
  { entity: 'email', source: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gu, score: 0.9 },
  { entity: 'bank-card', source: /(?<!\d)\d{16,19}(?!\d)/gu, score: 0.65 },
  { entity: 'ip', source: /\b(?:\d{1,3}\.){3}\d{1,3}\b/gu, score: 0.85 },
  { entity: 'key', source: /sk-[A-Za-z0-9_-]{16,}/gu, score: 0.95 },
  { entity: 'key', source: /gh[pousr]_[A-Za-z0-9]{16,}/gu, score: 0.95 },
  { entity: 'key', source: /xox[baprs]-[A-Za-z0-9-]{10,}/gu, score: 0.9 },
  { entity: 'key', source: /AKIA[0-9A-Z]{16}/gu, score: 0.9 },
  { entity: 'key', source: /Bearer[ \t]+[A-Za-z0-9._~+/=-]{8,}/gu, score: 0.9 },
])

/**
 * 邮箱检测结果。
 * @typedef {{text: string, entity: string, label: string, start: number, end: number, score: number}} PIIEntity
 */

/**
 * 增强的正则检测器：处理邮箱的 personal/enterprise 分类。
 * @param {string} text - 待检测文本。
 * @param {Array<{entity: string, source: RegExp, score: number}>} patterns - 正则 pattern 列表。
 * @param {boolean} enableEmailClassification - 是否启用邮箱分类。
 * @returns {PIIEntity[]} 实体列表。
 */
export function regexDetect(text, patterns, enableEmailClassification = true) {
  /** @type {PIIEntity[]} */
  const entities = []

  // 先处理非邮箱的实体
  for (const pattern of patterns) {
    if (pattern.entity !== 'email') {
      for (const match of text.matchAll(pattern.source)) {
        entities.push({
          text: match[0],
          entity: pattern.entity,
          label: ENTITY_LABELS[pattern.entity] ?? pattern.entity,
          start: match.index,
          end: match.index + match[0].length,
          score: pattern.score,
        })
      }
    }
  }

  // 单独处理邮箱，进行 personal/enterprise 分类
  const emailPattern = patterns.find(p => p.entity === 'email')
  if (emailPattern) {
    for (const match of text.matchAll(emailPattern.source)) {
      const email = match[0]
      if (enableEmailClassification) {
        const emailType = detectEmailType(email)
        entities.push({
          text: email,
          entity: emailType,
          label: ENTITY_LABELS[emailType] ?? emailType,
          start: match.index,
          end: match.index + email.length,
          score: emailPattern.score,
        })
      } else {
        // 分类关闭：邮箱作为通用 email 实体处理
        entities.push({
          text: email,
          entity: 'email',
          label: ENTITY_LABELS.email,
          start: match.index,
          end: match.index + email.length,
          score: emailPattern.score,
        })
      }
    }
  }

  return entities
}

/**
 * PII 脱敏器：把 PII 替换为占位符，邮箱特殊处理为 ***@example.com。
 */
export class Stripper {
  constructor(options) {
    this.patterns = options.patterns
    this.detector = options.detector ?? null
    this.maxEntries = options.maxEntries ?? LIMITS.MAX_RESTORE_ENTRIES
    this.enableEmailClassification = options.enableEmailClassification ?? true
    this.reset()
  }

  reset() {
    this.counter = new Map()
    this.placeholderMap = new Map()
    this.valueMap = new Map()
    this.totalReplaced = 0
    this.distribution = new Map()
  }

  strip(text) {
    this.reset()
    return this._apply(text)
  }

  stripInto(text) {
    const startReplaced = this.totalReplaced
    const startDist = new Map(this.distribution)
    const out = this._apply(text)
    const replaced = this.totalReplaced - startReplaced
    const distribution = /** @type {Record<string, number>} */ ({})
    for (const [label, count] of this.distribution) {
      const before = startDist.get(label) ?? 0
      if (count > before) distribution[label] = count - before
    }
    return { text: out, replaced, distribution }
  }

  restore(text) {
    if (typeof text !== 'string') return String(text)
    let result = text
    const entries = [...this.placeholderMap.entries()].sort((a, b) => b[0].length - a[0].length)
    for (const [placeholder, original] of entries) {
      result = result.split(placeholder).join(original)
    }
    return result
  }

  placeholdersIn(text) {
    if (typeof text !== 'string' || text.length === 0) return []
    return [...this.placeholderMap.keys()]
      .sort((a, b) => b.length - a.length)
      .filter(placeholder => text.includes(placeholder))
  }

  mapping() {
    return Object.fromEntries(this.placeholderMap)
  }

  loadMapping(entries) {
    for (const [placeholder, original] of Object.entries(entries ?? {})) {
      this.placeholderMap.set(placeholder, original)
      this.valueMap.set(original, placeholder)
      // 支持两种占位符格式：
      // 1) <LABEL_N>  (默认格式)
      // 2) ***@example.com_N  (邮箱格式，共享 EMAIL 计数器)
      let label = null
      let number = 0
      const angle = /^<([A-Z_]+)_(\d+)>$/u.exec(placeholder)
      if (angle !== null) {
        label = angle[1]
        number = Number(angle[2])
      } else {
        const at = /^\*\*\*@example\.com_(\d+)$/u.exec(placeholder)
        if (at !== null) {
          label = 'EMAIL'
          number = Number(at[1])
        }
      }
      if (label !== null) {
        const current = this.counter.get(label) ?? 0
        if (number > current) this.counter.set(label, number)
      }
    }
  }

  stats() {
    return { replaced: this.totalReplaced, distribution: Object.fromEntries(this.distribution) }
  }

  _apply(input) {
    const text = typeof input === 'string' ? input : String(input)
    if (text.length === 0 || text.length > LIMITS.MAX_TEXT_LENGTH) return text
    const entities = this._detect(text)
    const resolved = this._resolveOverlaps(entities)
    return this._applyReplacements(text, resolved)
  }

  _detect(text) {
    if (this.detector !== null) {
      return this.detector(text)
    }
    return regexDetect(text, this.patterns, this.enableEmailClassification)
  }

  _resolveOverlaps(entities) {
    if (entities.length === 0) return []
    const sorted = [...entities].sort((a, b) => a.start - b.start || b.score - a.score)
    const result = []
    let lastEnd = -1
    for (const entity of sorted) {
      if (entity.start >= lastEnd) {
        result.push(entity)
        lastEnd = entity.end
      }
    }
    return result
  }

  _applyReplacements(text, entities) {
    const parts = []
    let lastEnd = 0
    for (const entity of [...entities].sort((a, b) => a.start - b.start)) {
      parts.push(text.slice(lastEnd, entity.start))
      const original = entity.text
      let placeholder = this.valueMap.get(original)
      if (placeholder === undefined) {
        placeholder = this._makePlaceholder(entity.label, entity.entity, original)
        this.placeholderMap.set(placeholder, original)
        this.valueMap.set(original, placeholder)
      }
      parts.push(placeholder)
      lastEnd = entity.end
      this.totalReplaced += 1
      this.distribution.set(entity.label, (this.distribution.get(entity.label) ?? 0) + 1)
    }
    parts.push(text.slice(lastEnd))
    this._prune()
    return parts.join('')
  }

  /**
   * 生成唯一占位符，邮箱特殊处理为 ***@example.com。
   * @param {string} label - 实体标签。
   * @param {string} entity - 实体类型。
   * @param {string} original - 原始文本。
   * @returns {string} 占位符。
   */
  _makePlaceholder(label, entity, original) {
    // 邮箱类型特殊处理：使用 ***@example.com（固定域名）+ 唯一后缀作为显示占位符。
    // 计数器统一用 EMAIL key：EMAIL_PERSONAL / EMAIL_ENTERPRISE / EMAIL 不各自计数，
    // 否则同一会话先个人后企业都会产出 ***@example.com_1，占位符冲突覆盖。
    if (entity === 'email_personal' || entity === 'email_enterprise' || entity === 'email') {
      const count = (this.counter.get('EMAIL') ?? 0) + 1
      this.counter.set('EMAIL', count)
      return `***@example.com_${count}`
    }
    // 默认占位符格式 <LABEL_N>
    const count = (this.counter.get(label) ?? 0) + 1
    this.counter.set(label, count)
    return `<${label}_${count}>`
  }

  _prune() {
    while (this.placeholderMap.size > this.maxEntries) {
      const oldest = this.placeholderMap.keys().next().value
      const original = this.placeholderMap.get(oldest)
      this.placeholderMap.delete(oldest)
      if (original !== undefined) this.valueMap.delete(original)
    }
  }
}

/**
 * 按启用的实体集创建脱敏器。
 * @param {object} [options] - {entities?, maxEntries?, detector?, enableEmailClassification?}
 * @returns {Stripper} 配置好的脱敏器。
 */
export function createStripper(options = {}) {
  const enabled = new Set(options.entities ?? Object.keys(ENTITY_LABELS))
  // email_personal / email_enterprise 是 email 的细分：只要启用任一邮箱实体，
  // 就启用基础 email pattern（否则邮箱永远不会被检测到）。
  // 分类（个人/企业）由检测阶段根据域名列表决定，与 pattern 选择解耦。
  const emailOn = enabled.has('email')
    || enabled.has('email_personal')
    || enabled.has('email_enterprise')
  if (emailOn) enabled.add('email')
  const patterns = BUILTIN_PATTERNS.filter(pattern => enabled.has(pattern.entity))
  const enableEmailClassification = options.enableEmailClassification ?? true
  return new Stripper({ patterns, maxEntries: options.maxEntries, detector: options.detector, enableEmailClassification })
}