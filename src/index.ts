import { GrammyError } from 'grammy';
import { loadEnv } from './config/env.js';
import { createBot } from './bot/bot.js';
import { createProvider } from './ai/create-provider.js';
import { AiService } from './ai/ai.service.js';
import { ConversationService } from './services/conversation.service.js';
import { RequestService } from './services/request.service.js';
import { logger } from './logger.js';

const POLLING_CONFLICT_RETRIES = 5;
const POLLING_CONFLICT_DELAY_MS = 5_000;

async function main(): Promise<void> {
  const env = loadEnv();

  const provider = createProvider(env.ai);
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

  logger.info(`Starting bot (provider: ${env.ai.provider}, model: ${env.ai.model})`);
  await startPolling(bot);
}

async function startPolling(bot: ReturnType<typeof createBot>): Promise<void> {
  for (let attempt = 1; attempt <= POLLING_CONFLICT_RETRIES; attempt++) {
    try {
      await bot.start({
        // Keep messages that arrived during a redeploy, so reviewers do not get silence after a restart.
        drop_pending_updates: false,
        onStart: (info) => logger.info(`Bot @${info.username} is running`),
      });
      return;
    } catch (error) {
      const conflict = error instanceof GrammyError && error.error_code === 409;
      if (!conflict || attempt === POLLING_CONFLICT_RETRIES) throw error;
      logger.warn(
        `Another bot instance is still polling (409). Retrying in ${POLLING_CONFLICT_DELAY_MS / 1000}s (${attempt}/${POLLING_CONFLICT_RETRIES})`,
      );
      await new Promise((resolve) => setTimeout(resolve, POLLING_CONFLICT_DELAY_MS));
    }
  }
}

main().catch((error: unknown) => {
  logger.error('Fatal error during startup', error);
  process.exit(1);
});
