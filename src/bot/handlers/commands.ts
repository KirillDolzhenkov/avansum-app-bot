import type { Bot } from 'grammy';
import type { RequestService } from '../../services/request.service.js';
import { formatReply } from '../request.formatter.js';

const START_TEXT = [
  'Здравствуйте! Я помогу оформить заявку на окна, двери и стеклопакеты.',
  '',
  'Напишите в свободной форме, что нужно: тип изделия, размеры, количество и ваши контакты.',
  'Например: «Нужно окно 1000х1200, 2 шт. Павел, +375 29 000-00-21».',
  '',
  'Если чего-то не хватит — я уточню. /cancel — отменить текущую заявку.',
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
