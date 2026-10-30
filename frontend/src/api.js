/* api.js — Axios instance with JWT auto-attach & refresh interceptor */
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 10000,
});

// Attach JWT access token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('egpp_access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
let refreshing = false;
let refreshQueue = [];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      if (refreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then(() => api(original));
      }

      original._retry = true;
      refreshing = true;

      try {
        const refreshToken = localStorage.getItem('egpp_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const { data } = await axios.post(`${API_URL}/api/auth/refresh`, { refreshToken });
        localStorage.setItem('egpp_access_token', data.accessToken);

        refreshQueue.forEach(({ resolve }) => resolve());
        refreshQueue = [];
        refreshing = false;

        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshErr) {
        refreshing = false;
        refreshQueue.forEach(({ reject }) => reject(refreshErr));
        refreshQueue = [];
        localStorage.clear();
        window.location.href = '/auth';
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
export { API_URL };
