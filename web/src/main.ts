import './style.css';
import { createApp } from './app';
import { createApiClient } from './api/client';
import { createPassphraseStore } from './auth/session';
import { appConfig } from './config';
import { fallbackSeasons, latestFallbackSeasonId } from './season/fallback-seasons';
import { requestedSeason, urlWithoutSeasonParam } from './season/resolve';
import { getStory } from './stories';
import { SyncController } from './sync/controller';
import { ServerClock } from './time/server-clock';
import { watchLayout } from './view/layout';
import { createView } from './view/render';

const root = document.querySelector<HTMLElement>('#app');
// 缺少劇本的季別（D-22-k）用打包清單中最新一季的劇本顯示錯誤畫面
const defaultStory = getStory(latestFallbackSeasonId());

if (root && defaultStory) {
  watchLayout(window, document.documentElement);

  const api = createApiClient(import.meta.env.VITE_API_BASE ?? '');
  const clock = new ServerClock();
  const app = createApp({
    window,
    api,
    store: createPassphraseStore(() => window.sessionStorage),
    clock,
    config: appConfig,
    storyFor: (seasonId) => getStory(seasonId) ?? defaultStory,
  });
  const view = createView(root, app.handlers);
  const controller = new SyncController({
    api,
    clock,
    localNow: () => Date.now(),
    fallbackSeasons,
    requestedSeason: requestedSeason(location.search),
    hasStory: (seasonId) => getStory(seasonId) !== undefined,
    dropSeasonParam: () =>
      history.replaceState(history.state, '', urlWithoutSeasonParam(location.href)),
    config: appConfig,
    document,
    onChange: (snapshot) => app.update(snapshot),
  });
  app.attach(view, controller);
  controller.start();
}
