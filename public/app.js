const cityDisplay = document.getElementById('city-display');
const dateDisplay = document.getElementById('date-display');
const refreshButton = document.getElementById('refresh-button');
const adviceText = document.getElementById('advice-text');
const conditionText = document.getElementById('condition-text');
const temperatureText = document.getElementById('temperature');
const feelsLikeText = document.getElementById('feels-like');
const humidityText = document.getElementById('humidity');
const windText = document.getElementById('wind');
const sunriseText = document.getElementById('sunrise');
const sunsetText = document.getElementById('sunset');
const aqiValue = document.getElementById('aqi-value');
const pm25Value = document.getElementById('pm25-value');
const pm10Value = document.getElementById('pm10-value');
const aqiLevel = document.getElementById('aqi-level');
const cityFormCard = document.getElementById('city-form-card');
const cityForm = document.getElementById('city-form');
const cityInput = document.getElementById('city-input');
const chartCanvas = document.getElementById('trend-chart');

let currentCity = '';
let latestForecast = [];
let chartResizeTimer = null;

function setDate() {
  const now = new Date();
  dateDisplay.textContent = now.toLocaleDateString('zh-CN', {
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });
}

async function init() {
  setDate();
  refreshButton.addEventListener('click', () => refreshWeather());
  window.addEventListener('resize', () => {
    clearTimeout(chartResizeTimer);
    chartResizeTimer = setTimeout(() => drawChart(latestForecast), 120);
  });
  cityForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const city = cityInput.value.trim();
    if (!city) return;
    await saveCity(city);
    hideCityForm();
    await refreshWeather();
  });

  const saved = await loadSavedCity();
  if (saved) {
    currentCity = saved;
    updateHeader(saved);
    await refreshWeather();
  } else {
    await tryLocation();
  }
}

async function loadSavedCity() {
  try {
    const response = await fetch('/api/location');
    if (!response.ok) return '';
    const result = await response.json();
    return result.city || '';
  } catch (error) {
    return '';
  }
}

function updateHeader(city) {
  currentCity = city;
  cityDisplay.textContent = city;
}

function showCityForm() {
  cityFormCard.classList.remove('hidden');
}

function hideCityForm() {
  cityFormCard.classList.add('hidden');
}

async function tryLocation() {
  if (!navigator.geolocation) {
    showCityForm();
    return;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(async (position) => {
      const city = await reverseGeocode(position.coords.latitude, position.coords.longitude);
      if (city) {
        await saveCity(city);
        updateHeader(city);
        await refreshWeather();
        resolve();
      } else {
        showCityForm();
        resolve();
      }
    }, () => {
      showCityForm();
      resolve();
    }, { timeout: 8000 });
  });
}

async function reverseGeocode(lat, lon) {
  try {
    const response = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`);
    if (response.ok) {
      const data = await response.json();
      if (data.city) return data.city;
    }
  } catch (error) {
    // ignore and fallback
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
    const response = await fetch(url);
    if (!response.ok) return '';
    const data = await response.json();
    return data.address.city || data.address.town || data.address.county || data.address.state || '';
  } catch {
    return '';
  }
}

async function saveCity(city) {
  try {
    const response = await fetch('/api/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ city })
    });
    if (!response.ok) {
      console.warn('保存城市失败');
    }
    updateHeader(city);
  } catch (error) {
    console.warn('保存城市时出现错误', error);
  }
}

async function refreshWeather() {
  if (!currentCity) return;
  try {
    const response = await fetch(`/api/weather?city=${encodeURIComponent(currentCity)}`);
    if (!response.ok) {
      adviceText.textContent = '天气数据加载失败，请稍后重试。';
      return;
    }

    const result = await response.json();
    renderWeather(result);
  } catch (error) {
    adviceText.textContent = '天气数据加载失败，请检查网络。';
  }
}

function renderWeather(data) {
  if (!data || !data.weather || !data.air) {
    adviceText.textContent = '暂无天气数据。';
    return;
  }

  const { weather, air } = data;
  updateHeader(weather.city || currentCity);
  conditionText.textContent = weather.condition || '--';
  temperatureText.textContent = weather.temperature ?? '--';
  feelsLikeText.textContent = weather.feels_like ?? '--';
  humidityText.textContent = weather.humidity ?? '--';
  windText.textContent = weather.wind ?? '--';
  sunriseText.textContent = weather.sunrise || '--';
  sunsetText.textContent = weather.sunset || '--';
  aqiValue.textContent = air.aqi ?? '--';
  pm25Value.textContent = air.pm25 ?? '--';
  pm10Value.textContent = air.pm10 ?? '--';
  aqiLevel.textContent = air.level || '--';
  adviceText.textContent = air.advice || '暂无出行建议';
  latestForecast = weather.forecast || [];
  drawChart(latestForecast);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getCanvasMetrics(canvas) {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const cssWidth = Math.round(rect.width || canvas.width || 360);
  const cssHeight = Math.round(rect.height || canvas.height || 180);

  if (canvas.width !== Math.round(cssWidth * pixelRatio) || canvas.height !== Math.round(cssHeight * pixelRatio)) {
    canvas.width = Math.round(cssWidth * pixelRatio);
    canvas.height = Math.round(cssHeight * pixelRatio);
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  return { ctx, width: cssWidth, height: cssHeight };
}

function getSoftRange(values, { marginRatio = 0.18, minMargin = 1, clampMin = null, clampMax = null } = {}) {
  const validValues = values.filter(Number.isFinite);
  if (validValues.length === 0) {
    return { min: 0, max: 1 };
  }

  let min = Math.min(...validValues);
  let max = Math.max(...validValues);

  if (min === max) {
    min -= minMargin;
    max += minMargin;
  } else {
    const margin = Math.max((max - min) * marginRatio, minMargin);
    min -= margin;
    max += margin;
  }

  if (clampMin !== null) min = Math.max(clampMin, min);
  if (clampMax !== null) max = Math.min(clampMax, max);
  if (max <= min) max = min + 1;

  return { min, max };
}

function createSmoothPath(ctx, coords) {
  if (coords.length === 0) return;
  ctx.moveTo(coords[0].x, coords[0].y);

  for (let i = 0; i < coords.length - 1; i += 1) {
    const p0 = coords[i - 1] || coords[i];
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const p3 = coords[i + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}

function drawSeries(ctx, coords, color, fillColor, baseY) {
  if (coords.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  createSmoothPath(ctx, coords);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.8;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.stroke();

  ctx.restore();
}

function drawChart(points) {
  const { ctx, width, height } = getCanvasMetrics(chartCanvas);
  ctx.clearRect(0, 0, width, height);

  const cleanPoints = (points || [])
    .slice(0, 24)
    .map((item) => ({
      hour: item.hour || '',
      temp: toNumber(item.temp),
      humidity: toNumber(item.humidity)
    }))
    .filter((item) => item.temp !== null && item.humidity !== null);

  if (cleanPoints.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无趋势数据', width / 2, height / 2 + 5);
    return;
  }

  const padding = { top: 30, right: 36, bottom: 34, left: 36 };
  const plotLeft = padding.left;
  const plotRight = width - padding.right;
  const plotTop = padding.top;
  const plotBottom = height - padding.bottom;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  const temps = cleanPoints.map((item) => item.temp);
  const humidities = cleanPoints.map((item) => item.humidity);
  const tempRange = getSoftRange(temps, { marginRatio: 0.22, minMargin: 2 });
  const humidityRange = getSoftRange(humidities, {
    marginRatio: 0.16,
    minMargin: 6,
    clampMin: 0,
    clampMax: 100
  });

  const xOf = (index) => plotLeft + (plotWidth * index) / Math.max(1, cleanPoints.length - 1);
  const yOfTemp = (value) => plotBottom - ((value - tempRange.min) / (tempRange.max - tempRange.min)) * plotHeight;
  const yOfHumidity = (value) => plotBottom - ((value - humidityRange.min) / (humidityRange.max - humidityRange.min)) * plotHeight;

  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.fillStyle = '#64748b';
  ctx.font = '10.5px sans-serif';

  for (let i = 0; i <= 4; i += 1) {
    const y = plotTop + (plotHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();

    const tempLabel = Math.round(tempRange.max - ((tempRange.max - tempRange.min) / 4) * i);
    const humidityLabel = Math.round(humidityRange.max - ((humidityRange.max - humidityRange.min) / 4) * i);

    ctx.textAlign = 'right';
    ctx.fillText(`${tempLabel}°`, plotLeft - 7, y + 4);
    ctx.textAlign = 'left';
    ctx.fillText(`${humidityLabel}%`, plotRight + 7, y + 4);
  }

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
  ctx.beginPath();
  ctx.moveTo(plotLeft, plotBottom);
  ctx.lineTo(plotRight, plotBottom);
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'center';
  const labelStep = Math.max(1, Math.ceil(cleanPoints.length / 5));
  cleanPoints.forEach((item, index) => {
    if (index % labelStep !== 0 && index !== cleanPoints.length - 1) return;
    ctx.fillText(item.hour, xOf(index), height - 12);
  });
  ctx.restore();

  const tempCoords = cleanPoints.map((item, index) => ({ x: xOf(index), y: yOfTemp(item.temp) }));
  const humidityCoords = cleanPoints.map((item, index) => ({ x: xOf(index), y: yOfHumidity(item.humidity) }));

  const tempGradient = ctx.createLinearGradient(0, plotTop, 0, plotBottom);
  tempGradient.addColorStop(0, 'rgba(14, 165, 233, 0.22)');
  tempGradient.addColorStop(1, 'rgba(14, 165, 233, 0.02)');

  const humidityGradient = ctx.createLinearGradient(0, plotTop, 0, plotBottom);
  humidityGradient.addColorStop(0, 'rgba(249, 115, 22, 0.18)');
  humidityGradient.addColorStop(1, 'rgba(249, 115, 22, 0.02)');

  drawSeries(ctx, tempCoords, '#f97316', tempGradient, plotBottom);
  drawSeries(ctx, humidityCoords, '#0ea5e9', humidityGradient, plotBottom);

  ctx.save();
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.roundRect(plotLeft, 10, 9, 9, 3);
  ctx.fill();
  ctx.fillText('温度 ℃', plotLeft + 14, 18);
  
  ctx.fillStyle = '#0ea5e9';
  ctx.beginPath();
  ctx.roundRect(plotLeft + 74, 10, 9, 9, 3);
  ctx.fill();
  ctx.fillText('湿度 %', plotLeft + 88, 18);
  ctx.restore();
}

init();
