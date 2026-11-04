// index.mjs — dsh-auto-mask 插件入口（唯一 host 面文件）。
//
// 功能：模型边界的 PII 匿名化-恢复中间件（增强版）。
// - 请求前遮罩：监听 agent/pre-step（waterfall，直通 next()），把进入模型的
//   UserMessage 文本块里的 PII 替换为占位符；邮箱特殊处理为 ***@domain
//   （保留域名，方便模型知道这是邮箱，不破坏上下文）。
// - 邮箱分类：区分个人邮箱（gmail, qq, 163等）和企业邮箱（企业域名）。
// - 恢复表：占位符→原文映射只存内存 + 受控 storageDomain。
// - 还原交付：宿主把命令结果原样写进持久会话日志，所以明文写进受控文件。
// - 审计：mask/applied 会话事件只记"替换了 N 处 + 类型分布"。
// - 表面：/mask 命令（status|on|off|restore|help）与 mask_test 工具。

import { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import SessionStore, { KNOWN_SESSION_EVENT_TYPES } from '@deepseek-ai/dsh-session'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  COMMAND_NAME,
  DEFAULTS,
  ENTITY_NAMES,
  LIMITS,
  MODES,
  NER_ENTITIES,
  PLUGIN_NAME,
  REGEX_ENTITIES,
  SCOPES,
  SESSION_EVENTS,
  TOOL_MASK_TEST,
} from './lib/constants.mjs'
import { badConfig, messageOf, nerModeUnsupported, nerUnsupported, scopeUnsupported } from './lib/errors.mjs'
import { createStripper } from './lib/strip.mjs'
import { maskMessages, maskContentBlocks } from './lib/mask.mjs'
import { makeEventGate, maybeAppendSessionEvent } from './lib/gate.mjs'
import { RestoreStore } from './lib/store.mjs'
import { dshAutoMaskDomainSpec } from './lib/domain.mjs'
import { deliverPlaintext, resolveRestoreDir } from './lib/deliver.mjs'
import { redactText } from './lib/sanitize.mjs'

export const name = PLUGIN_NAME

export const inject = ['commands']

export function probeIgnorableAppend() {
  try {
    const store = new SessionStore(new Context())
    const session = store.create()
    const event = session.append(SESSION_EVENTS.APPLIED, {
      sessionId: 'probe',
      replaced: 0,
      distribution: {},
    }, /** @type {any} */ ({ ignorable: true }))
    return event?.ignorable === true
  } catch {
    return false
  }
}

export const Config = Schema.object({
  enabled: Schema.boolean().default(DEFAULTS.ENABLED),
  mode: Schema.union([MODES.REGEX, MODES.REGEX_NER]).default(DEFAULTS.MODE),
  entities: Schema.array(Schema.string()).default(DEFAULTS.ENTITIES),
  scope: Schema.union([
    Schema.array(Schema.union([SCOPES.MESSAGES, SCOPES.TOOLS])),
    Schema.union([SCOPES.MESSAGES, SCOPES.TOOLS]),
  ]).default(DEFAULTS.SCOPE),
  registerCommand: Schema.boolean().default(DEFAULTS.REGISTER_COMMAND),
  registerTools: Schema.boolean().default(DEFAULTS.REGISTER_TOOLS),
  persistRestoreTable: Schema.boolean().default(DEFAULTS.PERSIST_RESTORE_TABLE),
  maxRestoreEntriesPerSession: Schema.number().default(DEFAULTS.MAX_RESTORE_ENTRIES_PER_SESSION),
  maxSessions: Schema.number().default(DEFAULTS.MAX_SESSIONS),
  maskClientEnabled: Schema.boolean().default(DEFAULTS.MASK_CLIENT_ENABLED),
  restoreDir: Schema.string().default(DEFAULTS.RESTORE_DIR),
  enableEmailClassification: Schema.boolean().default(true),
})

export function resolveConfig(config = {}) {
  const rawScope = config.scope ?? DEFAULTS.SCOPE
  const resolved = {
    enabled: config.enabled ?? DEFAULTS.ENABLED,
    mode: config.mode ?? DEFAULTS.MODE,
    entities: [...(config.entities ?? DEFAULTS.ENTITIES)],
    scope: typeof rawScope === 'string' ? [rawScope] : [...rawScope],
    registerCommand: config.registerCommand ?? DEFAULTS.REGISTER_COMMAND,
    registerTools: config.registerTools ?? DEFAULTS.REGISTER_TOOLS,
    persistRestoreTable: config.persistRestoreTable ?? DEFAULTS.PERSIST_RESTORE_TABLE,
    maxRestoreEntriesPerSession: config.maxRestoreEntriesPerSession ?? DEFAULTS.MAX_RESTORE_ENTRIES_PER_SESSION,
    maxSessions: config.maxSessions ?? DEFAULTS.MAX_SESSIONS,
    maskClientEnabled: config.maskClientEnabled ?? DEFAULTS.MASK_CLIENT_ENABLED,
    restoreDir: config.restoreDir ?? DEFAULTS.RESTORE_DIR,
    enableEmailClassification: config.enableEmailClassification ?? true,
  }
  if (resolved.enabled === false) return resolved

  if (typeof resolved.restoreDir !== 'string') {
    throw badConfig('restoreDir must be a string (empty = the OS temp directory)')
  }
  if (resolved.mode === MODES.REGEX_NER) {
    throw nerModeUnsupported(resolved.mode)
  }
  if (resolved.mode !== MODES.REGEX) {
    throw badConfig(`mode ${JSON.stringify(resolved.mode)} must be one of regex|regex+ner`)
  }
  const scopeSeen = new Set()
  resolved.scope = resolved.scope.filter((surface) => {
    if (scopeSeen.has(surface)) return false
    scopeSeen.add(surface)
    return true
  })
  if (resolved.scope.length === 0) {
    throw badConfig('scope must list at least one surface (messages and/or tools)')
  }
  for (const surface of resolved.scope) {
    if (surface !== SCOPES.MESSAGES && surface !== SCOPES.TOOLS) {
      throw scopeUnsupported(surface)
    }
  }
  const seen = new Set()
  resolved.entities = resolved.entities.filter((entity) => {
    if (seen.has(entity)) return false
    seen.add(entity)
    return true
  })
  if (resolved.entities.length === 0) {
    throw badConfig('entities must list at least one entity type')
  }
  if (resolved.entities.length > LIMITS.MAX_ENTITY_COUNT) {
    throw badConfig(`entities must list at most ${LIMITS.MAX_ENTITY_COUNT} types`)
  }
  for (const entity of resolved.entities) {
    if (!ENTITY_NAMES.includes(entity)) {
      throw badConfig(`unknown entity ${JSON.stringify(entity)}; valid: ${ENTITY_NAMES.join(', ')}`)
    }
    if (NER_ENTITIES.includes(entity)) {
      throw nerUnsupported(entity)
    }
  }
  if (!Number.isInteger(resolved.maxRestoreEntriesPerSession)
    || resolved.maxRestoreEntriesPerSession < LIMITS.MIN_RESTORE_ENTRIES
    || resolved.maxRestoreEntriesPerSession > LIMITS.MAX_RESTORE_ENTRIES) {
    throw badConfig(`maxRestoreEntriesPerSession must be an integer in [${LIMITS.MIN_RESTORE_ENTRIES}, ${LIMITS.MAX_RESTORE_ENTRIES}]`)
  }
  if (!Number.isInteger(resolved.maxSessions)
    || resolved.maxSessions < LIMITS.MIN_SESSIONS
    || resolved.maxSessions > LIMITS.MAX_SESSIONS) {
    throw badConfig(`maxSessions must be an integer in [${LIMITS.MIN_SESSIONS}, ${LIMITS.MAX_SESSIONS}]`)
  }
  return resolved
}

const HELP_TEXT = [
  'automask: usage — /mask [status | on | off | restore <text> | help]',
  '  status   show masking state: enabled, total replaced, type distribution (default)',
  '  on       enable masking at runtime (config.enabled is the persistent switch)',
  '  off      disable masking at runtime',
  '  restore  unmap placeholders in <text> back to the values stored for this session and',
  '           deliver the plaintext as a file — never in this result text or the session log',
  '  Email placeholders are like ***@domain.com (domain is preserved for context)',
].join('\n')

export function renderRestore(delivery) {
  return [
    `automask: restored ${delivery.placeholders.length} placeholder(s): ${delivery.placeholders.join(', ')}`,
    `  file: ${delivery.path}  (mode 0600, one file per session)`,
    '  The plaintext is NOT in this text and NOT in the session log.',
    '  Open the file above to read the plaintext; the next /mask restore overwrites it.',
  ].join('\n')
}

const RESTORE_NO_ARG_NOTE = [
  '  (a no-argument form that would restore every placeholder of the last assistant message is',
  '   not offered: see README Known limitations.)',
].join('\n')

export function renderStatus(stats) {
  const distribution = Object.entries(stats.distribution ?? {}).sort((a, b) => b[1] - a[1])
  return [
    `automask: ${stats.enabled ? 'enabled' : 'disabled (runtime off)'}`,
    `  replaced: ${stats.replaced} total`,
    `  distribution: ${distribution.length === 0 ? '(none yet)' : distribution.map(([label, count]) => `${label}=${count}`).join(', ')}`,
  ].join('\n')
}

export function renderMaskTest(value) {
  if (!value.ok) return `mask_test failed: ${value.error ?? 'unknown error'}`
  const distribution = (value.distribution ?? []).map((entry) => `${entry.label}=${entry.count}`).join(', ')
  return [
    `mask_test: replaced ${value.replaced} PII value(s)${distribution ? ` (${distribution})` : ''}`,
    'masked:',
    value.masked,
  ].join('\n')
}

export function makeMaskTestTool(entities, maxEntries, enableEmailClassification) {
  return defineTool({
    name: TOOL_MASK_TEST,
    description: 'Mask a snippet of text through the PII detector (enhanced email classification: personal vs enterprise) and report the placeholder result. Email placeholders preserve domain like ***@domain.com.',
    parameters: {
      text: { type: 'string', required: true, description: 'The text to run through the PII masker. Detected PII is replaced with placeholders (emails become ***@domain.com).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean', required: true },
          masked: { type: 'string' },
          replaced: { type: 'integer' },
          distribution: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                label: { type: 'string' },
                count: { type: 'integer' },
              },
            },
          },
          error: { type: 'string' },
        },
      },
      render(_args, value) {
        return [{ type: 'text', text: renderMaskTest(value) }]
      },
    },
    async execute(args, exec) {
      exec.signal?.throwIfAborted()
      try {
        const stripper = createStripper({ entities, maxEntries, enableEmailClassification })
        const masked = stripper.strip(args.text)
        const stats = stripper.stats()
        return {
          ok: true,
          masked,
          replaced: stats.replaced,
          distribution: Object.entries(stats.distribution).map(([label, count]) => ({ label, count })),
        }
      } catch (error) {
        return { ok: false, masked: '', replaced: 0, distribution: [], error: messageOf(error) }
      }
    },
  })
}

export function apply(ctx, config = {}) {
  const resolved = resolveConfig(config)
  if (resolved.enabled === false) return

  const logger = ctx.logger(PLUGIN_NAME)
  const warn = (message) => logger.warn(message)
  const eventGate = makeEventGate(KNOWN_SESSION_EVENT_TYPES, probeIgnorableAppend(), warn)

  const storageDomain = ctx.get('storageDomain')
  let domainPromise = null
  if (storageDomain !== undefined) {
    domainPromise = (async () => storageDomain.open(dshAutoMaskDomainSpec))()
    domainPromise.catch((error) => {
      warn(`storage domain unavailable: ${messageOf(error)}`)
    })
    ctx.effect(() => () => {
      void domainPromise.then((domain) => domain.close()).catch(() => {})
    }, `${PLUGIN_NAME}.domain.close`)
  } else if (resolved.persistRestoreTable) {
    warn('storageDomain not composed: the restore table is memory-only (lost on restart).')
  }

  const store = new RestoreStore({
    entities: resolved.entities,
    maxEntries: resolved.maxRestoreEntriesPerSession,
    maxSessions: resolved.maxSessions,
    persist: resolved.persistRestoreTable,
    domainPromise: resolved.persistRestoreTable ? domainPromise : null,
    onError: (error) => warn(messageOf(error)),
    enableEmailClassification: resolved.enableEmailClassification,
  })

  let runtimeEnabled = true

  if (resolved.scope.includes(SCOPES.MESSAGES)) {
    ctx.on('agent/pre-step', async ({ agent, messages }, next) => {
      if (!runtimeEnabled) return next()
      const decision = await next()
      if (decision.kind !== 'enter') return decision
      const sessionId = agent?.session?.id
      if (sessionId === undefined || sessionId === null || sessionId === '') return decision
      const stripper = store.stripperFor(sessionId)
      const before = stripper.stats()
      const { messages: maskedMessages, replaced } = maskMessages(decision.messages, stripper)
      if (replaced === 0) return decision
      const after = stripper.stats()
      const distribution = {}
      for (const [label, count] of Object.entries(after.distribution)) {
        const delta = count - (before.distribution[label] ?? 0)
        if (delta > 0) distribution[label] = delta
      }
      void store.persist(sessionId)
      maybeAppendSessionEvent(agent.session, SESSION_EVENTS.APPLIED, {
        sessionId,
        replaced,
        distribution,
      }, eventGate, warn)
      return { kind: 'enter', messages: maskedMessages }
    })
  }

  if (resolved.scope.includes(SCOPES.TOOLS)) {
    ctx.on('tools/post-execute', async (exec, result, next) => {
      if (!runtimeEnabled) return next()
      const decision = await next()
      if (decision.kind !== 'accept') return decision
      const sessionId = exec?.agent?.session?.id
      if (sessionId === undefined || sessionId === null || sessionId === '') return decision
      const stripper = store.stripperFor(sessionId)
      const before = stripper.stats()
      const { blocks: maskedBlocks, replaced } = maskContentBlocks(result.content, stripper)
      if (replaced === 0) return decision
      const after = stripper.stats()
      const distribution = {}
      for (const [label, count] of Object.entries(after.distribution)) {
        const delta = count - (before.distribution[label] ?? 0)
        if (delta > 0) distribution[label] = delta
      }
      void store.persist(sessionId)
      maybeAppendSessionEvent(exec.agent?.session, SESSION_EVENTS.APPLIED, {
        sessionId,
        replaced,
        distribution,
      }, eventGate, warn)
      return { kind: 'accept', content: maskedBlocks }
    })
  }

  if (resolved.registerCommand) {
    ctx.commands.register({
      name: COMMAND_NAME,
      description: 'Enhanced PII masking status and controls: status, on/off toggle, restore <text> (unmap placeholders), help. Emails are masked as ***@domain.com to preserve context.',
      input: { hint: '[status | on | off | restore <text> | help]' },
      recordInput: false,
      async handler(invocation) {
        return handleMaskCommand(invocation)
      },
    })
  }

  async function handleMaskCommand(invocation) {
    const { agent, rawInput } = invocation
    const sessionId = agent?.session?.id
    const input = (rawInput ?? '').trim()
    const [action, ...rest] = input.split(/\s+/u)
    const actionKey = (action || 'status').toLowerCase()
    try {
      if (actionKey === 'help' || !['status', 'on', 'off', 'restore'].includes(actionKey)) {
        return { kind: 'success', text: HELP_TEXT }
      }
      if (actionKey === 'on') {
        runtimeEnabled = true
        return { kind: 'success', text: 'automask: masking enabled (runtime)' }
      }
      if (actionKey === 'off') {
        runtimeEnabled = false
        return { kind: 'success', text: 'automask: masking disabled (runtime)' }
      }
      if (actionKey === 'status') {
        const stats = sessionId ? store.stats(sessionId) : { replaced: 0, distribution: {} }
        return { kind: 'success', text: renderStatus({ enabled: runtimeEnabled, ...stats }) }
      }
      if (actionKey === 'restore') {
        const snippet = rest.join(' ')
        if (sessionId === undefined || sessionId === null || sessionId === '') {
          return { kind: 'error', text: 'automask: restore requires an active session' }
        }
        if (snippet === '') {
          return { kind: 'error', text: `automask: restore needs text, e.g. /mask restore <PHONE_1>\n${RESTORE_NO_ARG_NOTE}` }
        }
        const { text: restored, placeholders } = await store.restoreDetailed(sessionId, snippet)
        if (placeholders.length === 0) {
          return {
            kind: 'success',
            text: [
              'automask: restore found no placeholder this session knows — nothing was revealed.',
              '  Pass a placeholder exactly as the model saw it.',
            ].join('\n'),
          }
        }
        const delivery = await deliverPlaintext({
          dir: resolveRestoreDir(resolved.restoreDir),
          sessionId,
          text: restored,
        })
        return { kind: 'success', text: renderRestore({ placeholders, path: delivery.path }) }
      }
      return { kind: 'success', text: HELP_TEXT }
    } catch (error) {
      const message = redactText(`automask: ${actionKey} failed: ${messageOf(error)}`)
      logger.error(message)
      return { kind: 'error', text: message }
    }
  }

  if (resolved.registerTools) {
    ctx.inject(['tools'], (toolCtx) => {
      toolCtx.tools.register(makeMaskTestTool(
        resolved.entities,
        resolved.maxRestoreEntriesPerSession,
        resolved.enableEmailClassification
      ))
    })
  }
}

export {
  RestoreStore,
  createStripper,
  maskMessages,
  maskContentBlocks,
  makeEventGate,
  maybeAppendSessionEvent,
  dshAutoMaskDomainSpec,
  nerUnsupported,
  nerModeUnsupported,
  scopeUnsupported,
}