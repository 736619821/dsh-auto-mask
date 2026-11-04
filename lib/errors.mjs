// lib/errors.mjs — 结构化领域错误（code + details，零依赖）。

import { ERROR_CODES } from './constants.mjs'

export class MaskError extends Error {
  constructor(code, message, details = undefined) {
    super(message)
    this.name = 'MaskError'
    this.code = code
    this.details = details
  }
}

export function badConfig(message) {
  return new MaskError(ERROR_CODES.BAD_CONFIG, `dsh-auto-mask config: ${message}`)
}

export function nerUnsupported(entity) {
  return new MaskError(
    ERROR_CODES.NER_UNSUPPORTED,
    `entity ${JSON.stringify(entity)} requires mode "regex+ner" (name/address recognition), which the pure-host form does not bundle`,
    { entity },
  )
}

export function nerModeUnsupported(mode) {
  return new MaskError(
    ERROR_CODES.NER_UNSUPPORTED,
    `mode ${JSON.stringify(mode)} (name/address recognition) is not bundled in the pure-host zero-dependency form; use "regex"`,
    { mode },
  )
}

export function scopeUnsupported(scope) {
  return new MaskError(
    ERROR_CODES.SCOPE_UNSUPPORTED,
    `scope ${JSON.stringify(scope)} is not a valid surface; expected "messages" and/or "tools"`,
    { scope },
  )
}

export function registryUnavailable(reason) {
  return new MaskError(ERROR_CODES.REGISTRY_UNAVAILABLE, `dsh-auto-mask storage domain unavailable: ${reason}`, { reason })
}

export function messageOf(error) {
  if (error instanceof Error) return error.message
  return String(error)
}