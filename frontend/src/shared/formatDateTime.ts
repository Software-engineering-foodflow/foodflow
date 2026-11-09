/** 顯示日期與後端日期篩選使用同一個台北時區。 */
const taipeiDateTime = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

export function formatDateTime(value: string): string {
  return `${taipeiDateTime.format(new Date(value))}（台北）`;
}
