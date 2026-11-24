import { InlineKeyboard, type Bot, type Context } from 'grammy';
import type { RequestService } from '../../services/request.service.js';
import { formatReply, type FormattedReply } from '../request.formatter.js';

const CONFIRM = 'request:confirm';
const CANCEL = 'request:cancel';

const confirmKeyboard = new InlineKeyboard().text('Подтвердить', CONFIRM).text('Отменить', CANCEL);

async function send(ctx: Context, reply: FormattedReply): Promise<void> {
  await ctx.reply(reply.text, reply.withConfirmButtons ? { reply_markup: confirmKeyboard } : undefined);
}

export function registerMessageHandlers(bot: Bot, requestService: RequestService): void {
  bot.on('message:text', async (ctx) => {
    await ctx.replyWithChatAction('typing');
    const reply = await requestService.handleMessage(ctx.chat.id, ctx.message.text);
    await send(ctx, formatReply(reply));
  });

  bot.on('message', async (ctx) => {
    await ctx.reply('Я понимаю только текст. Опишите, пожалуйста, заявку сообщением.');
  });

  bot.callbackQuery(CONFIRM, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup();
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    await send(ctx, formatReply(requestService.confirm(chatId)));
  });

  bot.callbackQuery(CANCEL, async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageReplyMarkup();
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    await send(ctx, formatReply(requestService.cancel(chatId)));
  });
}
