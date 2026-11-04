// lib/deliver.mjs — 还原结果的受控明文交付（零 DSH 依赖）。

import { createHash } from 'node:crypto'
import { chmod, lstat, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export const RESTORE_DIR_NAME = 'dsh-auto-mask-restore'
export const RESTORE_FILE_PREFIX = 'restore-'

const DIR_MODE = 0o700
const FILE_MODE = 0o600

export function resolveRestoreDir(configured) {
  const raw = typeof configured === 'string' ? configured.trim() : ''
  return raw === '' ? path.join(os.tmpdir(), RESTORE_DIR_NAME) : path.resolve(raw)
}

export function restoreFilePath(dir, sessionId) {
  const digest = createHash('sha256').update(String(sessionId ?? '')).digest('hex').slice(0, 16)
  return path.join(dir, `${RESTORE_FILE_PREFIX}${digest}.txt`)
}

async function assertNotSymlink(target, what) {
  try {
    const stats = await lstat(target)
    if (stats.isSymbolicLink()) {
      throw new Error(`${what} is a symbolic link: refusing to write plaintext through it`)
    }
    return stats
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return undefined
    throw error
  }
}

export async function deliverPlaintext({ dir, sessionId, text }) {
  const target = restoreFilePath(dir, sessionId)
  await assertNotSymlink(dir, 'restoreDir')
  await mkdir(dir, { recursive: true, mode: DIR_MODE })
  const dirStats = await assertNotSymlink(dir, 'restoreDir')
  if (dirStats === undefined || !dirStats.isDirectory()) {
    throw new Error('restoreDir is not a directory')
  }
  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined
  if (uid !== undefined && dirStats.uid !== uid) {
    throw new Error('restoreDir is owned by another user: refusing to write plaintext there')
  }
  await chmod(dir, DIR_MODE)
  await assertNotSymlink(target, 'restore file')
  const body = typeof text === 'string' ? text : String(text)
  await writeFile(target, body, { encoding: 'utf8', mode: FILE_MODE, flag: 'w' })
  await chmod(target, FILE_MODE)
  return { path: target, bytes: Buffer.byteLength(body, 'utf8') }
}