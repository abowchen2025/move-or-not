import './style.css';
import { createApp } from './app';
import { createApiClient } from './api/client';
import { audioContextFactory, SoundBoard } from './audio/sound';
import { createPassphraseStore } from './auth/session';
import { appConfig } from './config';
import { fallbackSeasons, latestFallbackSeasonId } from './season/fallback-seasons';
import { requestedSeason, urlWithoutSeasonParam } from './season/resolve';
import { getStory } from './stories';
import { SyncController } from './sync/controller';
import { mountStage } from './stage/stage';
import { ServerClock } from './time/server-clock';
import { isDesktop, watchLayout } from './view/layout';
import { prefersReducedMotion, watchReducedMotion } from './view/motion';
import { createView } from './view/render';

const root = document.querySelector<HTMLElement>('#app');
// 缺少劇本的季別（D-22-k）用打包清單中最新一季的劇本顯示錯誤畫面
const defaultStory = getStory(latestFallbackSeasonId());

if (root && defaultStory) {
  watchLayout(window, document.documentElement);

  const api = createApiClient(import.meta.env.VITE_API_BASE ?? '');
  const clock = new ServerClock();
  const reducedMotion = () => prefersReducedMotion(window);
  const app = createApp({
    window,
    api,
    store: createPassphraseStore(() => window.sessionStorage),
    clock,
    config: appConfig,
    storyFor: (seasonId) => getStory(seasonId) ?? defaultStory,
    sound: new SoundBoard(audioContextFactory(window)),
    reducedMotion,
  });
  const view = createView(root, app.handlers, { reducedMotion });
  const season = requestedSeason(location.search);
  // 主角在讀取資料的同時就出現；季別以網址指定的為準（沒有劇本時用最新一季）
  const stage = mountStage({
    elements: view.stageElements,
    story: (season && getStory(season)) || defaultStory,
    env: {
      window,
      isDesktop: () => isDesktop(window),
      reducedMotion,
      onReducedMotionChange: (cb) => watchReducedMotion(window, cb),
    },
    baseUrl: import.meta.env.BASE_URL,
  });
  const controller = new SyncController({
    api,
    clock,
    localNow: () => Date.now(),
    fallbackSeasons,
    requestedSeason: season,
    hasStory: (seasonId) => getStory(seasonId) !== undefined,
    dropSeasonParam: () =>
      history.replaceState(history.state, '', urlWithoutSeasonParam(location.href)),
    config: appConfig,
    document,
    onChange: (snapshot) => app.update(snapshot),
  });
  app.attach(view, controller, stage);
  controller.start();
}
