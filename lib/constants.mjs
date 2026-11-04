// lib/constants.mjs — 词汇表与协议常量（零依赖）。

// 插件标识、命令名与工具名。
export const PLUGIN_NAME = 'auto-mask'
export const COMMAND_NAME = 'mask'
export const TOOL_MASK_TEST = 'mask_test'

// ctx.storageDomain 领域名（恢复表 + 统计表）。
export const DOMAIN_NAME = 'dsh_auto_mask'

// 存储领域表名。
export const RESTORE_TABLE = 'restore'

// 实体类型词汇。
export const ENTITY_NAMES = Object.freeze([
  'phone',
  'email',
  'email_personal',
  'email_enterprise',
  'id-card',
  'bank-card',
  'key',
  'ip',
  'person',
  'address',
])

export const REGEX_ENTITIES = Object.freeze(['phone', 'email', 'email_personal', 'email_enterprise', 'id-card', 'bank-card', 'key', 'ip'])
export const NER_ENTITIES = Object.freeze(['person', 'address'])

// 实体类型 -> 占位符标签。
export const ENTITY_LABELS = Object.freeze({
  phone: 'PHONE',
  email: 'EMAIL',
  email_personal: 'EMAIL_PERSONAL',
  email_enterprise: 'EMAIL_ENTERPRISE',
  'id-card': 'ID_CARD',
  'bank-card': 'BANK_CARD',
  key: 'KEY',
  ip: 'IP',
  person: 'PERSON',
  address: 'ADDRESS',
})

// 检测模式词汇。
export const MODES = Object.freeze({
  REGEX: 'regex',
  REGEX_NER: 'regex+ner',
})

// 作用域词汇。
export const SCOPES = Object.freeze({
  MESSAGES: 'messages',
  TOOLS: 'tools',
})

// 会话事件类型。
export const SESSION_EVENTS = Object.freeze({
  APPLIED: 'automask/applied',
})

// 领域错误码。
export const ERROR_CODES = Object.freeze({
  BAD_CONFIG: 'BAD_CONFIG',
  NER_UNSUPPORTED: 'NER_UNSUPPORTED',
  SCOPE_UNSUPPORTED: 'SCOPE_UNSUPPORTED',
  REGISTRY_UNAVAILABLE: 'REGISTRY_UNAVAILABLE',
})

// 默认占位符模板（保留域名）。
export const EMAIL_PLACEHOLDER_DOMAIN = 'example.com'

// 默认值。
export const DEFAULTS = Object.freeze({
  ENABLED: true,
  MODE: MODES.REGEX,
  ENTITIES: ['phone', 'email', 'email_personal', 'email_enterprise', 'id-card', 'bank-card', 'key'],
  SCOPE: [SCOPES.MESSAGES],
  REGISTER_COMMAND: true,
  REGISTER_TOOLS: true,
  PERSIST_RESTORE_TABLE: true,
  MAX_RESTORE_ENTRIES_PER_SESSION: 500,
  MAX_SESSIONS: 1000,
  MASK_CLIENT_ENABLED: false,
  RESTORE_DIR: '',
})

// 配置字段合法性边界。
export const LIMITS = Object.freeze({
  MIN_RESTORE_ENTRIES: 1,
  MAX_RESTORE_ENTRIES: 1_000_000,
  MIN_SESSIONS: 1,
  MAX_SESSIONS: 1_000_000,
  MAX_ENTITY_COUNT: 64,
  MAX_TEXT_LENGTH: 1_000_000,
})