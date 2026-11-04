// lib/sanitize.mjs — 展示/日志脱敏纯函数（零依赖）。

import { BUILTIN_PATTERNS } from './strip.mjs'

const REDACT_RE = new RegExp(BUILTIN_PATTERNS.map(pattern => pattern.source.source).join('|'), 'gu')

const CREDENTIAL_ASSIGNMENT = /\b((?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|password|passwd|client[_-]?secret|private[_-]?key)\s*=\s*)([^\s&;,]+)/giu

const URL_USERINFO = /\/\/([^/\s:@]+):([^/\s@]+)@/gu

export function redactText(text) {
  if (typeof text !== 'string') return String(text)
  return text
    .replace(URL_USERINFO, '//***@')
    .replace(CREDENTIAL_ASSIGNMENT, '$1***')
    .replace(REDACT_RE, '***')
}

export function redactMapping(mapping) {
  if (mapping === null || typeof mapping !== 'object') return /** @type {Record<string, string>} */ ({})
  const out = /** @type {Record<string, string>} */ ({})
  for (const [placeholder] of Object.entries(mapping)) {
    out[placeholder] = '***'
  }
  return out
}