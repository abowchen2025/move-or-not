import './style.css';
import { latestFallbackSeasonId } from './season/fallback-seasons';
import { getStory } from './stories';

// 階段 1 骨架：只顯示劇本中的標題與讀取中文案。季別解析與資料載入在階段 3 實作。
const app = document.querySelector<HTMLDivElement>('#app');
const story = getStory(latestFallbackSeasonId());

if (app && story) {
  document.title = story.meta.documentTitle;

  const title = document.createElement('h1');
  title.className = 'title';
  title.textContent = story.title;

  const loading = document.createElement('p');
  loading.className = 'loading';
  loading.textContent = story.loading;

  const disclaimer = document.createElement('footer');
  disclaimer.className = 'footer';
  disclaimer.textContent = story.disclaimer;

  app.replaceChildren(title, loading, disclaimer);
}
