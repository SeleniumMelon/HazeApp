const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const fetch = require('node-fetch');

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_PATH = path.join(__dirname, 'data.json');

const corsOrigin = process.env.CORS_ORIGIN || '*';

app.use(cors({
  origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map(item => item.trim()),
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 从 data.json 中读取当前保存的城市和天气数据
function readDb() {
  try {
    const text = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(text || '{}');
  } catch (error) {
    return { location: '', weather: null, air: null, updatedAt: null };
  }
}

// 将数据写入 data.json
function writeDb(data) {
  fs.writeFileSync(
    DATA_PATH, 
    JSON.stringify(data, null, 2), 
    'utf8');
}

// 根据 AQI 数值返回对应的空气质量等级和颜色
function aqiLevel(aqi) {
  if (aqi <= 50) return { level: '优', color: '#50e36b' };
  if (aqi <= 100) return { level: '良', color: '#81cf14' };
  if (aqi <= 150) return { level: '轻度污染', color: '#cd9d45' };
  if (aqi <= 200) return { level: '中度污染', color: '#e07128' };
  if (aqi <= 300) return { level: '重度污染', color: '#ac310e' };
  return { level: '严重污染', color: '#7f0a14' };
}

// 生成模拟数据，供开发和测试使用
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
      forecast: []
    },
    air: {
      pm25,
      pm10,
      aqi,
      level: aqiInfo.level,
      color: aqiInfo.color,
      advice: ''
    }
  };
}

// 根据 AQI 数值返回针对不同空气质量等级的健康建议
function airAdvice(aqi) {
  if (aqi <= 50) return '空气质量优，适宜外出活动';
  if (aqi <= 100) return '空气质量良，适宜正常出行';
  if (aqi <= 150) return '轻度污染，敏感人群应减少户外活动';
  if (aqi <= 200) return '中度污染，建议佩戴口罩并减少外出';
  if (aqi <= 300) return '重度污染，尽量待在室内，关闭门窗';
  return '严重污染，建议尽量避免外出';
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

    // 封装一个函数来发送 GET 请求到和风天气 API
    // 自动添加 API Key 和处理错误
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

    // 解析空气质量数据
    function parseAirData(airData) {
      // 如果没有拿到空气质量数据，就返回一组默认数据
      if (!airData) {
        return {
          pm25: null,
          pm10: null,
          aqi: null,
          category: '暂无数据'
        };
      }

      // 兼容旧版 /v7/air/now
      if (airData.now) {
        return {
          pm25: airData.now.pm2p5 ? Number(airData.now.pm2p5) : null,
          pm10: airData.now.pm10 ? Number(airData.now.pm10) : null,
          aqi: airData.now.aqi ? Number(airData.now.aqi) : null,
          category: airData.now.category || '暂无数据'
        };
      }

      // 兼容新版 /airquality/v1/current/{lat}/{lon}
      const pollutants = airData.pollutants || [];
      const indexes = airData.indexes || [];

      const findPollutant = (code) => {
        const item = pollutants.find((p) => p.code === code);
        return Number(item?.concentration?.value || null);
      };

      const aqiIndex =
        indexes.find((item) => item.code === 'cn') ||
        indexes.find((item) => item.code === 'us-epa') ||
        indexes.find((item) => item.code === 'qaqi') ||
        indexes[0];

      return {
        pm25: findPollutant('pm2p5'),
        pm10: findPollutant('pm10'),
        aqi: Number(aqiIndex?.aqi || null),
        category: aqiIndex?.category || '暂无数据'
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

    // 4. 查询日出日落
    const dailyData = await qweatherGet('/v7/weather/3d', {
      location: location.id,
      lang: 'zh',
      unit: 'm'
    });

    // 5. 请求实时天气
    const hourlyData = await qweatherGet('/v7/weather/24h', {
      location: location.id,
      lang: 'zh',
      unit: 'm'
    });

    if (hourlyData.code !== '200') {
      console.warn('[QWeather] 24小时预报 API 返回错误:', hourlyData);
    }

    const now = weatherData.now || {};
    const parsedAir = parseAirData(airData);

    const pm25 = parsedAir.pm25;
    const pm10 = parsedAir.pm10;
    const aqi = parsedAir.aqi;
    const aqiInfo = aqiLevel(aqi);

    const temperature = Number(now.temp || null);
    const humidity = Number(now.humidity || null);
    const today = dailyData.daily?.[0] || {};

    const forecast = (hourlyData.hourly || [])
      .slice(0, 24)
      .map((item) => {
        const fxTime = item.fxTime || '';
        const date = new Date(fxTime);

        let hour = '--:--';

        if (!Number.isNaN(date.getTime())) {
          hour = date.toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          });
        } else if (fxTime) {
          hour = String(fxTime).slice(11, 16) || '--:--';
        }

        return {
          time: fxTime,
          hour,
          temp: Number(item.temp),
          humidity: Number(item.humidity),
          condition: item.text || ''
        };
      })
      .filter((item) => Number.isFinite(item.temp) && Number.isFinite(item.humidity));

    console.log(`[QWeather] 返回数据: ${location.name} ${temperature}℃ AQI ${aqi}`);

    return {
      weather: {
        city: location.name || city,
        condition: now.text || '--',
        temperature,
        humidity,
        wind: `${now.windDir || ''} ${now.windScale || ''}级`.trim() || `${now.windSpeed || 0} m/s`,
        feels_like: Number(now.feelsLike || temperature),
        sunrise: today.sunrise || '--',
        sunset: today.sunset || '--',
        forecast
      },
      air: {
        pm25,
        pm10,
        aqi,
        level: aqiInfo.level,
        color: aqiInfo.color,
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

// 定义 POST /api/location 接口，用于更新当前城市
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

// 定义 GET /api/location 接口，返回当前保存的城市和上次更新时间
app.get('/api/location', (req, res) => {
  const db = readDb();
  return res.json({ city: db.location || '', updatedAt: db.updatedAt || null });
});

// 定义 GET /api/geocode 接口，根据经纬度返回对应的城市名称
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

// 定义 GET /api/weather 接口，根据 city 参数返回天气和空气质量数据
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

// 定义 GET /api/data 接口，返回当前保存的城市、天气和空气质量数据
app.get('/api/data', (req, res) => {
  const db = readDb();
  return res.json(db);
});

// 对于所有其他 GET 请求，返回 public/index.html，让前端路由处理页面显示
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 健康检查接口
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'HazeApp backend is running',
    time: new Date().toISOString()
  });
});

// 启动服务器
app.listen(PORT, HOST, () => {
  console.log(`Server started on http://${HOST}:${PORT}`);
});
