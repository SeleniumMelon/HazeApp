const cityDisplay = document.getElementById('city-display'); // 当前城市显示位置
const dateDisplay = document.getElementById('date-display'); // 当前日期显示位置
const refreshButton = document.getElementById('refresh-button'); // 刷新按钮
const adviceText = document.getElementById('advice-text'); // 出行建议文本
const conditionText = document.getElementById('condition-text'); // 当前天气状况
const temperatureText = document.getElementById('temperature'); // 温度
const feelsLikeText = document.getElementById('feels-like'); // 体感温度
const humidityText = document.getElementById('humidity'); // 湿度
const windText = document.getElementById('wind'); // 风况
const sunriseText = document.getElementById('sunrise'); // 日出时间
const sunsetText = document.getElementById('sunset'); // 日落时间
const aqiValue = document.getElementById('aqi-value'); // AQI数值
const pm25Value = document.getElementById('pm25-value'); // PM2.5数值
const pm10Value = document.getElementById('pm10-value'); // PM10数值
const aqiLevel = document.getElementById('aqi-level'); // 空气质量等级
const cityFormCard = document.getElementById('city-form-card'); // 手动输入城市卡片
const cityForm = document.getElementById('city-form'); // 城市名输入表单
const cityInput = document.getElementById('city-input'); // 城市名输入框
const chartCanvas = document.getElementById('trend-chart'); // 温度趋势图

let currentCity = ''; // 当前查询的城市名称
let latestForecast = []; // 最新获取到的天气预报数据
let chartResizeTimer = null; // 图表重绘定时器

// 设置页面顶部显示的当前日期
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
  // 显示的当前日期
  setDate();

  // 当用户点击刷新按钮时，重新获取并刷新天气数据
  refreshButton.addEventListener('click', () => refreshWeather());

  // 当窗口大小改变时，需要重新绘制图表以适应新的尺寸
  window.addEventListener('resize', () => {
    clearTimeout(chartResizeTimer);
    chartResizeTimer = setTimeout(() => drawChart(latestForecast), 120);
  });

  // 当用户输入城市并提交时,保存城市名称并刷新天气数据
  cityForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const city = cityInput.value.trim();
    if (!city) return;
    await saveCity(city);
    hideCityForm();
    await refreshWeather();
  });

  // 从已保存的数据中读取城市名称
  const saved = await loadSavedCity();
  if (saved) {
    currentCity = saved;
    updateHeader(saved);
    await refreshWeather();
  } else {
    await tryLocation();
  }
}

// 从服务器加载已保存的城市名称，如果没有或发生错误则返回空字符串
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

// 更新页面顶部的城市名称显示
function updateHeader(city) {
  currentCity = city;
  cityDisplay.textContent = city;
}

// 显示手动输入城市的表单
function showCityForm() {
  cityFormCard.classList.remove('hidden');
}

// 隐藏手动输入城市的表单
function hideCityForm() {
  cityFormCard.classList.add('hidden');
}

// 尝试使用浏览器的地理位置功能获取用户所在城市
// 如果成功则直接显示天气，否则显示手动输入表单
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

// 根据经纬度反查城市名称
// lat: 纬度
// lon: 经度
async function reverseGeocode(lat, lon) {
  try {
    // 向服务器发送请求，获取对应经纬度的城市名称
    const response = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`);
    if (response.ok) {
      const data = await response.json();
      if (data.city) return data.city;
    }
  } catch (error) {
    // 如果请求过程中出错，也返回空字符串
    return '';
  }
}

// 将用户选择的城市名称保存到服务器
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

// 刷新天气数据，获取当前城市的天气信息并更新页面显示
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

// 渲染天气数据
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
  const airColor = air.color || '#000000';
  aqiValue.style.color = airColor;
  aqiLevel.style.color = airColor;
  pm25Value.style.color = airColor;
  pm10Value.style.color = airColor;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// 获取画布的绘图上下文和尺寸
// 根据设备像素比调整画布分辨率以保证图表清晰
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

// 从一组数值中计算最小值和最大值，并自动增加上下边距，同时支持上下限约束
// 使折线图显示得更自然、更稳定
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

// 通过三次贝塞尔曲线把多个数据点自然连接起来
// 使天气趋势图看起来更柔和
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

// 绘制一条带颜色、圆角和阴影效果的平滑曲线
function drawSeries(ctx, coords, color) {
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

// 根据传入的 24 小时天气预报数据，在Canvas上绘制温度和湿度趋势图
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

  drawSeries(ctx, tempCoords, '#f97316');
  drawSeries(ctx, humidityCoords, '#0ea5e9');

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
