import type { Bot } from 'grammy';
import type { RequestService } from '../../services/request.service.js';
import { formatReply } from '../request.formatter.js';

const START_TEXT = [
  'Здравствуйте! Я помогу оформить заявку на окна, двери и стеклопакеты.',
  '',
  'Напишите в одном сообщении:',
  '• что нужно (окно, дверь, стеклопакет…)',
  '• размеры',
  '• количество',
  '• телефон или email',
  '',
  'Например: «Два окна 1000×1200 мм и балконная дверь 70×210 см».',
  '',
  'Если чего-то не хватит — уточню.',
  '/cancel — отменить текущую заявку.',
].join('\n');

export function registerCommands(bot: Bot, requestService: RequestService): void {
  bot.command('start', async (ctx) => {
    requestService.cancel(ctx.chat.id);
    await ctx.reply(START_TEXT);
  });

  bot.command('cancel', async (ctx) => {
    const { text } = formatReply(requestService.cancel(ctx.chat.id));
    await ctx.reply(text);
  });
}
