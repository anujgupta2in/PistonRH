const API_BASE = "/api";

export const customFetch = async <T>(url: string, options: RequestInit): Promise<T> => {
  const res = await fetch(`${API_BASE}${url}`, { ...options, credentials: "include" });

  // /auth/me is used as a plain "am I logged in?" probe from public pages
  // (e.g. the landing page), where a 401 is an expected, normal state — not
  // a dead session to redirect away from.
  const isAuthProbe = url === "/auth/me";
  if (res.status === 401 && !isAuthProbe && window.location.pathname !== "/login") {
    window.location.assign("/login");
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `${res.status} ${res.statusText}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
};
