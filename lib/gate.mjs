// lib/gate.mjs — 会话事件自适应门（零依赖）。

import { PLUGIN_NAME } from './constants.mjs'

export function makeEventGate(knownTypes, ignorableAppend = false, warn = () => {}) {
  const warned = new Set()
  return (type, sessionKey) => {
    if (knownTypes.has(type)) return { append: true, ignorable: false }
    if (ignorableAppend) return { append: true, ignorable: true }
    const key = `${sessionKey ?? 'unknown-session'}:${type}`
    if (!warned.has(key)) {
      warned.add(key)
      warn(`${PLUGIN_NAME} session event ${type} is not recorded by this host and cannot carry the ignorable envelope: the audit event is skipped so the session keeps loading.`)
    }
    return { append: false, ignorable: false }
  }
}

export function maybeAppendSessionEvent(session, type, data, gate, warn) {
  if (session === null || session === undefined) return undefined
  const decision = gate(type, session.id)
  if (!decision.append) return undefined
  try {
    return session.append(type, data, decision.ignorable ? { ignorable: true } : undefined)
  } catch (error) {
    warn(`${PLUGIN_NAME} session event ${type} append failed: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}