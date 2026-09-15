// 日期口径回归测试
//
// 背景：产品原先用 new Date().toISOString().slice(0, 10) 取「今天」，那是 UTC 日期，
// 北京时间 0:00–8:00 会算成前一天，早上第一节课录入的违纪文字、作业反馈默认落到昨天那一栏。
// 这类 bug 平时看不出来，只在清晨出现，所以必须钉一个不依赖真实时钟的断言。
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

const { localDateStr, today } = await import('../../app/core/date.js');

const pad = (value) => String(value).padStart(2, '0');

/** 独立复算一遍「本地时区下的日期」，不调用被测函数，避免自证。 */
function localDayOf(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

describe('日期本地口径', () => {
  it('localDateStr 取本地日，不按 UTC 切日', () => {
    // 用显式本地分量构造：本地 2026-09-15 01:00（对应 UTC 2026-09-14T17:00）。
    // 若实现退回 toISOString().slice(0, 10)，这里会输出 '2026-09-14'，断言立刻失败。
    assert.equal(localDateStr(new Date(2026, 8, 15, 1, 0, 0)), '2026-09-15');
    // 本地当天最后一刻同样属于 9-15，UTC 口径会算成 9-15 的前一天
    assert.equal(localDateStr(new Date(2026, 8, 15, 23, 59, 59)), '2026-09-15');
  });

  it('localDateStr 在跨月、跨年与补零处正确', () => {
    assert.equal(localDateStr(new Date(2026, 0, 1, 0, 0, 0)), '2026-01-01');
    assert.equal(localDateStr(new Date(2025, 11, 31, 23, 30, 0)), '2025-12-31');
    assert.equal(localDateStr(new Date(2026, 8, 9, 12, 0, 0)), '2026-09-09');
  });

  it('localDateStr 与本地日期分量逐点一致（与进程时区无关）', () => {
    for (const [year, month, day, hour] of [
      [2026, 8, 15, 0],
      [2026, 8, 15, 7],
      [2026, 8, 15, 8],
      [2026, 8, 15, 23],
      [2026, 0, 1, 0],
      [2025, 11, 31, 23],
      [2024, 1, 29, 12]
    ]) {
      const date = new Date(year, month, day, hour, 30, 0);
      assert.equal(localDateStr(date), localDayOf(date), `${year}-${month}-${day} ${hour}:30 口径不一致`);
    }
  });

  it('today 按本地时区取日（UTC 与本地日不同时才可判别）', () => {
    assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
    // 允许跨午夜：进程可能在 60 秒前的一瞬启动，取一分钟前的本地日一并接受。
    const now = new Date();
    const candidates = [localDayOf(new Date(now.getTime() - 60_000)), localDayOf(now)];
    assert.ok(
      candidates.includes(today),
      `today=${today} 不是本地日（应为 ${candidates.join(' 或 ')}）——多半是有人把 today 改回了 toISOString()`
    );
  });
});