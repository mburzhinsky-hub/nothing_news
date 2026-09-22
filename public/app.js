const CATEGORIES = ["Все","Технологии","Бизнес","Мир","Наука","Культура","Здоровье","Спорт"];

const DEMO = [
  {
    id:"demo-1",
    title:"ИИ становится частью повседневных продуктов",
    summary:"Компании продолжают встраивать модели искусственного интеллекта в поиск, работу с текстом, изображениями и персональные инструменты.",
    source:"Демо",
    category:"Технологии",
    publishedAt:new Date(Date.now()-12*60_000).toISOString(),
    image:null,
    url:"#"
  },
  {
    id:"demo-2",
    title:"Рынки оценивают новые сигналы от крупнейших экономик",
    summary:"Инвесторы следят за инфляцией, ставками и корпоративными отчетами. Волатильность остается повышенной.",
    source:"Демо",
    category:"Бизнес",
    publishedAt:new Date(Date.now()-31*60_000).toISOString(),
    image:null,
    url:"#"
  },
  {
    id:"demo-3",
    title:"Новый этап частных космических программ",
    summary:"Частные компании расширяют испытания аппаратов и инфраструктуры для орбитальных миссий.",
    source:"Демо",
    category:"Наука",
    publishedAt:new Date(Date.now()-58*60_000).toISOString(),
    image:null,
    url:"#"
  }
];

const app = document.getElementById("app");
const categoryGrid = document.getElementById("categoryGrid");
const feedTabs = document.getElementById("feedTabs");
const storyList = document.getElementById("storyList");
const storyArticle = document.getElementById("storyArticle");
const digestTimeline = document.getElementById("digestTimeline");
const calmList = document.getElementById("calmList");
const updatedLabel = document.getElementById("updatedLabel");
const feedTitle = document.getElementById("feedTitle");
const toast = document.getElementById("toast");
const searchPanel = document.getElementById("searchPanel");
const searchInput = document.getElementById("searchInput");

let stories = [];
let activeCategory = "Все";
let currentView = "home";
let previousView = "feed";
let toastTimer = null;

function relativeTime(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.max(0, Math.floor(ms / 60000));
  if (mins < 1) return "только что";
  if (mins < 60) return mins + " мин назад";
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + " ч назад";
  return Math.floor(hours / 24) + " дн назад";
}

function safeText(value) {
  return String(value || "").replace(/[<>]/g, "");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 1300);
}

function categoriesWithCounts() {
  return CATEGORIES.map(name => ({
    name,
    count: name === "Все" ? stories.length : stories.filter(story => story.category === name).length
  }));
}

function renderCategories() {
  categoryGrid.replaceChildren();
  categoriesWithCounts().forEach(({name,count}) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-row" + (activeCategory === name ? " active" : "");
    button.innerHTML = '<span class="category-name"></span><span class="category-count"></span>';
    button.querySelector(".category-name").textContent = name.toUpperCase();
    button.querySelector(".category-count").textContent = String(count);
    button.addEventListener("click", () => {
      activeCategory = name;
      renderCategories();
      renderTabs();
      renderFeed();
      switchView("feed");
    });
    categoryGrid.appendChild(button);
  });
}

function renderTabs() {
  feedTabs.replaceChildren();
  CATEGORIES.forEach(name => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tab" + (activeCategory === name ? " active" : "");
    button.textContent = name;
    button.addEventListener("click", () => {
      activeCategory = name;
      feedTitle.textContent = name === "Все" ? "Главные события" : name;
      renderTabs();
      renderFeed();
    });
    feedTabs.appendChild(button);
  });
}

function filteredStories() {
  return activeCategory === "Все" ? stories : stories.filter(story => story.category === activeCategory);
}

function storyCard(story, featured) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "story-card" + (featured ? " featured" : "");

  const image = story.image
    ? '<img class="story-image" alt="" src="' + safeText(story.image) + '" loading="lazy" />'
    : '<div class="story-image" aria-hidden="true"></div>';

  button.innerHTML =
    image +
    '<div class="story-content">' +
      '<div class="story-meta"><span class="live-dot"></span><span class="meta-source"></span><span>·</span><span class="meta-time"></span></div>' +
      '<h3 class="story-title"></h3>' +
      '<p class="story-summary"></p>' +
      '<div class="story-footer"><span class="tag"></span><span>→</span></div>' +
    '</div>';

  button.querySelector(".meta-source").textContent = story.source;
  button.querySelector(".meta-time").textContent = relativeTime(story.publishedAt);
  button.querySelector(".story-title").textContent = story.title;
  button.querySelector(".story-summary").textContent = story.summary || "Откройте карточку, чтобы перейти к источнику.";
  button.querySelector(".tag").textContent = story.category;
  button.addEventListener("click", () => openStory(story));
  return button;
}

function renderFeed(items = filteredStories()) {
  storyList.replaceChildren();
  if (!items.length) {
    storyList.innerHTML = '<div class="empty-card">ПОКА НИЧЕГО НЕТ</div>';
    return;
  }
  items.forEach((story,index) => storyList.appendChild(storyCard(story,index === 0)));
}

function renderDigest() {
  digestTimeline.replaceChildren();
  stories.slice(0,8).forEach(story => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "digest-item";
    item.style.cssText = "display:block;width:100%;border:0;background:transparent;color:inherit;text-align:left;padding-right:0;";
    const date = new Date(story.publishedAt);
    item.innerHTML = '<div class="digest-time"></div><div class="digest-title"></div>';
    item.querySelector(".digest-time").textContent = date.toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
    item.querySelector(".digest-title").textContent = story.title;
    item.addEventListener("click", () => openStory(story));
    digestTimeline.appendChild(item);
  });
}

function renderCalm() {
  calmList.replaceChildren();
  stories.slice(0,5).forEach(story => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calm-item";
    button.style.cssText = "width:100%;border-left:0;border-right:0;border-bottom:0;background:transparent;color:inherit;text-align:left;";
    button.textContent = story.title;
    button.addEventListener("click", () => openStory(story));
    calmList.appendChild(button);
  });
}

function openStory(story) {
  previousView = currentView === "story" ? "feed" : currentView;
  storyArticle.replaceChildren();

  const hero = document.createElement("div");
  hero.className = "story-hero";
  if (story.image) {
    const img = document.createElement("img");
    img.src = story.image;
    img.alt = "";
    hero.appendChild(img);
  }

  const meta = document.createElement("div");
  meta.className = "story-meta";
  meta.innerHTML = '<span class="live-dot"></span><span></span><span>·</span><span></span>';
  meta.children[1].textContent = story.category;
  meta.children[3].textContent = relativeTime(story.publishedAt);

  const title = document.createElement("h2");
  title.textContent = story.title;

  const copy = document.createElement("p");
  copy.className = "article-copy";
  copy.textContent = story.summary || "Краткое описание от источника пока недоступно.";

  const panel = document.createElement("div");
  panel.className = "article-panel";
  panel.innerHTML = '<strong>ИСТОЧНИК И КОНТЕКСТ</strong><p></p>';
  panel.querySelector("p").textContent = "Материал получен из ленты «" + story.source + "». Nothing News не меняет факт новости и всегда оставляет ссылку на оригинальную публикацию.";

  if (story.url && story.url !== "#") {
    const link = document.createElement("a");
    link.className = "source-link";
    link.href = story.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.innerHTML = "<span></span><span>↗</span>";
    link.firstChild.textContent = "Открыть " + story.source;
    panel.appendChild(link);
  }

  storyArticle.append(hero, meta, title, copy, panel);
  switchView("story");
}

function switchView(name) {
  document.querySelectorAll(".view").forEach(view => view.classList.remove("view-active"));
  const target = document.getElementById(name + "View");
  if (target) target.classList.add("view-active");
  currentView = name;
  document.querySelectorAll(".bottom-nav button").forEach(button => {
    button.classList.toggle("nav-active", button.dataset.view === name);
  });
  searchPanel.hidden = true;
  window.scrollTo({top:0,behavior:"smooth"});
}

async function loadNews({force=false, query=""} = {}) {
  storyList.innerHTML = '<div class="loading-card">СОБИРАЕМ НОВОСТИ…</div>';
  try {
    if (force) {
      await fetch("/api/refresh",{method:"POST"});
    }
    const url = new URL("/api/news", location.origin);
    url.searchParams.set("limit","50");
    if (query) url.searchParams.set("q",query);
    const response = await fetch(url);
    if (!response.ok) throw new Error("api");
    const data = await response.json();
    stories = data.items?.length ? data.items : DEMO;
    updatedLabel.textContent = data.updatedAt
      ? "ОБНОВЛЕНО " + new Date(data.updatedAt).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})
      : "ДЕМО-ЛЕНТА";
    if (data.errors?.length) showToast("Часть источников временно недоступна");
  } catch (_) {
    stories = DEMO;
    updatedLabel.textContent = "ДЕМО · СЕРВЕР НЕДОСТУПЕН";
    showToast("Показываю демо-ленту");
  }

  renderCategories();
  renderTabs();
  renderFeed();
  renderDigest();
  renderCalm();
}

document.querySelectorAll(".bottom-nav button").forEach(button => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.getElementById("openFeed").addEventListener("click", () => switchView("feed"));
document.getElementById("brandButton").addEventListener("click", () => switchView("home"));
document.getElementById("storyBack").addEventListener("click", () => switchView(previousView || "feed"));
document.getElementById("refreshButton").addEventListener("click", async () => {
  await loadNews({force:true});
  showToast("Лента обновлена");
});
document.getElementById("calmRefresh").addEventListener("click", async () => {
  await loadNews({force:true});
  renderCalm();
  showToast("Главное обновлено");
});

document.getElementById("searchButton").addEventListener("click", () => {
  searchPanel.hidden = !searchPanel.hidden;
  if (!searchPanel.hidden) setTimeout(() => searchInput.focus(),50);
});

document.getElementById("searchForm").addEventListener("submit", async event => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;
  await loadNews({query});
  feedTitle.textContent = "Поиск: " + query;
  switchView("feed");
});

loadNews();
