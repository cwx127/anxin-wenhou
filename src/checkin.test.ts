import { describe, expect, it } from 'vitest';
import { createCheckInReceipt, createNoResponseReceipt } from './checkin';

describe('daily check-in receipt engine', () => {
  it('creates a normal receipt from a positive response and completed medication', () => {
    const receipt = createCheckInReceipt({ mode: 'voice', text: '挺好的，早上的药吃过了。' });

    expect(receipt.level).toBe('normal');
    expect(receipt.headline).toBe('今日已报平安');
    expect(receipt.medicationMention).toBe('taken');
    expect(receipt.evidence.map((item) => item.quote)).toEqual(['挺好的', '药吃过']);
    expect(receipt.followUp).toBeNull();
  });

  it('creates an attention receipt when discomfort and missed medication occur together', () => {
    const receipt = createCheckInReceipt({ mode: 'voice', text: '有点头晕，药还没吃。' });

    expect(receipt.level).toBe('attention');
    expect(receipt.medicationMention).toBe('missed');
    expect(receipt.summary).toContain('身体不适');
    expect(receipt.summary).toContain('用药尚未完成');
    expect(receipt.evidence.map((item) => item.quote)).toEqual(['头晕', '药还没吃']);
    expect(receipt.followUp?.question.match(/？/g)).toHaveLength(1);
  });

  it('routes a fall with inability to stand to the urgent flow', () => {
    const receipt = createCheckInReceipt({ mode: 'voice', text: '我摔了，起不来了。' });

    expect(receipt.level).toBe('urgent');
    expect(receipt.evidence.map((item) => item.quote)).toEqual(['摔了', '起不来了']);
    expect(receipt.suggestedAction).toContain('立即电话联系');
    expect(receipt.followUp).toBeNull();
  });

  it('routes chest pain to the urgent flow', () => {
    const receipt = createCheckInReceipt({ mode: 'voice', text: '我现在胸口疼。' });

    expect(receipt.level).toBe('urgent');
    expect(receipt.evidence[0]).toMatchObject({ source: 'senior', quote: '胸口疼' });
  });

  it('routes breathing difficulty to the urgent flow', () => {
    const receipt = createCheckInReceipt({ mode: 'voice', text: '我喘不上气。' });

    expect(receipt.level).toBe('urgent');
    expect(receipt.evidence[0].quote).toBe('喘不上气');
  });

  it('makes emergency rules override reassuring language', () => {
    const receipt = createCheckInReceipt({ mode: 'voice', text: '我没事，但是刚才摔倒了。' });

    expect(receipt.level).toBe('urgent');
    expect(receipt.headline).toBe('需要立即联系');
  });

  it('does not treat an explicitly negated emergency phrase as urgent', () => {
    const receipt = createCheckInReceipt({ mode: 'voice', text: '我没有摔倒，也没有胸口疼，挺好的。' });

    expect(receipt.level).toBe('normal');
    expect(receipt.evidence.map((item) => item.quote)).toContain('挺好的');
  });

  it('refuses to decide medication adjustments and recommends human review', () => {
    const receipt = createCheckInReceipt({ mode: 'voice', text: '我能不能多吃一片？' });

    expect(receipt.level).toBe('attention');
    expect(receipt.medicationMention).toBe('question');
    expect(receipt.followUp?.question).toContain('不能帮您调整药量');
    expect(receipt.suggestedAction).toContain('不要自行加减');
  });

  it('maps the well quick action to a normal explainable receipt', () => {
    const receipt = createCheckInReceipt({ mode: 'quick', response: 'well' });

    expect(receipt.level).toBe('normal');
    expect(receipt.sourceText).toBe('我今天挺好的');
    expect(receipt.evidence[0].source).toBe('senior');
  });

  it('maps the unwell quick action to one attention follow-up', () => {
    const receipt = createCheckInReceipt({ mode: 'quick', response: 'unwell' });

    expect(receipt.level).toBe('attention');
    expect(receipt.followUp).not.toBeNull();
    expect(receipt.followUp?.question.match(/？/g)).toHaveLength(1);
  });

  it('maps the contact-family quick action to a callback request', () => {
    const receipt = createCheckInReceipt({ mode: 'quick', response: 'contact-family' });

    expect(receipt.level).toBe('attention');
    expect(receipt.headline).toBe('希望家人联系');
    expect(receipt.suggestedAction).toContain('回拨');
  });

  it('uses a non-diagnostic fallback summary for unmatched speech', () => {
    const receipt = createCheckInReceipt({ mode: 'voice', text: '今天看了一会儿电视。' });

    expect(receipt.level).toBe('normal');
    expect(receipt.isFallback).toBe(true);
    expect(receipt.summary).toContain('未提及明确不适');
    expect(receipt.evidence[0].quote).toBe('今天看了一会儿电视。');
    expect(receipt.evidence[0].meaning).toContain('不从未识别内容推断健康结论');
  });

  it('asks one closed follow-up when speech recognition returns no text', () => {
    const receipt = createCheckInReceipt({ mode: 'voice', text: '   ' });

    expect(receipt.level).toBe('attention');
    expect(receipt.isFallback).toBe(true);
    expect(receipt.sourceText).toBeNull();
    expect(receipt.followUp?.question.match(/？/g)).toHaveLength(1);
    expect(receipt.evidence[0].source).toBe('system');
  });

  it('describes no response as unconfirmed rather than dangerous', () => {
    const receipt = createNoResponseReceipt(2);

    expect(receipt.status).toBe('unanswered');
    expect(receipt.level).toBe('attention');
    expect(receipt.headline).toBe('今日尚未确认');
    expect(receipt.summary).toContain('不能据此判断老人遇险');
    expect(receipt.evidence[0]).toMatchObject({
      source: 'system',
      quote: '2 次问候均未收到回应',
    });
  });

  it('sanitizes an invalid no-response attempt count', () => {
    expect(createNoResponseReceipt(0).evidence[0].quote).toBe('1 次问候均未收到回应');
    expect(createNoResponseReceipt(Number.NaN).evidence[0].quote).toBe('2 次问候均未收到回应');
  });

  it('produces deterministic receipts for the same input', () => {
    const input = { mode: 'voice' as const, text: '有点不舒服，想联系家人。' };

    expect(createCheckInReceipt(input)).toEqual(createCheckInReceipt(input));
  });
});
