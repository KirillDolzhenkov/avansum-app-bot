import type { CustomerRequest, Product } from '../schemas/request.schema.js';
import type { Reply } from '../services/request.service.js';

export interface FormattedReply {
  text: string;
  withConfirmButtons: boolean;
}

const NOT_SPECIFIED = 'не указано';

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatSize(product: Product): string {
  if (product.width === null && product.height === null) return 'не указаны';
  return `${product.width ?? '?'}х${product.height ?? '?'}мм`;
}

function formatProduct(product: Product): string[] {
  const quantity = product.quantity === null ? 'кол-во не указано' : `${product.quantity}шт`;
  return [
    `Тип изделия: ${product.type ? capitalize(product.type) : NOT_SPECIFIED};`,
    `Размеры, ШхВ: ${formatSize(product)} – ${quantity};`,
  ];
}

export function formatRequest(request: CustomerRequest): string {
  const lines: string[] = [];
  const { products, customer } = request;

  if (products.length === 1 && products[0]) {
    lines.push(...formatProduct(products[0]));
  } else {
    products.forEach((product, index) => {
      const [first, ...rest] = formatProduct(product);
      lines.push(`${index + 1}. ${first}`, ...rest.map((line) => `   ${line}`));
    });
  }

  lines.push(
    '',
    `ФИО покупателя: ${customer.name ?? NOT_SPECIFIED};`,
    `Тел.: ${customer.phone ?? NOT_SPECIFIED};`,
    `Email: ${customer.email ?? NOT_SPECIFIED}`,
  );
  return lines.join('\n');
}

function withNotes(notes: string[], body: string[]): string {
  const noteLines = notes.length > 0 ? [...notes.map((note) => `• ${note}`), ''] : [];
  return [...noteLines, ...body].join('\n');
}

export function formatReply(reply: Reply): FormattedReply {
  const plain = (text: string): FormattedReply => ({ text, withConfirmButtons: false });

  switch (reply.kind) {
    case 'not_request':
      return plain(
        [
          reply.hadQuestion
            ? 'Это вопрос, а не заявка — стоимость и детали рассчитает менеджер.'
            : 'Это сообщение не похоже на заявку.',
          'Чтобы оформить заявку, напишите тип изделия (окно, дверь, стеклопакет…), размеры, количество и ваши контакты.',
          'Например: «Окно 1000×1200, 2 шт».',
        ].join('\n'),
      );
    case 'clarify': {
      const body = reply.request.products.length > 0 || hasContacts(reply.request)
        ? ['Пока в заявке:', formatRequest(reply.request), '', reply.question]
        : [reply.question];
      return plain(withNotes(reply.notes, body));
    }
    case 'confirm':
      return {
        text: withNotes(reply.notes, [
          'Заявка разобрана:',
          '',
          formatRequest(reply.request),
          '',
          'Всё верно? Если нужно что-то исправить — просто напишите.',
        ]),
        withConfirmButtons: true,
      };
    case 'confirmed':
      return plain('Заявка принята. Менеджер свяжется с вами в ближайшее время.');
    case 'nothing_to_confirm':
      return plain('Нет заявки для подтверждения. Опишите, пожалуйста, что вам нужно.');
    case 'cancelled':
      return plain(reply.hadDraft ? 'Заявка отменена.' : 'Активной заявки нет.');
    case 'invalid_input':
      return plain(
        reply.reason === 'empty'
          ? 'Сообщение пустое. Опишите, пожалуйста, заявку.'
          : 'Сообщение слишком длинное. Опишите заявку короче.',
      );
    case 'error':
      return plain(
        reply.reason === 'rate_limit'
          ? 'Сервис сейчас перегружен, попробуйте, пожалуйста, через пару минут.'
          : 'Не удалось обработать сообщение. Попробуйте, пожалуйста, ещё раз через минуту.',
      );
  }
}

function hasContacts(request: CustomerRequest): boolean {
  const { name, phone, email } = request.customer;
  return Boolean(name || phone || email);
}
