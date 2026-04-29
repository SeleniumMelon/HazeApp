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
  adviceText.textContent = air.advice || getAdviceByAqi(air.aqi);
  drawChart(weather.forecast || []);
}

function getAdviceByAqi(aqi) {
  if (aqi <= 50) return '空气质量优，适宜外出活动。';
  if (aqi <= 100) return '空气质量良，适宜正常出行。';
  if (aqi <= 150) return '轻度污染，敏感人群应减少户外活动。';
  if (aqi <= 200) return '中度污染，建议佩戴口罩并减少外出。';
  if (aqi <= 300) return '重度污染，尽量待在室内，关闭门窗。';
  return '严重污染，建议尽量避免外出。';
}

function drawChart(points) {
  const ctx = chartCanvas.getContext('2d');
  const width = chartCanvas.width;
  const height = chartCanvas.height;
  ctx.clearRect(0, 0, width, height);

  if (!points || points.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '16px sans-serif';
    ctx.fillText('暂无趋势数据', 20, 110);
    return;
  }

  const padding = 32;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  const temps = points.map((item) => item.temp);
  const hums = points.map((item) => item.humidity);
  const maxTemp = Math.max(...temps, 30);
  const minTemp = Math.min(...temps, 0);
  const maxHum = Math.max(...hums, 100);
  const minHum = Math.min(...hums, 0);
  const yTempScale = plotHeight / Math.max(1, maxTemp - minTemp);
  const yHumScale = plotHeight / Math.max(1, maxHum - minHum);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding + (plotHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  const step = plotWidth / Math.max(1, points.length - 1);
  ctx.lineWidth = 3;

  ctx.strokeStyle = '#38bdf8';
  ctx.beginPath();
  points.forEach((item, index) => {
    const x = padding + index * step;
    const y = padding + plotHeight - (item.temp - minTemp) * yTempScale;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
  });
  ctx.stroke();

  ctx.strokeStyle = '#f97316';
  ctx.beginPath();
  points.forEach((item, index) => {
    const x = padding + index * step;
    const y = padding + plotHeight - (item.humidity - minHum) * yHumScale;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = '#cbd5e1';
  ctx.font = '12px sans-serif';
  points.forEach((item, index) => {
    const x = padding + index * step;
    ctx.fillText(item.hour, x - 18, height - 10);
  });

  ctx.fillStyle = '#38bdf8';
  ctx.font = '12px sans-serif';
  ctx.fillText('温度', padding, padding - 12);
  ctx.fillStyle = '#f97316';
  ctx.fillText('湿度', padding + 68, padding - 12);
}

init();
