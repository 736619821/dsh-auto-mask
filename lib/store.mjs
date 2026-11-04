// lib/store.mjs — 恢复表存储（内存 Stripper + 受控 storageDomain 持久化）。

import { createStripper } from './strip.mjs'
import { DEFAULTS, RESTORE_TABLE } from './constants.mjs'
import { registryUnavailable } from './errors.mjs'

export class RestoreStore {
  constructor(options) {
    this.entities = options.entities ?? DEFAULTS.ENTITIES
    this.maxEntries = options.maxEntries ?? DEFAULTS.MAX_RESTORE_ENTRIES_PER_SESSION
    this.maxSessions = options.maxSessions ?? DEFAULTS.MAX_SESSIONS
    this.persistEnabled = options.persist ?? DEFAULTS.PERSIST_RESTORE_TABLE
    this.domainPromise = options.domainPromise ?? null
    this.onError = options.onError ?? (() => {})
    this.enableEmailClassification = options.enableEmailClassification ?? true
    this.strippers = new Map()
  }

  stripperFor(sessionId) {
    let stripper = this.strippers.get(sessionId)
    if (stripper === undefined) {
      stripper = createStripper({
        entities: this.entities,
        maxEntries: this.maxEntries,
        enableEmailClassification: this.enableEmailClassification,
      })
      this.strippers.set(sessionId, stripper)
      this._pruneSessions()
    }
    return stripper
  }

  mask(sessionId, text) {
    return this.stripperFor(sessionId).stripInto(text)
  }

  stats(sessionId) {
    return this.stripperFor(sessionId).stats()
  }

  async restore(sessionId, text) {
    const stripper = await this._stripperForRestore(sessionId)
    if (stripper === undefined) return text
    return stripper.restore(text)
  }

  async restoreDetailed(sessionId, text) {
    const stripper = await this._stripperForRestore(sessionId)
    if (stripper === undefined) return { text, placeholders: [] }
    return { text: stripper.restore(text), placeholders: stripper.placeholdersIn(text) }
  }

  async _stripperForRestore(sessionId) {
    let stripper = this.strippers.get(sessionId)
    if (stripper === undefined && this.persistEnabled && this.domainPromise !== null) {
      stripper = await this._load(sessionId)
    }
    return stripper
  }

  async persist(sessionId) {
    if (!this.persistEnabled || this.domainPromise === null) return
    const stripper = this.strippers.get(sessionId)
    if (stripper === undefined) return
    try {
      const domain = await this.domainPromise
      const table = domain.table(RESTORE_TABLE)
      await table.put(sessionId, { sessionId, entries: stripper.mapping(), updatedAt: Date.now() })
    } catch (error) {
      this.onError(registryUnavailable(error instanceof Error ? error.message : String(error)))
    }
  }

  async _load(sessionId) {
    try {
      const domain = await this.domainPromise
      const record = await domain.table(RESTORE_TABLE).get(sessionId)
      if (record === undefined || record.entries === undefined) return undefined
      const stripper = createStripper({
        entities: this.entities,
        maxEntries: this.maxEntries,
        enableEmailClassification: this.enableEmailClassification,
      })
      stripper.loadMapping(record.entries)
      this.strippers.set(sessionId, stripper)
      this._pruneSessions()
      return stripper
    } catch (error) {
      this.onError(registryUnavailable(error instanceof Error ? error.message : String(error)))
      return undefined
    }
  }

  _pruneSessions() {
    while (this.strippers.size > this.maxSessions) {
      const oldest = this.strippers.keys().next().value
      this.strippers.delete(oldest)
    }
  }
}