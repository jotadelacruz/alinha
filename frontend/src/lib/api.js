import { supabase } from './supabaseClient';

const API_URL = import.meta.env.VITE_API_URL;

class ApiError extends Error {
  constructor(status, body) {
    super(typeof body === 'string' ? body : body?.detail || 'Erro na API');
    this.status = status;
    this.body = body;
  }
}

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new ApiError(401, 'Sessão expirada, faça login novamente.');
  return { Authorization: `Bearer ${token}` };
}

async function request(path, { method = 'GET', body, params } = {}) {
  const headers = await authHeader();
  let url = `${API_URL}${path}`;
  if (params) {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    );
    if ([...query].length) url += `?${query.toString()}`;
  }

  const resp = await fetch(url, {
    method,
    headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    let payload;
    try {
      payload = await resp.json();
    } catch {
      payload = await resp.text();
    }
    throw new ApiError(resp.status, payload);
  }
  if (resp.status === 204) return null;
  return resp.json();
}

export const api = {
  get: (path, params) => request(path, { params }),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  delete: (path, params) => request(path, { method: 'DELETE', params }),
};

export { ApiError };
