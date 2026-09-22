const CATEGORIES = ["Все новости","Технологии","Бизнес","Мир","Наука","Культура","Здоровье","Спорт"];
const CATEGORY_KEYS = ["Все","Технологии","Бизнес","Мир","Наука","Культура","Здоровье","Спорт"];

const DEMO = [
  {
    id:"demo-1",
    title:"Технологии становятся естественной частью повседневной жизни",
    summary:"Новые цифровые инструменты постепенно переходят из экспериментальных продуктов в привычные сервисы.",
    source:"Демо",
    category:"Технологии",
    publishedAt:new Date(Date.now()-12*60_000).toISOString(),
    image:null,
    url:"#"
  },
  {
    id:"demo-2",
    title:"Рынки оценивают новые экономические сигналы",
    summary:"Инвесторы следят за инфляцией, ставками и корпоративными результатами крупнейших компаний.",
    source:"Демо",
    category:"Бизнес",
    publishedAt:new Date(Date.now()-35*60_000).toISOString(),
    image:null,
    url:"#"
  },
  {
    id:"demo-3",
    title:"Исследователи готовят новый этап космических программ",
    summary:"Несколько проектов переходят от испытаний к подготовке новых орбитальных миссий.",
    source:"Демо",
    category:"Наука",
    publishedAt:new Date(Date.now()-70*60_000).toISOString(),
    image:null,
    url:"#"
  }
];

const app=document.getElementById("app");
const categoryList=document.getElementById("categoryList");
const storyList=document.getElementById("storyList");
const storyArticle=document.getElementById("storyArticle");
const contextText=document.getElementById("contextText");
const contextSources=document.getElementById("contextSources");
const relatedTopics=document.getElementById("relatedTopics");
const digestTimeline=document.getElementById("digestTimeline");
const calmList=document.getElementById("calmList");
const savedList=document.getElementById("savedList");
const searchPanel=document.getElementById("searchPanel");
const searchInput=document.getElementById("searchInput");
const bookmarkButton=document.getElementById("bookmarkButton");
const preferenceSliders=document.getElementById("preferenceSliders");
const toast=document.getElementById("toast");

let stories=[];
let activeCategory="Все";
let feedMode="now";
let currentStory=null;
let previousView="feed";
let toastTimer=null;
let density=localStorage.getItem("news-density") || "balanced";

const saved=new Set(JSON.parse(localStorage.getItem("news-saved") || "[]"));
const preferenceDefaults={Технологии:100,Бизнес:70,Наука:60,Мир:50,Культура:30,Здоровье:20,Спорт:0};
let preferences={...preferenceDefaults};
try{
  const stored=JSON.parse(localStorage.getItem("news-preferences") || "{}");
  preferences={...preferences,...stored};
}catch(_){}

function showToast(message){
  toast.textContent=message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove("show"),1200);
}

function relativeTime(value){
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return "";
  const mins=Math.max(0,Math.floor((Date.now()-date.getTime())/60000));
  if(mins<1) return "СЕЙЧАС";
  if(mins<60) return mins+" МИН НАЗАД";
  const hours=Math.floor(mins/60);
  if(hours<24) return hours+" Ч НАЗАД";
  return Math.floor(hours/24)+" ДН НАЗАД";
}

function domainOf(url){
  try{return new URL(url).hostname.replace(/^www\./,"");}catch(_){return "";}
}

function cleanSummary(text){
  const value=String(text||"").replace(/\s+/g," ").trim();
  if(!value) return "Краткое описание появится после обновления источника.";
  if(density==="short") return value.slice(0,150)+(value.length>150?"…":"");
  if(density==="deep") return value.slice(0,420);
  return value.slice(0,260)+(value.length>260?"…":"");
}

function categoryCounts(){
  return CATEGORY_KEYS.map((key,index)=>({
    key,
    label:CATEGORIES[index],
    count:key==="Все"?stories.length:stories.filter(item=>item.category===key).length
  }));
}

function renderCategories(){
  categoryList.replaceChildren();
  categoryCounts().forEach(({key,label,count})=>{
    const button=document.createElement("button");
    button.type="button";
    button.className="category-row"+(activeCategory===key?" active":"");
    button.innerHTML='<span class="category-name"></span><span class="category-count"></span>';
    button.querySelector(".category-name").textContent=label.toUpperCase();
    button.querySelector(".category-count").textContent=String(count);
    button.addEventListener("click",()=>{
      activeCategory=key;
      feedMode="now";
      renderCategories();
      renderFeedTabs();
      renderFeed();
      switchView("feed");
    });
    categoryList.appendChild(button);
  });
}

function filteredStories(){
  return activeCategory==="Все"?stories:stories.filter(item=>item.category===activeCategory);
}

function diversified(items,limit=18){
  const pool=[...items].sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt));
  const result=[];
  const sourceCounts=new Map();
  while(pool.length && result.length<limit){
    let index=pool.findIndex(item=>(sourceCounts.get(item.source)||0)<2);
    if(index<0) index=0;
    const item=pool.splice(index,1)[0];
    sourceCounts.set(item.source,(sourceCounts.get(item.source)||0)+1);
    result.push(item);
  }
  return result;
}

function overviewStories(items){
  return [...items]
    .map(item=>{
      const age=Math.max(0,(Date.now()-new Date(item.publishedAt).getTime())/3600000);
      const imageBonus=item.image?8:0;
      const summaryBonus=Math.min((item.summary||"").length/80,5);
      return {item,score:Math.max(0,18-age)+imageBonus+summaryBonus};
    })
    .sort((a,b)=>b.score-a.score)
    .map(entry=>entry.item);
}

function mineStories(items){
  return [...items].sort((a,b)=>{
    const wa=preferences[a.category] ?? 40;
    const wb=preferences[b.category] ?? 40;
    if(wb!==wa) return wb-wa;
    return new Date(b.publishedAt)-new Date(a.publishedAt);
  });
}

function currentFeed(){
  const base=filteredStories();
  if(feedMode==="overview") return diversified(overviewStories(base),24);
  if(feedMode==="mine") return diversified(mineStories(base),24);
  return diversified(base,24);
}

function visualFor(story){
  const wrap=document.createElement("div");
  wrap.className="story-image-wrap";
  if(story.image){
    const img=document.createElement("img");
    img.className="story-image";
    img.src=story.image;
    img.alt="";
    img.loading="lazy";
    img.onerror=()=>{img.remove();wrap.appendChild(Object.assign(document.createElement("div"),{className:"story-visual"}));};
    wrap.appendChild(img);
  }else{
    const visual=document.createElement("div");
    visual.className="story-visual";
    wrap.appendChild(visual);
  }
  return wrap;
}

function createStoryCard(story,index){
  const card=document.createElement("button");
  card.type="button";
  card.className="story-card "+(index===0?"hero":"compact");
  card.appendChild(visualFor(story));

  const body=document.createElement("div");
  body.className="story-body";
  body.innerHTML=
    '<div class="story-meta"><span class="live-dot"></span><span class="meta-category"></span><span>·</span><span class="meta-time"></span></div>'+
    '<h3 class="story-title"></h3>'+
    '<p class="story-summary"></p>'+
    '<div class="story-tags"><div class="tag-row"><span class="tag tag-source"></span></div><span class="card-arrow">→</span></div>';

  body.querySelector(".meta-category").textContent=story.category;
  body.querySelector(".meta-time").textContent=relativeTime(story.publishedAt);
  body.querySelector(".story-title").textContent=story.title;
  body.querySelector(".story-summary").textContent=cleanSummary(story.summary);
  body.querySelector(".tag-source").textContent=story.source.toUpperCase();
  card.appendChild(body);
  card.addEventListener("click",()=>openStory(story));
  return card;
}

function renderFeed(){
  storyList.replaceChildren();
  const items=currentFeed();
  if(!items.length){
    storyList.innerHTML='<div class="empty">В ЭТОЙ КАТЕГОРИИ ПОКА ПУСТО</div>';
    return;
  }
  items.slice(0,12).forEach((story,index)=>storyList.appendChild(createStoryCard(story,index)));
}

function renderFeedTabs(){
  document.querySelectorAll("[data-feed-mode]").forEach(button=>{
    button.classList.toggle("active",button.dataset.feedMode===feedMode);
  });
}

function sentenceBullets(story){
  const parts=String(story.summary||"")
    .split(/[.!?]\s+/)
    .map(v=>v.trim())
    .filter(v=>v.length>24)
    .slice(0,4);
  if(parts.length>=2) return parts;
  return [
    "Событие опубликовано источником "+story.source+".",
    "Категория: "+story.category+".",
    "Оригинальная публикация доступна по ссылке источника."
  ];
}

function openStory(story){
  currentStory=story;
  previousView=document.querySelector(".view-active")?.id?.replace("View","") || "feed";
  storyArticle.replaceChildren();

  const hero=document.createElement("div");
  hero.className="story-hero";
  if(story.image){
    const img=document.createElement("img");
    img.src=story.image;
    img.alt="";
    img.onerror=()=>img.remove();
    hero.appendChild(img);
  }

  const meta=document.createElement("div");
  meta.className="story-meta";
  meta.innerHTML='<span class="live-dot"></span><span></span><span>·</span><span></span>';
  meta.children[1].textContent=story.category.toUpperCase();
  meta.children[3].textContent=relativeTime(story.publishedAt);

  const title=document.createElement("h1");
  title.textContent=story.title;

  const copy=document.createElement("p");
  copy.className="article-copy";
  copy.textContent=cleanSummary(story.summary);

  const panel=document.createElement("div");
  panel.className="key-panel";
  panel.innerHTML='<div class="key-panel-title">ГЛАВНОЕ</div><ul class="key-list"></ul>';
  sentenceBullets(story).forEach(text=>{
    const li=document.createElement("li");
    li.textContent=text;
    panel.querySelector(".key-list").appendChild(li);
  });

  const contextButton=document.createElement("button");
  contextButton.type="button";
  contextButton.className="context-button";
  contextButton.innerHTML='<span>КОНТЕКСТ И ИСТОЧНИКИ</span><span>→</span>';
  contextButton.addEventListener("click",()=>openContext(story));

  storyArticle.append(hero,meta,title,copy,panel,contextButton);
  syncBookmark();
  switchView("story");
}

function contextPhrase(story){
  const byCategory={
    Технологии:"Эта публикация относится к технологиям. Для понимания темы полезно сопоставить исходный материал с другими публикациями по тому же направлению.",
    Бизнес:"Это деловая новость. Цифры и заявления лучше читать вместе с первоисточником и соседними публикациями по рынку.",
    Мир:"Это международное событие. Формулировки разных редакций могут отличаться, поэтому ниже сохранены ссылки на исходные материалы.",
    Наука:"Это научная тема. Важно отделять подтверждённые результаты от предварительных выводов и смотреть на первичный источник.",
    Культура:"Это событие из культуры. Ниже можно перейти к исходной публикации и близким материалам.",
    Здоровье:"Это тема о здоровье. Приложение не заменяет медицинские рекомендации и сохраняет ссылку на исходный материал.",
    Спорт:"Это спортивное событие. Ниже — исходная публикация и близкие материалы."
  };
  return byCategory[story.category] || "Ниже собраны исходная публикация и близкие материалы, чтобы можно было быстро проверить контекст.";
}

function relatedFor(story){
  const words=story.title.toLowerCase().split(/[^a-zа-яё0-9]+/i).filter(w=>w.length>5);
  return stories
    .filter(item=>item.id!==story.id)
    .map(item=>({
      item,
      score:(item.category===story.category?2:0)+words.filter(w=>item.title.toLowerCase().includes(w)).length
    }))
    .filter(entry=>entry.score>0)
    .sort((a,b)=>b.score-a.score)
    .map(entry=>entry.item);
}

function openContext(story){
  currentStory=story;
  contextText.textContent=contextPhrase(story);
  contextSources.replaceChildren();

  const sourceItems=[story,...relatedFor(story).filter(item=>item.source!==story.source).slice(0,3)];
  sourceItems.forEach(item=>{
    const row=document.createElement("a");
    row.className="source-row";
    row.href=item.url||"#";
    row.target="_blank";
    row.rel="noopener noreferrer";
    row.innerHTML='<span class="source-logo"></span><span><span class="source-name"></span><span class="source-domain"></span></span><span>↗</span>';
    row.querySelector(".source-logo").textContent=item.source.slice(0,2).toUpperCase();
    row.querySelector(".source-name").textContent=item.source;
    row.querySelector(".source-domain").textContent=domainOf(item.url);
    contextSources.appendChild(row);
  });

  relatedTopics.replaceChildren();
  const related=relatedFor(story).slice(0,4);
  (related.length?related:[story]).forEach(item=>{
    const button=document.createElement("button");
    button.type="button";
    button.className="topic-card";
    button.innerHTML='<strong></strong><span></span>';
    button.querySelector("strong").textContent=item.category;
    button.querySelector("span").textContent=item.title.slice(0,48)+(item.title.length>48?"…":"");
    button.addEventListener("click",()=>openStory(item));
    relatedTopics.appendChild(button);
  });

  switchView("context");
}

function syncBookmark(){
  if(!currentStory) return;
  bookmarkButton.classList.toggle("bookmarked",saved.has(currentStory.id));
  bookmarkButton.style.background=saved.has(currentStory.id)?"#f2f2ef":"rgba(8,10,10,.86)";
  bookmarkButton.style.color=saved.has(currentStory.id)?"#080909":"";
}

function toggleBookmark(){
  if(!currentStory) return;
  if(saved.has(currentStory.id)){
    saved.delete(currentStory.id);
    showToast("Убрано из сохранённого");
  }else{
    saved.add(currentStory.id);
    showToast("Сохранено");
  }
  localStorage.setItem("news-saved",JSON.stringify([...saved]));
  syncBookmark();
  renderSaved();
}

function renderSaved(){
  savedList.replaceChildren();
  const items=stories.filter(item=>saved.has(item.id));
  if(!items.length){
    savedList.innerHTML='<div class="saved-empty">ЗДЕСЬ БУДУТ НОВОСТИ,<br>КОТОРЫЕ ВЫ СОХРАНИТЕ.</div>';
    return;
  }
  items.forEach((story,index)=>savedList.appendChild(createStoryCard(story,index===0?0:1)));
}

function renderDigest(){
  digestTimeline.replaceChildren();
  diversified(overviewStories(stories),8).forEach(story=>{
    const button=document.createElement("button");
    button.type="button";
    button.className="digest-item";
    const time=new Date(story.publishedAt).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});
    button.innerHTML='<span class="digest-time"></span><span class="digest-title"></span>';
    button.querySelector(".digest-time").textContent=time;
    button.querySelector(".digest-title").textContent=story.title;
    button.addEventListener("click",()=>openStory(story));
    digestTimeline.appendChild(button);
  });
}

function renderCalm(){
  calmList.replaceChildren();
  diversified(overviewStories(stories),5).forEach(story=>{
    const button=document.createElement("button");
    button.type="button";
    button.className="calm-item";
    button.textContent=story.title;
    button.addEventListener("click",()=>openStory(story));
    calmList.appendChild(button);
  });
}

function renderPreferences(){
  preferenceSliders.replaceChildren();
  Object.keys(preferenceDefaults).forEach(category=>{
    const row=document.createElement("div");
    row.className="preference-row";
    row.innerHTML='<span class="preference-label"></span><span class="preference-value"></span><input type="range" min="0" max="100" step="10">';
    row.querySelector(".preference-label").textContent=category;
    const input=row.querySelector("input");
    const value=row.querySelector(".preference-value");
    input.value=preferences[category] ?? 0;
    const update=()=>{
      value.textContent=input.value+"%";
      input.style.setProperty("--pct",input.value+"%");
    };
    update();
    input.addEventListener("input",()=>{
      preferences[category]=Number(input.value);
      localStorage.setItem("news-preferences",JSON.stringify(preferences));
      update();
    });
    preferenceSliders.appendChild(row);
  });

  document.querySelectorAll("[data-density]").forEach(button=>{
    button.classList.toggle("active",button.dataset.density===density);
  });
}

function isLand(x,y){
  const ellipses=[
    [74,67,52,28],[110,54,32,22],[108,105,19,42],
    [174,63,23,15],[188,105,20,38],[232,66,65,29],
    [277,87,42,24],[286,133,28,18],[156,92,13,24]
  ];
  return ellipses.some(([cx,cy,rx,ry])=>(((x-cx)/rx)**2+((y-cy)/ry)**2)<1);
}

function renderMap(id,withPoints){
  const svg=document.getElementById(id);
  if(!svg) return;
  svg.replaceChildren();
  const width=id==="worldMap"?360:320;
  const height=id==="worldMap"?190:170;
  for(let y=20;y<height-18;y+=8){
    for(let x=12;x<width-12;x+=8){
      const sx=x*(360/width);
      const sy=y*(190/height);
      if(isLand(sx,sy) && ((x+y)%3!==1)){
        const c=document.createElementNS("http://www.w3.org/2000/svg","circle");
        c.setAttribute("cx",x);
        c.setAttribute("cy",y);
        c.setAttribute("r","1.7");
        svg.appendChild(c);
      }
    }
  }
  if(withPoints){
    [[72,71],[164,72],[222,79],[280,94],[194,108]].forEach(([x,y])=>{
      const c=document.createElementNS("http://www.w3.org/2000/svg","circle");
      c.setAttribute("cx",x);
      c.setAttribute("cy",y);
      c.setAttribute("r","3.6");
      c.setAttribute("class","news-point");
      svg.appendChild(c);
    });
  }
}

function renderCityTimes(){
  const cities=[
    ["Нью-Йорк","America/New_York"],
    ["Лондон","Europe/London"],
    ["Москва","Europe/Moscow"],
    ["Дубай","Asia/Dubai"],
    ["Пекин","Asia/Shanghai"],
    ["Токио","Asia/Tokyo"]
  ];
  const root=document.getElementById("cityTimes");
  root.replaceChildren();
  cities.forEach(([name,zone])=>{
    const row=document.createElement("div");
    row.className="city-row";
    row.innerHTML='<span></span><span class="city-time"></span><span class="city-mark">◌</span>';
    row.children[0].textContent=name;
    try{
      row.querySelector(".city-time").textContent=new Intl.DateTimeFormat("ru-RU",{hour:"2-digit",minute:"2-digit",hour12:false,timeZone:zone}).format(new Date());
    }catch(_){
      row.querySelector(".city-time").textContent="—";
    }
    root.appendChild(row);
  });
}

function switchView(name){
  document.querySelectorAll(".view").forEach(view=>view.classList.remove("view-active"));
  const target=document.getElementById(name+"View");
  if(target) target.classList.add("view-active");

  document.querySelectorAll(".bottom-nav button").forEach(button=>{
    button.classList.toggle("nav-active",button.dataset.view===name);
  });

  if(name==="feed") renderFeed();
  if(name==="prefs") renderPreferences();
  if(name==="saved") renderSaved();
  if(name==="world") renderCityTimes();
  if(name==="digest") renderDigest();
  if(name==="calm") renderCalm();

  searchPanel.hidden=true;
  window.scrollTo({top:0,behavior:"smooth"});
}

async function loadNews({force=false,query=""}={}){
  storyList.innerHTML='<div class="loading">СОБИРАЕМ ЛЕНТУ…</div>';
  let data=null;
  const candidates=[
    "https://raw.githubusercontent.com/mburzhinsky-hub/nothing_news/main/data/news.json",
    new URL("./data/news.json",location.href).href
  ];
  for(const candidate of candidates){
    try{
      const url=new URL(candidate);
      if(force) url.searchParams.set("t",String(Date.now()));
      const response=await fetch(url,{cache:"no-store"});
      if(!response.ok) continue;
      const parsed=await response.json();
      if(parsed && Array.isArray(parsed.items)){data=parsed;break;}
    }catch(_){}
  }

  stories=data?.items?.length?data.items:DEMO;
  renderCategories();
  renderFeedTabs();
  renderDigest();
  renderCalm();
  renderSaved();

  if(query){
    const q=query.toLowerCase();
    const matches=stories.filter(item=>
      (item.title+" "+item.summary+" "+item.source+" "+item.category).toLowerCase().includes(q)
    );
    storyList.replaceChildren();
    if(!matches.length) storyList.innerHTML='<div class="empty">НИЧЕГО НЕ НАЙДЕНО</div>';
    else diversified(matches,20).forEach((story,index)=>storyList.appendChild(createStoryCard(story,index)));
  }else{
    renderFeed();
  }

  if(data?.errors?.length) showToast("Некоторые источники временно недоступны");
}

document.querySelectorAll(".bottom-nav button").forEach(button=>{
  button.addEventListener("click",()=>switchView(button.dataset.view));
});

document.querySelectorAll("[data-feed-mode]").forEach(button=>{
  button.addEventListener("click",()=>{
    feedMode=button.dataset.feedMode;
    renderFeedTabs();
    renderFeed();
  });
});

document.querySelectorAll("[data-back]").forEach(button=>{
  button.addEventListener("click",()=>switchView(button.dataset.back));
});

document.getElementById("brandButton").addEventListener("click",()=>switchView("home"));
document.getElementById("worldCard").addEventListener("click",()=>switchView("world"));
document.getElementById("worldFeedButton").addEventListener("click",()=>{
  activeCategory="Мир";
  feedMode="now";
  renderCategories();
  renderFeedTabs();
  switchView("feed");
});
document.getElementById("digestFeedButton").addEventListener("click",()=>{
  activeCategory="Все";
  feedMode="overview";
  renderFeedTabs();
  switchView("feed");
});
document.getElementById("openDigest").addEventListener("click",()=>switchView("digest"));
document.getElementById("openCalm").addEventListener("click",()=>switchView("calm"));
document.getElementById("storyBack").addEventListener("click",()=>switchView(previousView || "feed"));
bookmarkButton.addEventListener("click",toggleBookmark);

document.getElementById("calmToggle").addEventListener("click",()=>{
  const open=calmList.hidden;
  calmList.hidden=!open;
  document.getElementById("calmToggle").textContent=open?"СКРЫТЬ":"ВКЛЮЧИТЬ";
});

document.querySelectorAll("[data-density]").forEach(button=>{
  button.addEventListener("click",()=>{
    density=button.dataset.density;
    localStorage.setItem("news-density",density);
    renderPreferences();
  });
});

document.getElementById("searchButton").addEventListener("click",()=>{
  searchPanel.hidden=!searchPanel.hidden;
  if(!searchPanel.hidden) setTimeout(()=>searchInput.focus(),30);
});

document.getElementById("searchForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const query=searchInput.value.trim();
  if(!query) return;
  activeCategory="Все";
  feedMode="now";
  await loadNews({query});
  switchView("feed");
});

renderMap("homeMap",false);
renderMap("worldMap",true);
renderPreferences();
loadNews();
