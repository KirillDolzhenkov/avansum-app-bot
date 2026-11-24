/**
 * Runs realistic dialogs through the configured real model (AI_PROVIDER, see .env.example)
 * and the full pipeline (grounding, normalization, merge) and prints a pass/fail report.
 * Unlike unit tests, this checks the prompt itself. Uses the same API quota as the bot.
 *
 *   npm run eval
 */
import { loadAiConfig } from '../src/config/env.js';
import { createProvider } from '../src/ai/create-provider.js';
import { AiService } from '../src/ai/ai.service.js';
import { ConversationService } from '../src/services/conversation.service.js';
import { RequestService, type Reply } from '../src/services/request.service.js';
import { formatReply } from '../src/bot/request.formatter.js';
import type { CustomerRequest } from '../src/schemas/request.schema.js';

interface Case {
  name: string;
  messages: string[];
  check: (reply: Reply) => string | null;
}

function requestOf(reply: Reply): CustomerRequest | null {
  return 'request' in reply ? reply.request : null;
}

const expectKind = (kind: Reply['kind']) => (reply: Reply) =>
  reply.kind === kind ? null : `expected ${kind}, got ${reply.kind}`;

function expectProducts(kind: Reply['kind'], products: CustomerRequest['products']) {
  return (reply: Reply) => {
    if (reply.kind !== kind) return `expected ${kind}, got ${reply.kind}`;
    const actual = JSON.stringify(requestOf(reply)?.products.map(({ width, height, quantity }) => ({ width, height, quantity })));
    const expected = JSON.stringify(products.map(({ width, height, quantity }) => ({ width, height, quantity })));
    return actual === expected ? null : `products ${actual} != ${expected}`;
  };
}

const p = (width: number | null, height: number | null, quantity: number | null) => ({ type: null, width, height, quantity });

const cases: Case[] = [
  {
    name: '1. Полная заявка (пример 1)',
    messages: ['Здравствуйте! Нужно окно 1000х1200, 2 шт. Павел, +375 29 000-00-21'],
    check: (reply) =>
      expectProducts('confirm', [p(1000, 1200, 2)])(reply) ??
      (requestOf(reply)?.customer.phone === '+375 (29) 000-00-21' ? null : 'wrong phone'),
  },
  {
    name: '2. Несколько изделий',
    messages: ['Нужно 2 окна 1200 на 1400 и балконная дверь 700х2100 одна. Ольга 375447654321'],
    check: expectProducts('confirm', [p(1200, 1400, 2), p(700, 2100, 1)]),
  },
  {
    name: '3. Сантиметры (пример 2)',
    messages: ['дверь балконная 70 на 210 см одна, тел 80290000022 анна'],
    check: (reply) =>
      expectProducts('confirm', [p(700, 2100, 1)])(reply) ??
      (requestOf(reply)?.customer.name === 'Анна' ? null : 'wrong name'),
  },
  {
    name: '4. Миллиметры',
    messages: ['Стеклопакет 1450х980 мм, 3 шт. ivan@mail.by'],
    check: expectProducts('confirm', [p(1450, 980, 3)]),
  },
  {
    name: '5. Разговорная форма',
    messages: ['Окно метр на полтора, одно. +375 44 765-43-21'],
    check: expectProducts('confirm', [p(1000, 1500, 1)]),
  },
  {
    name: '6. Нет количества',
    messages: ['Нужно окно 1000 на 1200, Павел +375291234567'],
    check: (reply) => expectKind('clarify')(reply) ?? (requestOf(reply)?.products[0]?.quantity === null ? null : 'invented quantity'),
  },
  {
    name: '7. Нет размеров',
    messages: ['Нужна балконная дверь, одна штука, +375291234567'],
    check: expectProducts('clarify', [p(null, null, 1)]),
  },
  {
    name: '8. Нет контактов',
    messages: ['Окно 600х800, 1 шт'],
    check: (reply) =>
      expectKind('clarify')(reply) ??
      (requestOf(reply)?.missingFields.includes('customer.contact') ? null : 'contact not reported as missing'),
  },
  {
    name: '9. Вопрос о стоимости (пример 3)',
    messages: ['Сколько стоит остеклить балкон?'],
    check: expectKind('not_request'),
  },
  {
    name: '10. Не заявка',
    messages: ['Привет! Как у вас дела?'],
    check: expectKind('not_request'),
  },
  {
    name: '11. Дополнение несколькими сообщениями',
    messages: ['Нужно окно 1000 на 1200', 'Два', 'Павел, +375 29 000-00-21'],
    check: expectProducts('confirm', [p(1000, 1200, 2)]),
  },
  {
    name: '12. Некорректный телефон',
    messages: ['Окно 1000х1200 2 шт, Олег +375 29 123'],
    check: (reply) => expectKind('clarify')(reply) ?? (requestOf(reply)?.customer.phone === null ? null : 'invalid phone accepted'),
  },
  {
    name: '13. Неоднозначные размеры',
    messages: ['Окно 150 на 2000, одно, +375291234567'],
    check: expectProducts('clarify', [p(null, null, 1)]),
  },
];

async function main(): Promise<void> {
  const config = loadAiConfig();
  const ai = new AiService(createProvider(config));

  let passed = 0;
  for (const [index, testCase] of cases.entries()) {
    const service = new RequestService(ai, new ConversationService());
    let reply: Reply = { kind: 'error', reason: 'unavailable' };
    for (const message of testCase.messages) {
      reply = await service.handleMessage(index, message);
    }
    const problem = testCase.check(reply);
    if (problem === null) passed++;
    console.log(`${problem === null ? 'PASS' : 'FAIL'}  ${testCase.name}${problem ? ` — ${problem}` : ''}`);
    if (problem !== null || process.argv.includes('--verbose')) {
      console.log(formatReply(reply).text.replace(/^/gm, '      '));
    }
  }
  console.log(`\n${passed}/${cases.length} passed (provider: ${config.provider}, model: ${config.model})`);
  process.exitCode = passed === cases.length ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
