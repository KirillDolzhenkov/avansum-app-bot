import { Bot, GrammyError, HttpError } from 'grammy';
import type { RequestService } from '../services/request.service.js';
import { registerCommands } from './handlers/commands.js';
import { registerMessageHandlers } from './handlers/message.handler.js';
import { logger } from '../logger.js';

export function createBot(token: string, requestService: RequestService): Bot {
  const bot = new Bot(token);

  registerCommands(bot, requestService);
  registerMessageHandlers(bot, requestService);

  bot.catch(async ({ error, ctx }) => {
    if (error instanceof GrammyError) {
      logger.error(`Telegram API error for update ${ctx.update.update_id}: ${error.description}`);
    } else if (error instanceof HttpError) {
      logger.error(`Network error for update ${ctx.update.update_id}`, error.error);
    } else {
      logger.error(`Unhandled error for update ${ctx.update.update_id}`, error);
    }
    try {
      await ctx.reply('Что-то пошло не так. Попробуйте, пожалуйста, ещё раз.');
    } catch {
      // Telegram itself is unreachable; nothing more to do.
    }
  });

  return bot;
}
