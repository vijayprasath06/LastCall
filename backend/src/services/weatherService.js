/**
 * Weather Service — OpenWeatherMap + Redis Cache [Worker 5]
 *
 * Fetches weather for active vendor cities every 30 minutes.
 * Cached in Redis: weather:{city} EX 2100 (35 minutes)
 *
 * Used by RUS Calculator (F5 weather mobility factor).
 * 'bad' = heavy rain, thunderstorm, extreme heat (>40°C), heavy snow
 * 'good' = everything else
 */

const https = require('https');
const redis = require('../config/redis');

const API_KEY = process.env.OPENWEATHER_API_KEY;
const BASE_URL = 'https://api.openweathermap.org/data/2.5/weather';
const CACHE_TTL = 2100; // 35 minutes in seconds

/**
 * Classify raw OpenWeatherMap response into 'good' | 'bad'.
 * 'bad' = reduces RUS via weatherModifier = 0.85
 */
function classifyWeather(data) {
  const weatherId = data.weather?.[0]?.id;
  const tempCelsius = data.main?.temp - 273.15; // Kelvin to Celsius

  // OpenWeatherMap condition codes:
  // 200-232: Thunderstorm | 300-321: Drizzle | 500-531: Rain
  // 600-622: Snow | 800: Clear | 801-804: Clouds
  if (!weatherId) return 'good';

  const isBadWeather =
    (weatherId >= 200 && weatherId <= 232) || // Thunderstorm
    (weatherId >= 502 && weatherId <= 531) || // Heavy/extreme rain
    (weatherId >= 600 && weatherId <= 622) || // Snow
    tempCelsius > 40;                          // Extreme heat

  return isBadWeather ? 'bad' : 'good';
}

/**
 * Fetch weather condition for a city, with Redis caching.
 * @param {string} city - City name (e.g. 'Chennai')
 * @returns {Promise<'good'|'bad'>}
 */
async function getWeatherCondition(city) {
  const cacheKey = `weather:${city.toLowerCase()}`;

  // Check Redis cache first
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  // If no API key configured, default to 'good'
  if (!API_KEY) {
    return 'good';
  }

  return new Promise((resolve) => {
    const url = `${BASE_URL}?q=${encodeURIComponent(city)},IN&appid=${API_KEY}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', async () => {
        try {
          const parsed = JSON.parse(data);
          const condition = classifyWeather(parsed);
          await redis.set(cacheKey, condition, 'EX', CACHE_TTL);
          resolve(condition);
        } catch {
          resolve('good'); // Fallback on parse error
        }
      });
    }).on('error', () => resolve('good')); // Fallback on network error
  });
}

/**
 * Refresh weather cache for a list of cities (called by Worker 5).
 * @param {string[]} cities
 */
async function refreshWeatherForCities(cities) {
  const unique = [...new Set(cities.map((c) => c.toLowerCase()))];
  await Promise.all(unique.map((city) => getWeatherCondition(city)));
  console.log(`[WeatherService] Refreshed weather for: ${unique.join(', ')}`);
}

module.exports = { getWeatherCondition, refreshWeatherForCities };
