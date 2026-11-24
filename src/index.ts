import { loadEnv } from './config/env.js';
import { createBot } from './bot/bot.js';
import { GeminiProvider } from './ai/gemini.provider.js';
import { AiService } from './ai/ai.service.js';
import { ConversationService } from './services/conversation.service.js';
import { RequestService } from './services/request.service.js';
import { logger } from './logger.js';

async function main(): Promise<void> {
  const env = loadEnv();

  const provider = new GeminiProvider(env.GEMINI_API_KEY, env.GEMINI_MODEL);
  const requestService = new RequestService(new AiService(provider), new ConversationService());
  const bot = createBot(env.BOT_TOKEN, requestService);

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, stopping bot`);
    await bot.stop();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await bot.api.setMyCommands([
    { command: 'start', description: 'Как оформить заявку' },
    { command: 'cancel', description: 'Отменить текущую заявку' },
  ]);

  logger.info(`Starting bot (model: ${env.GEMINI_MODEL})`);
  await bot.start({
    drop_pending_updates: true,
    onStart: (info) => logger.info(`Bot @${info.username} is running`),
  });
}

main().catch((error: unknown) => {
  logger.error('Fatal error during startup', error);
  process.exit(1);
});
