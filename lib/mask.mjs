// lib/mask.mjs — 消息遮罩助手（零依赖）。

/**
 * 遮罩单条消息的文本内容块。
 * @param {object} message - UserMessage（含 content 数组）。
 * @param {import('./strip.mjs').Stripper} stripper - 累计脱敏器。
 * @returns {{message: object, replaced: number}} 遮罩后消息与本次替换数。
 */
export function maskMessage(message, stripper) {
  if (message === null || typeof message !== 'object' || !Array.isArray(message.content)) {
    return { message, replaced: 0 }
  }
  let replaced = 0
  let changed = false
  const content = message.content.map((block) => {
    if (block === null || typeof block !== 'object' || block.type !== 'text' || typeof block.text !== 'string') {
      return block
    }
    const result = stripper.stripInto(block.text)
    if (result.replaced > 0) {
      replaced += result.replaced
      changed = true
    }
    return { ...block, text: result.text }
  })
  if (!changed) return { message, replaced: 0 }
  return { message: { ...message, content }, replaced }
}

/**
 * 遮罩消息数组。
 * @param {object[]} messages - UserMessage 数组。
 * @param {import('./strip.mjs').Stripper} stripper - 累计脱敏器。
 * @returns {{messages: object[], replaced: number}} 遮罩后数组与总替换数。
 */
export function maskMessages(messages, stripper) {
  let replaced = 0
  const masked = (Array.isArray(messages) ? messages : []).map((message) => {
    const result = maskMessage(message, stripper)
    replaced += result.replaced
    return result.message
  })
  return { messages: masked, replaced }
}

/**
 * 遮罩任意内容块数组（工具结果的 text 块等）。
 * @param {object[]} blocks - 内容块数组。
 * @param {import('./strip.mjs').Stripper} stripper - 累计脱敏器。
 * @returns {{blocks: object[], replaced: number}} 遮罩后数组与本次替换数。
 */
export function maskContentBlocks(blocks, stripper) {
  if (!Array.isArray(blocks)) return { blocks, replaced: 0 }
  let replaced = 0
  let changed = false
  const masked = blocks.map((block) => {
    if (block === null || typeof block !== 'object' || block.type !== 'text' || typeof block.text !== 'string') {
      return block
    }
    const result = stripper.stripInto(block.text)
    if (result.replaced > 0) {
      replaced += result.replaced
      changed = true
    }
    return { ...block, text: result.text }
  })
  if (!changed) return { blocks, replaced: 0 }
  return { blocks: masked, replaced }
}