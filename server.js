const express = require('express');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const fetch = require('node-fetch');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_PATH = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readDb() {
  try {
    const text = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(text || '{}');
  } catch (error) {
    return { location: '', weather: null, air: null, updatedAt: null };
  }
}

function writeDb(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function aqiLevel(aqi) {
  if (aqi <= 50) return { level: '优', color: '#37b24d' };
  if (aqi <= 100) return { level: '良', color: '#74b816' };
  if (aqi <= 150) return { level: '轻度污染', color: '#f59f00' };
  if (aqi <= 200) return { level: '中度污染', color: '#f76707' };
  if (aqi <= 300) return { level: '重度污染', color: '#d6336c' };
  return { level: '严重污染', color: '#842029' };
}

function createHourlyForecast(temp, humidity) {
  const result = [];
  for (let i = 0; i < 7; i += 1) {
    const hour = `${(8 + i).toString().padStart(2, '0')}:00`;
    result.push({
      hour,
      temp: Math.round(temp + (Math.sin(i / 2) * 3)),
      humidity: Math.min(100, Math.max(15, humidity + (Math.cos(i / 3) * 8)))
    });
  }
  return result;
}

function mockData(city) {
  const baseTemp = 15 + Math.floor(Math.random() * 10);
  const baseHumidity = 45 + Math.floor(Math.random() * 30);
  const pm25 = 40 + Math.floor(Math.random() * 120);
  const pm10 = Math.max(pm25, 60 + Math.floor(Math.random() * 100));
  const aqi = Math.min(300, Math.max(20, Math.round((pm25 + pm10) / 2)));
  const aqiInfo = aqiLevel(aqi);

  return {
    weather: {
      city,
      condition: ['晴', '多云', '小雨', '阴', '雾霾', '霾'].sort(() => 0.5 - Math.random())[0],
      temperature: baseTemp,
      humidity: baseHumidity,
      wind: 2 + Math.floor(Math.random() * 4),
      feels_like: baseTemp + (Math.random() > 0.5 ? -1 : 1),
      sunrise: '06:12',
      sunset: '18:35',
      forecast: createHourlyForecast(baseTemp, baseHumidity)
    },
    air: {
      pm25,
      pm10,
      aqi,
      level: aqiInfo.level,
      advice: ''
    }
  };
}

function airAdvice(aqi) {
  if (aqi <= 50) return '空气质量优，适宜外出。';
  if (aqi <= 100) return '空气质量良，敏感人群应适当注意。';
  if (aqi <= 150) return '轻度污染，建议减少户外剧烈运动。';
  if (aqi <= 200) return '中度污染，建议佩戴口罩并减少外出。';
  if (aqi <= 300) return '重度污染，尽量待在室内，关闭门窗。';
  return '严重污染，建议尽量避免外出。';
}

async function fetchBaiduWeather(city) {
  const apiKey = process.env.WEATHER_API_KEY;
  const url = `http://api.map.baidu.com/telematics/v3/weather?location=${encodeURIComponent(city)}&output=json&ak=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    return { error: `Baidu 天气 API 请求失败：${res.status} ${body}` };
  }

  const json = await res.json();
  if (json.status !== 'success') {
    return { error: `Baidu 天气 API 错误：${json.status} ${json.message || ''}` };
  }

  const result = json.results?.[0];
  if (!result) {
    return { error: 'Baidu 天气 API 返回数据格式异常' };
  }

  const weatherData = result.weather_data?.[0] || {};
  const pm25 = Number(result.pm25 || 0);
  const pm10 = pm25 ? Math.max(0, Math.round(pm25 * 1.3)) : 0;
  const aqi = pm25 ? Math.min(300, Math.max(0, Math.round((pm25 + pm10) / 2))) : 0;
  const aqiInfo = aqiLevel(aqi);
  const tempMatch = weatherData.temperature?.match(/-?\d+/);
  const temperature = tempMatch ? Number(tempMatch[0]) : 0;

  return {
    weather: {
      city: result.currentCity || city,
      condition: weatherData.weather || weatherData.wind || '晴',
      temperature,
      humidity: 0,
      wind: weatherData.wind || '--',
      feels_like: temperature,
      sunrise: '--',
      sunset: '--',
      forecast: (result.weather_data || []).slice(0, 7).map((item, index) => ({
        hour: `${8 + index}:00`,
        temp: Number(item.temperature?.match(/-?\d+/)?.[0] ?? 0),
        humidity: 50 + (index % 2) * 10
      }))
    },
    air: {
      pm25,
      pm10,
      aqi,
      level: aqiInfo.level,
      advice: airAdvice(aqi)
    }
  };
}

//百度地图逆地理编码
async function fetchBaiduGeocode(lat, lon) {
  const apiKey = process.env.GEOCODE_API_KEY;
  if (!apiKey) {
    return { error: 'GEOCODE_API_KEY 未配置，请在 .env 中设置' };
  }

  const url = `http://api.map.baidu.com/reverse_geocoding/v3/?ak=${apiKey}&output=json&location=${lat},${lon}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    return { error: `Baidu 逆地理编码请求失败：${res.status} ${body}` };
  }

  const json = await res.json();
  if (json.status !== 0) {
    return { error: `Baidu 逆地理编码错误：${json.status} ${json.message || ''}` };
  }

  const address = json.result?.addressComponent || {};
  return {
    city: address.city || address.district || address.province || ''
  };
}

// 和风天气数据获取
async function fetchQWeatherData(city) {
  const apiKey = process.env.WEATHER_API_KEY;
  const apiHost = process.env.WEATHER_API_HOST;

  if (!apiKey) {
    return { error: 'WEATHER_API_KEY 未配置，请在 .env 中设置和风天气 API Key' };
  }

  if (!apiHost) {
    return { error: 'WEATHER_API_HOST 未配置，请在 .env 中设置和风天气专属 API Host' };
  }

  try {
    const normalizedHost = apiHost
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '');

    const baseUrl = `https://${normalizedHost}`;

    async function qweatherGet(pathname, params = {}) {
      const url = new URL(`${baseUrl}${pathname}`);

      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      });

      console.log('[QWeather] 请求路径:', pathname);
      console.log('[QWeather] 请求参数:', params);

      const res = await fetch(url.toString(), {
        headers: {
          'X-QW-Api-Key': apiKey
        }
      });

      const text = await res.text();

      let json;
      try {
        json = JSON.parse(text);
      } catch (error) {
        console.error('[QWeather] 返回内容不是 JSON，前 200 字符:', text.slice(0, 200));
        throw new Error('和风天气返回内容不是 JSON，请检查 WEATHER_API_HOST 是否正确');
      }

      if (!res.ok) {
        console.error('[QWeather] HTTP 请求失败:', {
          status: res.status,
          body: json
        });
        throw new Error(`和风天气 API 请求失败：HTTP ${res.status}`);
      }

      return json;
    }

    function parseAirData(airData) {
      if (!airData) {
        return {
          pm25: 0,
          pm10: 0,
          aqi: 50,
          category: '优'
        };
      }

      // 兼容旧版 /v7/air/now
      if (airData.now) {
        return {
          pm25: Number(airData.now.pm2p5 || 0),
          pm10: Number(airData.now.pm10 || 0),
          aqi: Number(airData.now.aqi || 50),
          category: airData.now.category || ''
        };
      }

      // 兼容新版 /airquality/v1/current/{lat}/{lon}
      const pollutants = airData.pollutants || [];
      const indexes = airData.indexes || [];

      const findPollutant = (code) => {
        const item = pollutants.find((p) => p.code === code);
        return Number(item?.concentration?.value || 0);
      };

      const aqiIndex =
        indexes.find((item) => item.code === 'cn') ||
        indexes.find((item) => item.code === 'us-epa') ||
        indexes.find((item) => item.code === 'qaqi') ||
        indexes[0];

      return {
        pm25: findPollutant('pm2p5'),
        pm10: findPollutant('pm10'),
        aqi: Number(aqiIndex?.aqi || 50),
        category: aqiIndex?.category || ''
      };
    }

    console.log(`[QWeather] 请求城市: ${city}`);

    // 1. 先用城市名查询 LocationID
    const cityData = await qweatherGet('/geo/v2/city/lookup', {
      location: city,
      range: 'cn',
      number: 1,
      lang: 'zh'
    });

    if (cityData.code !== '200') {
      return {
        error: `和风天气城市查询失败：code=${cityData.code}`
      };
    }

    if (!Array.isArray(cityData.location) || cityData.location.length === 0) {
      return {
        error: `未找到城市：${city}`
      };
    }

    const location = cityData.location[0];

    console.log('[QWeather] 城市匹配结果:', {
      name: location.name,
      id: location.id,
      adm1: location.adm1,
      adm2: location.adm2,
      lat: location.lat,
      lon: location.lon
    });

    // 2. 用 LocationID 查询实时天气
    const weatherData = await qweatherGet('/v7/weather/now', {
      location: location.id,
      lang: 'zh',
      unit: 'm'
    });

    if (weatherData.code !== '200') {
      console.error('[QWeather] 天气 API 返回错误:', weatherData);
      return {
        error: `和风天气实时天气 API 错误 ${weatherData.code}：${weatherData.fxLink || city + ' 城市可能不存在或无效'}`
      };
    }

    // 3. 查询空气质量
    let airData = null;

    try {
      // 新版空气质量接口：纬度、经度
      airData = await qweatherGet(
        `/airquality/v1/current/${Number(location.lat).toFixed(2)}/${Number(location.lon).toFixed(2)}`,
        {
          lang: 'zh'
        }
      );
    } catch (error) {
      console.warn('[QWeather] 新版空气质量接口失败，尝试旧版 /v7/air/now:', error.message);

      try {
        // 旧版空气质量接口兜底
        airData = await qweatherGet('/v7/air/now', {
          location: location.id,
          lang: 'zh'
        });
      } catch (fallbackError) {
        console.warn('[QWeather] 空气质量接口均失败，使用默认 AQI 数据:', fallbackError.message);
      }
    }

    const now = weatherData.now || {};
    const parsedAir = parseAirData(airData);

    const pm25 = parsedAir.pm25;
    const pm10 = parsedAir.pm10;
    const aqi = parsedAir.aqi;
    const aqiInfo = aqiLevel(aqi);

    const temperature = Number(now.temp || 20);
    const humidity = Number(now.humidity || 50);

    console.log(`[QWeather] 返回数据: ${location.name} ${temperature}℃ AQI ${aqi}`);

    return {
      weather: {
        city: location.name || city,
        condition: now.text || '晴',
        temperature,
        humidity,
        wind: `${now.windDir || ''} ${now.windScale || ''}级`.trim() || `${now.windSpeed || 0} m/s`,
        feels_like: Number(now.feelsLike || temperature),
        sunrise: '--',
        sunset: '--',
        forecast: createHourlyForecast(temperature, humidity)
      },
      air: {
        pm25,
        pm10,
        aqi,
        level: aqiInfo.level,
        advice: airAdvice(aqi)
      }
    };
  } catch (error) {
    console.error('[QWeather] 请求异常:', error);
    return {
      error: `和风天气 API 请求异常：${error.message}`
    };
  }
}

app.post('/api/location', (req, res) => {
  const city = (req.body.city || '').trim();
  if (!city) {
    return res.status(400).json({ error: 'city 参数不能为空' });
  }

  const db = readDb();
  db.location = city;
  db.updatedAt = new Date().toISOString();
  writeDb(db);

  return res.json({ success: true, city });
});

app.get('/api/location', (req, res) => {
  const db = readDb();
  return res.json({ city: db.location || '', updatedAt: db.updatedAt || null });
});

app.get('/api/geocode', async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!lat || !lon) {
    return res.status(400).json({ error: '缺少 lat 或 lon 参数' });
  }

  const result = await fetchBaiduGeocode(lat, lon);
  if (result.error) {
    return res.status(502).json({ error: result.error });
  }

  return res.json(result);
});

app.get('/api/weather', async (req, res) => {
  const city = (req.query.city || readDb().location || '').trim();
  if (!city) {
    return res.status(400).json({ error: '缺少 city 参数' });
  }

  const useMock = process.env.USE_MOCK === 'true';
  const result = useMock ? mockData(city) : await fetchQWeatherData(city);

  if (result.error) {
    return res.status(502).json({ error: result.error });
  }

  const db = readDb();
  db.location = city;
  db.weather = result.weather;
  db.air = result.air;
  db.updatedAt = new Date().toISOString();
  writeDb(db);

  return res.json({ city, weather: result.weather, air: result.air });
});

app.get('/api/data', (req, res) => {
  const db = readDb();
  return res.json(db);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
