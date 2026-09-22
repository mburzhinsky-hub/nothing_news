(function () {
  "use strict";

  var CITIES = [
    { name:"MOSCOW", lat:55.7558, lon:37.6173 },
    { name:"ROTTERDAM", lat:51.9244, lon:4.4777 },
    { name:"LONDON", lat:51.5072, lon:-0.1276 },
    { name:"NEW YORK", lat:40.7128, lon:-74.0060 },
    { name:"DUBAI", lat:25.2048, lon:55.2708 },
    { name:"TOKYO", lat:35.6762, lon:139.6503 }
  ];

  var STYLES = ["DOTS","WIRE","SEGMENT"];
  var app = document.getElementById("app");
  var cityLabel = document.getElementById("cityLabel");
  var conditionLabel = document.getElementById("conditionLabel");
  var dateLabel = document.getElementById("dateLabel");
  var timeLabel = document.getElementById("timeLabel");
  var weatherGlyph = document.getElementById("weatherGlyph");
  var temperatureGlyph = document.getElementById("temperatureGlyph");
  var forecast = document.getElementById("forecast");
  var updateLabel = document.getElementById("updateLabel");
  var settingsPanel = document.getElementById("settingsPanel");
  var settingsList = document.getElementById("settingsList");
  var toast = document.getElementById("toast");
  var canvas = document.getElementById("fx");
  var ctx = canvas.getContext("2d");

  var settingsOpen = false;
  var settingsIndex = 0;
  var cityIndex = parseInt(localStorage.getItem("tv-city-index") || "0",10);
  var unit = localStorage.getItem("tv-unit") || "C";
  var effectsEnabled = localStorage.getItem("tv-effects") !== "off";
  var styleIndex = parseInt(localStorage.getItem("tv-style-index") || "0",10);
  var latestWeather = null;
  var weatherFamily = "rain";
  var particles = [];
  var lastFetch = 0;
  var toastTimer = null;

  var DIGITS = {
    "0":["01110","11011","11011","11011","11011","11011","01110"],
    "1":["00110","01110","00110","00110","00110","00110","01110"],
    "2":["01110","11011","00011","00110","01100","11000","11111"],
    "3":["11110","00011","00011","01110","00011","00011","11110"],
    "4":["10011","10011","10011","11111","00011","00011","00011"],
    "5":["11111","11000","11000","11110","00011","00011","11110"],
    "6":["01110","11000","11000","11110","11011","11011","01110"],
    "7":["11111","00011","00110","00110","01100","01100","01100"],
    "8":["01110","11011","11011","01110","11011","11011","01110"],
    "9":["01110","11011","11011","01111","00011","00011","01110"]
  };

  function clamp(value,min,max) {
    return Math.max(min,Math.min(max,value));
  }

  function saveSettings() {
    localStorage.setItem("tv-city-index",String(cityIndex));
    localStorage.setItem("tv-unit",unit);
    localStorage.setItem("tv-effects",effectsEnabled ? "on" : "off");
    localStorage.setItem("tv-style-index",String(styleIndex));
  }

  function currentCity() {
    cityIndex = clamp(cityIndex,0,CITIES.length-1);
    return CITIES[cityIndex];
  }

  function weatherType(code) {
    if (code === 0) return "clear";
    if (code === 1 || code === 2) return "partly";
    if (code === 3 || code === 45 || code === 48) return "cloud";
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return "snow";
    if (code >= 95) return "storm";
    return "cloud";
  }

  function conditionText(family) {
    var labels = {
      clear:"CLEAR",
      partly:"PARTLY CLOUDY",
      cloud:"CLOUDY",
      rain:"RAIN",
      snow:"SNOW",
      storm:"STORM"
    };
    return labels[family] || "WEATHER";
  }

  function convertTemp(celsius) {
    if (unit === "F") return Math.round(celsius * 9 / 5 + 32);
    return Math.round(celsius);
  }

  function updateClock() {
    var now = new Date();
    var days = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
    var months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    var hh = String(now.getHours()).padStart(2,"0");
    var mm = String(now.getMinutes()).padStart(2,"0");
    timeLabel.textContent = hh + ":" + mm;
    dateLabel.textContent = days[now.getDay()] + ", " + String(now.getDate()).padStart(2,"0") + " " + months[now.getMonth()];
  }

  function renderDigit(char) {
    var root = document.createElement("div");
    root.className = "digit-matrix";
    var pattern = DIGITS[char] || DIGITS["0"];
    for (var r=0;r<7;r+=1) {
      for (var c=0;c<5;c+=1) {
        var pixel = document.createElement("i");
        pixel.className = "pixel" + (pattern[r][c] === "1" ? " on" : "");
        pixel.style.animationDelay = String(-((r*5+c)%11) * 0.22) + "s";
        root.appendChild(pixel);
      }
    }
    return root;
  }

  function renderTemperature(value) {
    temperatureGlyph.replaceChildren();
    var rounded = String(Math.abs(value));
    if (value < 0) {
      var minus = document.createElement("div");
      minus.style.cssText = "width:62px;height:16px;background:var(--accent);margin-top:128px;border-radius:8px;";
      temperatureGlyph.appendChild(minus);
    }
    for (var i=0;i<rounded.length;i+=1) {
      temperatureGlyph.appendChild(renderDigit(rounded[i]));
    }

    var degree = document.createElement("div");
    degree.className = "degree-glyph";
    var degreePattern = ["111","101","111"];
    for (var y=0;y<3;y+=1) {
      for (var x=0;x<3;x+=1) {
        var dot = document.createElement("i");
        if (degreePattern[y][x] === "1") dot.className = "on";
        degree.appendChild(dot);
      }
    }
    temperatureGlyph.appendChild(degree);
  }

  function cloudMask(x,y,family) {
    var cloud =
      (((x-230)*(x-230))/11500 + ((y-245)*(y-245))/7200 < 1) ||
      (((x-330)*(x-330))/16000 + ((y-205)*(y-205))/9800 < 1) ||
      (((x-430)*(x-430))/11200 + ((y-250)*(y-250))/7200 < 1) ||
      (x > 170 && x < 485 && y > 235 && y < 325);

    if (family === "clear") {
      return (((x-340)*(x-340))+((y-235)*(y-235))) < 105*105;
    }

    if (family === "partly") {
      var sun = (((x-455)*(x-455))+((y-155)*(y-155))) < 72*72;
      return cloud || sun;
    }

    return cloud;
  }

  function renderWeatherGlyph(family) {
    while (weatherGlyph.firstChild) weatherGlyph.removeChild(weatherGlyph.firstChild);

    for (var y=80;y<=360;y+=31) {
      for (var x=90;x<=610;x+=31) {
        var circle = document.createElementNS("http://www.w3.org/2000/svg","circle");
        circle.setAttribute("cx",x);
        circle.setAttribute("cy",y);
        circle.setAttribute("r","9");
        circle.setAttribute("class","weather-dot" + (cloudMask(x,y,family) ? " on" : ""));
        circle.style.animationDelay = String(-((x+y)%13) * 0.18) + "s";
        weatherGlyph.appendChild(circle);
      }
    }

    if (family === "rain" || family === "storm") {
      for (var i=0;i<8;i+=1) {
        var line = document.createElementNS("http://www.w3.org/2000/svg","line");
        var lx = 205 + i*43;
        line.setAttribute("x1",lx);
        line.setAttribute("y1",365 + (i%2)*7);
        line.setAttribute("x2",lx-18);
        line.setAttribute("y2",410 + (i%2)*7);
        line.setAttribute("class","weather-line");
        weatherGlyph.appendChild(line);
      }
    }

    if (family === "snow") {
      for (var j=0;j<9;j+=1) {
        var snow = document.createElementNS("http://www.w3.org/2000/svg","circle");
        snow.setAttribute("cx",190 + j*44);
        snow.setAttribute("cy",390 + (j%2)*18);
        snow.setAttribute("r","6");
        snow.setAttribute("class","weather-dot on");
        weatherGlyph.appendChild(snow);
      }
    }
  }

  function iconMarkup(family) {
    if (family === "clear") {
      return '<svg class="forecast-icon" viewBox="0 0 64 64"><circle cx="32" cy="32" r="12"/><path d="M32 7v8M32 49v8M7 32h8M49 32h8M14 14l6 6M44 44l6 6M50 14l-6 6M20 44l-6 6"/></svg>';
    }
    if (family === "rain" || family === "storm") {
      return '<svg class="forecast-icon" viewBox="0 0 64 64"><path d="M17 39h31c6 0 10-4 10-9s-4-9-9-9c-2-8-8-12-16-12-8 0-14 5-16 12-6 0-11 4-11 9s5 9 11 9z"/><line x1="22" y1="45" x2="18" y2="55"/><line x1="34" y1="45" x2="30" y2="55"/><line x1="46" y1="45" x2="42" y2="55"/></svg>';
    }
    if (family === "snow") {
      return '<svg class="forecast-icon" viewBox="0 0 64 64"><path d="M17 37h31c6 0 10-4 10-9s-4-9-9-9c-2-7-8-11-16-11-8 0-14 4-16 11-6 0-11 4-11 9s5 9 11 9z"/><circle cx="22" cy="49" r="2"/><circle cx="34" cy="54" r="2"/><circle cx="46" cy="49" r="2"/></svg>';
    }
    return '<svg class="forecast-icon" viewBox="0 0 64 64"><path d="M17 41h31c6 0 10-4 10-10s-4-10-9-10c-2-8-8-13-16-13-8 0-14 5-16 13-6 0-11 4-11 10s5 10 11 10z"/></svg>';
  }

  function renderForecast(data) {
    forecast.replaceChildren();
    if (!data || !data.daily) return;

    var days = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
    var dates = data.daily.time || [];
    var codes = data.daily.weather_code || [];
    var maxes = data.daily.temperature_2m_max || [];

    for (var i=1;i<Math.min(6,dates.length);i+=1) {
      var card = document.createElement("div");
      card.className = "forecast-card";
      var dayDate = new Date(dates[i] + "T12:00:00");
      var family = weatherType(Number(codes[i]));
      card.innerHTML =
        '<div class="forecast-day">' + days[dayDate.getDay()] + '</div>' +
        iconMarkup(family) +
        '<div class="forecast-temp">' + convertTemp(Number(maxes[i])) + '°</div>';
      forecast.appendChild(card);
    }
  }

  function applyWeather(data,fromCache) {
    if (!data || !data.current) return;
    latestWeather = data;
    weatherFamily = weatherType(Number(data.current.weather_code));
    app.className = "app weather-" + weatherFamily + " style-" + STYLES[styleIndex].toLowerCase();
    cityLabel.textContent = currentCity().name;
    conditionLabel.textContent = conditionText(weatherFamily);
    renderTemperature(convertTemp(Number(data.current.temperature_2m)));
    renderWeatherGlyph(weatherFamily);
    renderForecast(data);
    updateLabel.textContent = fromCache ? "CACHED WEATHER" : "UPDATED " + new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
    resetParticles();
  }

  function fetchWeather(force) {
    var city = currentCity();
    var cacheKey = "weather-cache-" + city.name;
    var cached = null;

    try {
      cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    } catch (_) {}

    if (cached && cached.data) {
      applyWeather(cached.data,true);
    }

    if (!force && Date.now() - lastFetch < 10*60*1000) return;
    lastFetch = Date.now();
    updateLabel.textContent = "UPDATING WEATHER";

    var url = "https://api.open-meteo.com/v1/forecast?latitude=" +
      encodeURIComponent(city.lat) +
      "&longitude=" + encodeURIComponent(city.lon) +
      "&current=temperature_2m,weather_code,is_day" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min" +
      "&timezone=auto&forecast_days=6";

    fetch(url)
      .then(function (response) {
        if (!response.ok) throw new Error("weather");
        return response.json();
      })
      .then(function (data) {
        localStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),data:data}));
        applyWeather(data,false);
      })
      .catch(function () {
        if (!cached) {
          var demo = {
            current:{temperature_2m:12,weather_code:61},
            daily:{
              time:["2026-04-14","2026-04-15","2026-04-16","2026-04-17","2026-04-18","2026-04-19"],
              weather_code:[61,61,3,95,3,61],
              temperature_2m_max:[12,10,12,14,16,13],
              temperature_2m_min:[8,6,7,8,10,9]
            }
          };
          applyWeather(demo,true);
        }
        showToast("WEATHER OFFLINE");
      });
  }

  function particleCount() {
    if (!effectsEnabled) return 0;
    if (weatherFamily === "rain") return 125;
    if (weatherFamily === "storm") return 155;
    if (weatherFamily === "snow") return 90;
    if (weatherFamily === "cloud" || weatherFamily === "partly") return 28;
    if (weatherFamily === "clear") return 20;
    return 20;
  }

  function resetParticles() {
    particles = [];
    var count = particleCount();
    for (var i=0;i<count;i+=1) {
      particles.push({
        x:Math.random()*1920,
        y:Math.random()*1080,
        speed:weatherFamily === "snow" ? 0.8+Math.random()*1.4 : 7+Math.random()*11,
        len:weatherFamily === "snow" ? 2+Math.random()*3 : 18+Math.random()*38,
        drift:(Math.random()-.5)*0.9,
        alpha:0.14+Math.random()*0.35,
        phase:Math.random()*Math.PI*2
      });
    }
  }

  function drawEffects() {
    ctx.clearRect(0,0,1920,1080);
    if (!effectsEnabled) {
      requestAnimationFrame(drawEffects);
      return;
    }

    var i,p;

    if (weatherFamily === "rain" || weatherFamily === "storm") {
      ctx.lineCap = "round";
      for (i=0;i<particles.length;i+=1) {
        p=particles[i];
        ctx.strokeStyle = "rgba(230,244,250," + p.alpha + ")";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x,p.y);
        ctx.lineTo(p.x-7,p.y+p.len);
        ctx.stroke();

        p.x -= 1.6;
        p.y += p.speed;
        if (p.y>1130 || p.x<-30) {
          p.y=-80;
          p.x=Math.random()*2000;
        }
      }

      if (weatherFamily === "storm" && Math.random()<0.0025) {
        ctx.fillStyle="rgba(255,255,255,.08)";
        ctx.fillRect(0,0,1920,1080);
      }
    } else if (weatherFamily === "snow") {
      for (i=0;i<particles.length;i+=1) {
        p=particles[i];
        p.phase += 0.02;
        p.x += Math.sin(p.phase)*0.5 + p.drift;
        p.y += p.speed;
        ctx.fillStyle="rgba(245,248,250," + p.alpha + ")";
        ctx.beginPath();
        ctx.arc(p.x,p.y,p.len,0,Math.PI*2);
        ctx.fill();
        if (p.y>1100) {
          p.y=-20;
          p.x=Math.random()*1920;
        }
      }
    } else {
      for (i=0;i<particles.length;i+=1) {
        p=particles[i];
        p.x += 0.18+p.speed*0.02;
        p.y += Math.sin(p.phase + p.x*.002)*0.08;
        ctx.fillStyle="rgba(228,239,244," + p.alpha*0.25 + ")";
        ctx.beginPath();
        ctx.arc(p.x,p.y,weatherFamily === "clear" ? 1.6 : 2.4,0,Math.PI*2);
        ctx.fill();
        if (p.x>1940) p.x=-20;
      }
    }

    requestAnimationFrame(drawEffects);
  }

  function settingRows() {
    return [
      { name:"CITY", value:currentCity().name },
      { name:"UNITS", value:"°" + unit },
      { name:"STYLE", value:STYLES[styleIndex] },
      { name:"WEATHER FX", value:effectsEnabled ? "ON" : "OFF" },
      { name:"REFRESH", value:"NOW" }
    ];
  }

  function renderSettings() {
    settingsList.replaceChildren();
    var rows = settingRows();
    for (var i=0;i<rows.length;i+=1) {
      var row = document.createElement("div");
      row.className = "setting-row" + (i===settingsIndex ? " focused" : "");
      row.innerHTML =
        '<span class="setting-name">' + rows[i].name + '</span>' +
        '<span class="setting-value">' + rows[i].value + '</span>';
      settingsList.appendChild(row);
    }
  }

  function openSettings() {
    settingsOpen = true;
    settingsPanel.classList.add("open");
    settingsPanel.setAttribute("aria-hidden","false");
    renderSettings();
  }

  function closeSettings() {
    settingsOpen = false;
    settingsPanel.classList.remove("open");
    settingsPanel.setAttribute("aria-hidden","true");
  }

  function changeSetting(direction) {
    if (settingsIndex === 0) {
      cityIndex = (cityIndex + direction + CITIES.length) % CITIES.length;
      saveSettings();
      cityLabel.textContent = currentCity().name;
      renderSettings();
      fetchWeather(true);
      return;
    }

    if (settingsIndex === 1) {
      unit = unit === "C" ? "F" : "C";
      saveSettings();
      renderSettings();
      if (latestWeather) applyWeather(latestWeather,true);
      return;
    }

    if (settingsIndex === 2) {
      styleIndex = (styleIndex + direction + STYLES.length) % STYLES.length;
      saveSettings();
      app.className = "app weather-" + weatherFamily + " style-" + STYLES[styleIndex].toLowerCase();
      renderSettings();
      return;
    }

    if (settingsIndex === 3) {
      effectsEnabled = !effectsEnabled;
      saveSettings();
      renderSettings();
      resetParticles();
      return;
    }

    if (settingsIndex === 4) {
      fetchWeather(true);
      showToast("REFRESHING");
    }
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("show");
    },1100);
  }

  function handleKey(event) {
    var key = event.keyCode;

    if (settingsOpen) {
      if (key === 38) {
        settingsIndex = (settingsIndex - 1 + settingRows().length) % settingRows().length;
        renderSettings();
        return;
      }
      if (key === 40) {
        settingsIndex = (settingsIndex + 1) % settingRows().length;
        renderSettings();
        return;
      }
      if (key === 37) {
        changeSetting(-1);
        return;
      }
      if (key === 39) {
        changeSetting(1);
        return;
      }
      if (key === 13) {
        changeSetting(1);
        return;
      }
      if (key === 10009 || key === 27) {
        closeSettings();
        return;
      }
    } else {
      if (key === 13) {
        openSettings();
        return;
      }

      if (key === 403) {
        fetchWeather(true);
        showToast("REFRESHING");
        return;
      }

      if (key === 404) {
        effectsEnabled = !effectsEnabled;
        saveSettings();
        resetParticles();
        showToast(effectsEnabled ? "WEATHER FX ON" : "WEATHER FX OFF");
        return;
      }

      if (key === 10009 || key === 27) {
        try {
          if (window.tizen && tizen.application) {
            tizen.application.getCurrentApplication().exit();
          }
        } catch (_) {}
      }
    }
  }

  function registerRemoteKeys() {
    try {
      if (window.tizen && tizen.tvinputdevice) {
        tizen.tvinputdevice.registerKey("ColorF0Red");
        tizen.tvinputdevice.registerKey("ColorF1Green");
      }
    } catch (_) {}
  }

  function init() {
    registerRemoteKeys();
    updateClock();
    setInterval(updateClock,1000);
    renderSettings();
    fetchWeather(true);
    resetParticles();
    drawEffects();
    setInterval(function () {
      fetchWeather(false);
    },5*60*1000);
    window.addEventListener("keydown",handleKey);
  }

  init();
})();