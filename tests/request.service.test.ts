import { describe, expect, it } from 'vitest';
import { RequestService, type Reply } from '../src/services/request.service.js';
import { ConversationService } from '../src/services/conversation.service.js';
import { AiError } from '../src/ai/ai.provider.js';
import { formatReply } from '../src/bot/request.formatter.js';
import type { LlmExtraction } from '../src/schemas/llm.schema.js';
import { FakeExtractor, dim, extraction, product } from './helpers.js';

const CHAT = 1;

function setup(answers: Record<string, LlmExtraction | Error>) {
  const extractor = new FakeExtractor(answers);
  const conversations = new ConversationService();
  return { service: new RequestService(extractor, conversations), extractor, conversations };
}

function expectKind<K extends Reply['kind']>(reply: Reply, kind: K): Extract<Reply, { kind: K }> {
  expect(reply.kind).toBe(kind);
  return reply as Extract<Reply, { kind: K }>;
}

describe('RequestService — scenarios from the assignment', () => {
  it('1. full request with one product (example 1)', async () => {
    const msg = 'Здравствуйте! Нужно окно 1000х1200, 2 шт. Павел, +375 29 000-00-21';
    const { service } = setup({
      [msg]: extraction({
        products: [product({ type: 'окно', width: dim(1000), height: dim(1200), quantity: 2, quantityRaw: '2 шт' })],
        customer: { name: 'Павел', phoneRaw: '+375 29 000-00-21' },
      }),
    });

    const reply = expectKind(await service.handleMessage(CHAT, msg), 'confirm');
    expect(reply.request).toEqual({
      isRequest: true,
      products: [{ type: 'окно', width: 1000, height: 1200, quantity: 2 }],
      customer: { name: 'Павел', phone: '+375 (29) 000-00-21', email: null },
      missingFields: [],
    });
    const text = formatReply(reply).text;
    expect(text).toContain('Тип изделия: Окно;');
    expect(text).toContain('Размеры, ШхВ: 1000х1200мм – 2шт;');
    expect(text).toContain('ФИО покупателя: Павел;');
    expect(text).toContain('Тел.: +375 (29) 000-00-21;');
  });

  it('2. several products are kept separate', async () => {
    const msg = '2 окна 1000х1200 и дверь 700х2100 одна, тел +375291234567';
    const { service } = setup({
      [msg]: extraction({
        products: [
          product({ type: 'окно', width: dim(1000), height: dim(1200), quantity: 2 }),
          product({ type: 'дверь', width: dim(700), height: dim(2100), quantity: 1 }),
        ],
        customer: { phoneRaw: '+375291234567' },
      }),
    });

    const reply = expectKind(await service.handleMessage(CHAT, msg), 'confirm');
    expect(reply.request.products).toEqual([
      { type: 'окно', width: 1000, height: 1200, quantity: 2 },
      { type: 'дверь', width: 700, height: 2100, quantity: 1 },
    ]);
  });

  it('3. centimetres are converted to millimetres (example 2)', async () => {
    const msg = 'дверь балконная 70 на 210 см одна, тел 80290000022 анна';
    const { service } = setup({
      [msg]: extraction({
        products: [product({ type: 'дверь балконная', width: dim(70, 'cm'), height: dim(210, 'cm'), quantity: 1, quantityRaw: 'одна' })],
        customer: { name: 'анна', phoneRaw: '80290000022' },
      }),
    });

    const reply = expectKind(await service.handleMessage(CHAT, msg), 'confirm');
    expect(reply.request.products).toEqual([{ type: 'дверь балконная', width: 700, height: 2100, quantity: 1 }]);
    expect(reply.request.customer).toEqual({ name: 'Анна', phone: '+375 (29) 000-00-22', email: null });
  });

  it('4. millimetres stay as is', async () => {
    const msg = 'Стеклопакет 1450 х 980 мм, 3 шт, ivan@mail.by';
    const { service } = setup({
      [msg]: extraction({
        products: [product({ type: 'стеклопакет', width: dim(1450, 'mm'), height: dim(980, 'mm'), quantity: 3 })],
        customer: { email: 'ivan@mail.by' },
      }),
    });

    const reply = expectKind(await service.handleMessage(CHAT, msg), 'confirm');
    expect(reply.request.products[0]).toMatchObject({ width: 1450, height: 980, quantity: 3 });
    expect(reply.request.customer.email).toBe('ivan@mail.by');
  });

  it('5. colloquial sizes ("метр на полтора")', async () => {
    const msg = 'Окно метр на полтора, одно. +375 44 765-43-21';
    const { service } = setup({
      [msg]: extraction({
        products: [product({ type: 'окно', width: dim(1, 'm'), height: dim(1.5, 'm'), quantity: 1 })],
        customer: { phoneRaw: '+375 44 765-43-21' },
      }),
    });

    const reply = expectKind(await service.handleMessage(CHAT, msg), 'confirm');
    expect(reply.request.products[0]).toMatchObject({ width: 1000, height: 1500, quantity: 1 });
  });

  it('6 + 11. missing quantity is asked and the answer completes the same request', async () => {
    const first = 'Нужно окно 1000 на 1200, Павел +375291234567';
    const second = 'Два';
    const { service, extractor } = setup({
      [first]: extraction({
        products: [product({ type: 'окно', width: dim(1000), height: dim(1200) })],
        customer: { name: 'Павел', phoneRaw: '+375291234567' },
      }),
      [second]: extraction({ intent: 'answer', products: [product({ targetIndex: 0, quantity: 2, quantityRaw: 'Два' })] }),
    });

    const clarify = expectKind(await service.handleMessage(CHAT, first), 'clarify');
    expect(clarify.question).toBe('Сколько штук нужно (окно)?');
    expect(clarify.request.missingFields).toEqual(['products.0.quantity']);

    const reply = expectKind(await service.handleMessage(CHAT, second), 'confirm');
    expect(reply.request.products).toEqual([{ type: 'окно', width: 1000, height: 1200, quantity: 2 }]);
    expect(reply.request.customer.name).toBe('Павел');
    expect(extractor.calls[1]?.context.pendingQuestion).toBe('Сколько штук нужно (окно)?');
  });

  it('6b. a short answer without targetIndex goes to the product the bot asked about', async () => {
    const first = 'окно 1000х1200 и дверь 700х2100 одна, +375291234567';
    const { service } = setup({
      [first]: extraction({
        products: [
          product({ type: 'окно', width: dim(1000), height: dim(1200) }),
          product({ type: 'дверь', width: dim(700), height: dim(2100), quantity: 1 }),
        ],
        customer: { phoneRaw: '+375291234567' },
      }),
      '3 штуки': extraction({ intent: 'answer', products: [product({ quantity: 3 })] }),
    });

    await service.handleMessage(CHAT, first);
    const reply = expectKind(await service.handleMessage(CHAT, '3 штуки'), 'confirm');
    expect(reply.request.products.map((p) => p.quantity)).toEqual([3, 1]);
  });

  it('7. missing sizes are asked', async () => {
    const msg = 'Нужна балконная дверь, одна штука';
    const { service } = setup({
      [msg]: extraction({ products: [product({ type: 'дверь балконная', quantity: 1 })] }),
    });

    const reply = expectKind(await service.handleMessage(CHAT, msg), 'clarify');
    expect(reply.question).toBe('Укажите ширину и высоту (дверь балконная). Можно в сантиметрах или миллиметрах.');
    expect(reply.request.missingFields).toEqual(['products.0.width', 'products.0.height', 'customer.contact']);
  });

  it('8. missing contacts are asked', async () => {
    const msg = 'Окно 600х800, 1 шт';
    const { service } = setup({
      [msg]: extraction({ products: [product({ type: 'окно', width: dim(600), height: dim(800), quantity: 1 })] }),
    });

    const reply = expectKind(await service.handleMessage(CHAT, msg), 'clarify');
    expect(reply.question).toBe('Как к вам обращаться? Оставьте, пожалуйста, телефон или email для связи.');
  });

  it('9. price question is not a request (example 3)', async () => {
    const msg = 'Сколько стоит остеклить балкон?';
    const { service, conversations } = setup({
      [msg]: extraction({ intent: 'question', customerQuestion: msg }),
    });

    expect(await service.handleMessage(CHAT, msg)).toEqual({ kind: 'not_request', hadQuestion: true });
    expect(conversations.get(CHAT)).toBeNull();
  });

  it('10. unrelated message is not a request', async () => {
    const msg = 'Привет, как дела?';
    const { service } = setup({ [msg]: extraction({ intent: 'other' }) });
    expect(await service.handleMessage(CHAT, msg)).toEqual({ kind: 'not_request', hadQuestion: false });
  });

  it('12. invalid phone is reported and not turned into a valid one', async () => {
    const msg = 'Окно 1000х1200 2 шт, Олег +375 29 123';
    const { service } = setup({
      [msg]: extraction({
        products: [product({ type: 'окно', width: dim(1000), height: dim(1200), quantity: 2 })],
        customer: { name: 'Олег', phoneRaw: '+375 29 123' },
      }),
    });

    const reply = expectKind(await service.handleMessage(CHAT, msg), 'clarify');
    expect(reply.request.customer.phone).toBeNull();
    expect(reply.notes).toContain('Телефон «+375 29 123» выглядит некорректным. Проверьте, пожалуйста, номер.');
    expect(reply.question).toBe('Оставьте, пожалуйста, телефон или email для связи.');
  });

  it('13. ambiguous sizes are not guessed', async () => {
    const msg = 'Окно 150х2000, 1 шт, +375291234567';
    const { service } = setup({
      [msg]: extraction({
        products: [product({ type: 'окно', width: dim(150), height: dim(2000), quantity: 1 })],
        customer: { phoneRaw: '+375291234567' },
      }),
    });

    const reply = expectKind(await service.handleMessage(CHAT, msg), 'clarify');
    expect(reply.request.products[0]).toMatchObject({ width: null, height: null });
    expect(reply.notes[0]).toContain('несогласованно');
  });
});

describe('RequestService — no invented data', () => {
  it('drops a quantity the model made up', async () => {
    const msg = 'Окно 1000х1200, +375291234567';
    const { service } = setup({
      [msg]: extraction({
        products: [product({ type: 'окно', width: dim(1000), height: dim(1200), quantity: 1 })],
        customer: { phoneRaw: '+375291234567' },
      }),
    });

    const reply = expectKind(await service.handleMessage(CHAT, msg), 'clarify');
    expect(reply.request.products[0]?.quantity).toBeNull();
    expect(reply.request.missingFields).toEqual(['products.0.quantity']);
  });

  it('drops converted sizes, a phone and a name that are not in the message', async () => {
    const msg = 'дверь 70 на 210 см, одна';
    const { service } = setup({
      [msg]: extraction({
        products: [product({ type: 'дверь', width: dim(700, 'mm'), height: dim(2100, 'mm'), quantity: 1 })],
        customer: { name: 'Иван', phoneRaw: '+375291112233' },
      }),
    });

    const reply = expectKind(await service.handleMessage(CHAT, msg), 'clarify');
    expect(reply.request.products[0]).toMatchObject({ width: null, height: null });
    expect(reply.request.customer).toEqual({ name: null, phone: null, email: null });
  });

  it('drops a product type that is not in the message', async () => {
    const msg = 'нужно 1000х1200 2 шт, +375291234567';
    const { service } = setup({
      [msg]: extraction({
        products: [product({ type: 'окно', width: dim(1000), height: dim(1200), quantity: 2 })],
        customer: { phoneRaw: '+375291234567' },
      }),
    });

    const reply = expectKind(await service.handleMessage(CHAT, msg), 'clarify');
    expect(reply.request.products[0]?.type).toBeNull();
    expect(reply.question).toContain('Уточните тип');
  });
});

describe('RequestService — dialog flow and errors', () => {
  const full = 'Окно 1000х1200 2 шт, +375291234567';
  const fullAnswer = extraction({
    products: [product({ type: 'окно', width: dim(1000), height: dim(1200), quantity: 2 })],
    customer: { phoneRaw: '+375291234567' },
  });

  it('confirms a complete request and clears the session', async () => {
    const { service, conversations } = setup({ [full]: fullAnswer });
    await service.handleMessage(CHAT, full);
    expect(conversations.get(CHAT)?.state).toBe('awaiting_confirmation');

    expect(service.confirm(CHAT).kind).toBe('confirmed');
    expect(conversations.get(CHAT)).toBeNull();
    expect(service.confirm(CHAT).kind).toBe('nothing_to_confirm');
  });

  it('accepts a correction while waiting for confirmation', async () => {
    const correction = 'ширина 900';
    const { service } = setup({
      [full]: fullAnswer,
      [correction]: extraction({ intent: 'answer', products: [product({ targetIndex: 0, width: dim(900) })] }),
    });
    await service.handleMessage(CHAT, full);
    const reply = expectKind(await service.handleMessage(CHAT, correction), 'confirm');
    expect(reply.request.products[0]?.width).toBe(900);
  });

  it('"да" confirms, "отмена" cancels', async () => {
    const { service, conversations } = setup({
      [full]: fullAnswer,
      да: extraction({ intent: 'confirm' }),
      отмена: extraction({ intent: 'cancel' }),
    });
    await service.handleMessage(CHAT, full);
    expect((await service.handleMessage(CHAT, 'да')).kind).toBe('confirmed');

    await service.handleMessage(CHAT, full);
    expect(await service.handleMessage(CHAT, 'отмена')).toEqual({ kind: 'cancelled', hadDraft: true });
    expect(conversations.get(CHAT)).toBeNull();
  });

  it('off-topic message during a dialog keeps the draft and repeats the question', async () => {
    const first = 'Окно 1000х1200 2 шт';
    const { service } = setup({
      [first]: extraction({ products: [product({ type: 'окно', width: dim(1000), height: dim(1200), quantity: 2 })] }),
      'а вы где находитесь?': extraction({ intent: 'other' }),
    });
    await service.handleMessage(CHAT, first);

    const reply = expectKind(await service.handleMessage(CHAT, 'а вы где находитесь?'), 'clarify');
    expect(reply.notes).toContain('Не нашёл в сообщении данных для заявки.');
    expect(reply.request.products).toHaveLength(1);
    expect(reply.question).toContain('телефон или email');
  });

  it('a new full request during a dialog replaces the draft and says so', async () => {
    const first = 'Окно 1000х1200';
    const second = 'Дверь 700х2100 1 шт, +375291234567';
    const { service } = setup({
      [first]: extraction({ products: [product({ type: 'окно', width: dim(1000), height: dim(1200) })] }),
      [second]: extraction({
        products: [product({ type: 'дверь', width: dim(700), height: dim(2100), quantity: 1 })],
        customer: { phoneRaw: '+375291234567' },
      }),
    });
    await service.handleMessage(CHAT, first);
    const reply = expectKind(await service.handleMessage(CHAT, second), 'confirm');
    expect(reply.request.products).toEqual([{ type: 'дверь', width: 700, height: 2100, quantity: 1 }]);
    expect(reply.notes[0]).toContain('новую заявку');
  });

  it('empty and too long messages do not reach the AI', async () => {
    const { service, extractor } = setup({});
    expect(await service.handleMessage(CHAT, '   ')).toEqual({ kind: 'invalid_input', reason: 'empty' });
    expect(await service.handleMessage(CHAT, 'a'.repeat(2001))).toEqual({ kind: 'invalid_input', reason: 'too_long' });
    expect(extractor.calls).toHaveLength(0);
  });

  it('AI failure becomes a friendly error without technical details', async () => {
    const msg = 'Окно 1000х1200';
    const { service } = setup({ [msg]: new AiError('timeout', 'Gemini request timed out', true) });
    const reply = await service.handleMessage(CHAT, msg);
    expect(reply).toEqual({ kind: 'error', reason: 'unavailable' });
    expect(formatReply(reply).text).not.toMatch(/gemini|timeout|api/i);
  });

  it('exhausted quota gets its own message', async () => {
    const msg = 'Окно 1000х1200';
    const { service } = setup({ [msg]: new AiError('rate_limit', 'quota exceeded', false) });
    const reply = await service.handleMessage(CHAT, msg);
    expect(reply).toEqual({ kind: 'error', reason: 'rate_limit' });
    expect(formatReply(reply).text).toContain('перегружен');
  });
});
