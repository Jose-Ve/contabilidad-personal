import { supabase, markSupabaseActivity } from './supabaseClient.js';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

async function getToken() {
  const {
    data: { session }
  } = await supabase.auth.getSession();
  markSupabaseActivity();
  return session?.access_token ?? null;
}

async function parseResponse(response) {
  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn('No se pudo parsear la respuesta JSON', error);
    return text;
  }
}

export async function apiFetch(path, { method = 'GET', body, headers = {}, signal } = {}) {
  if (!API_BASE_URL) {
    throw new Error('VITE_API_BASE_URL no está definido. Revisa frontend/.env.local');
  }

  const token = await getToken();
  const finalHeaders = {
    Accept: 'application/json',
    ...headers
  };

  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }

  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    body,
    headers: finalHeaders,
    signal
  });
  markSupabaseActivity();

  if (!response.ok) {
    const errorPayload = await parseResponse(response);
    const message = errorPayload?.message ?? `Error ${response.status}`;
    const error = new Error(message);
    error.response = response;
    error.payload = errorPayload;
    throw error;
  }

  return parseResponse(response);
}
