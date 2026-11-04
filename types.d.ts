// types.d.ts — dsh-auto-mask 类型契约。

declare module '@deepseek-ai/dsh-session' {
  interface SessionEventMap {
    'automask/applied': {
      sessionId: string
      replaced: number
      distribution: Record<string, number>
    }
  }
}

export interface Config {
  /** 总开关；false 时全部卸载。 */
  enabled?: boolean
  /** 检测模式；只有 'regex' 实现。 */
  mode?: 'regex' | 'regex+ner'
  /** 启用的实体类型。 */
  entities?: string[]
  /**
   * 遮罩作用域；'messages' = agent/pre-step 入站消息，'tools' = tools/post-execute 工具结果。
   */
  scope?: 'messages' | 'tools' | Array<'messages' | 'tools'>
  /** 注册 /mask 命令（默认 true）。 */
  registerCommand?: boolean
  /** 注册 mask_test 工具（默认 true）。 */
  registerTools?: boolean
  /** 恢复表持久化到 storageDomain（默认 true）。 */
  persistRestoreTable?: boolean
  /** 每会话恢复条目上限。 */
  maxRestoreEntriesPerSession?: number
  /** 内存会话脱敏器上限。 */
  maxSessions?: number
  /** 浏览器半自动还原气泡开关（默认 false）。 */
  maskClientEnabled?: boolean
  /** `/mask restore` 明文交付目录（默认空串 = os.tmpdir()/dsh-auto-mask-restore）。 */
  restoreDir?: string
  /** 启用邮箱分类（个人 vs 企业，默认 true）。 */
  enableEmailClassification?: boolean
}

export interface MaskTestValue {
  ok: boolean
  masked: string
  replaced: number
  distribution: { label: string; count: number }[]
  error?: string
}