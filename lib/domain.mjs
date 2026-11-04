// lib/domain.mjs — 'dsh_auto_mask' 存储领域声明。

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { DOMAIN_NAME, RESTORE_TABLE } from './constants.mjs'

export const restoreRecordSchema = z.object({
  sessionId: z.string().min(1).max(128),
  entries: z.record(z.string(), z.string()),
  updatedAt: z.number().int().nonnegative(),
})

export const dshAutoMaskDomainSpec = defineDomain({
  name: DOMAIN_NAME,
  version: 1,
  tables: { [RESTORE_TABLE]: domainTable(restoreRecordSchema) },
})