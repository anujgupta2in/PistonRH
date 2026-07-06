const API_BASE = "/api";

export const customFetch = async <T>(url: string, options: RequestInit): Promise<T> => {
  const res = await fetch(`${API_BASE}${url}`, { ...options, credentials: "include" });

  if (res.status === 401 && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
};
