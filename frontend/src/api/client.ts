import axios from 'axios'

// REST/JSON API client (SRS §34 — /api/v1)
// Auth token is attached when available.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('efesms_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  // File uploads: drop the JSON default so the browser sets
  // multipart/form-data with a proper boundary (else the API 415s).
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    const h: any = config.headers
    if (h?.delete) h.delete('Content-Type')
    else if (h) delete h['Content-Type']
  }
  return config
})

// Standard error envelope (SRS §42 ERR-001/002)
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('efesms_token')
      if (window.location.pathname !== '/login') {
        window.location.assign('/login')
      }
    }
    return Promise.reject(err)
  },
)