// src/utils/date.ts

/**
 * UTC ISO 时间字符串转本地时间格式化
 * @param isoString 后端返回的 ISO 时间字符串
 * @param format 输出精度
 *  - date: 仅日期 YYYY-MM-DD（默认）
 *  - datetime: 日期+时分 YYYY-MM-DD HH:mm
 *  - full: 日期+时分秒 YYYY-MM-DD HH:mm:ss
 */
export function formatDate(
  isoString: string,
  format: 'date' | 'datetime' | 'full' = 'date'
): string {
  if (!isoString) return ''

  const date = new Date(isoString)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  if (format === 'date') {
    return `${year}-${month}-${day}`
  }

  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  if (format === 'datetime') {
    return `${year}-${month}-${day} ${hours}:${minutes}`
  }

  // full 精度：时分秒
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}
