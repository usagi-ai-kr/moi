import { createApp } from '@/infra/http/app';

const app = createApp();

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
