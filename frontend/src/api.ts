
export type User = {
  id: number;
  username: string;
  display_name: string;
  bio: string;
  location: string;
  interests: string[];
  avatar: string | null;
  explorers: number;
  exploring: number;
  posts: number;
  journeys: number;
  following: boolean;
};

export type Post = {
  id: number;
  user_id: number;
  body: string;
  image: string | null;
  location: string;
  topics: string[];
  created_at: string;
  classification?: {
    method: string;
    categories: string[];
  } | null;
  author: User;
  likes: number;
  comments: number;
  liked: boolean;
  saved: boolean;
};

export type Comment = {
  id: number;
  user_id: number;
  post_id: number;
  body: string;
  created_at: string;
  author: User;
};

export type Journey = {
  id: number;
  title: string;
  focus: string;
  style: string;
  owner_id: number;
  partner_id: number | null;
  plan: {
    status: string;
    activities: {
      id: string;
      text: string;
      author_id: number;
    }[];
    note?: string;
  };
};

const API = import.meta.env.VITE_API_URL || "";

export const media = (path?: string | null): string => {
  if (!path) return "";

  if (
    path.startsWith("https://") ||
    path.startsWith("http://") ||
    path.startsWith("blob:") ||
    path.startsWith("data:")
  ) {
    return path;
  }

  return `${API}${path}`;
};

// Existing BYNTRA authentication.
// Keep this until FastAPI supports Appwrite sessions.
export const getToken = (): string =>
  localStorage.getItem("byntra_token") || "";

export const setToken = (value: string): void => {
  localStorage.setItem("byntra_token", value);
};

export const clearToken = (): void => {
  localStorage.removeItem("byntra_token");
};

// Existing FastAPI request helper.
export async function request<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };

  const token = getToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;

  try {
    response = await fetch(`${API}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      "Cannot connect to the BYNTRA server. Start the FastAPI backend."
    );
  }

  if (!response.ok) {
    let error: any = {};

    try {
      error = await response.json();
    } catch {
      // Preserve the HTTP status when no JSON error is returned.
    }

    throw new Error(
      typeof error.detail === "string"
        ? error.detail
        : `Request failed (${response.status})`
    );
  }

  return response.json() as Promise<T>;
}

// HTTP helpers.
export const post = <T = any>(
  path: string,
  data: unknown
): Promise<T> =>
  request<T>(path, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const put = <T = any>(
  path: string,
  data: unknown
): Promise<T> =>
  request<T>(path, {
    method: "PUT",
    body: JSON.stringify(data),
  });

export const remove = (path: string) =>
  request(path, {
    method: "DELETE",
  });

// Existing FastAPI media upload.
// We will migrate this to Appwrite Storage later.
export async function upload(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);

  const result = await request<{ url: string }>("/api/upload", {
    method: "POST",
    body: form,
  });

  return result.url;
}

// Existing WebSocket URL helper.
export const wsUrl = (path: string): string => {
  const origin = API
    ? new URL(API).origin
    : window.location.origin;

  return origin.replace(/^http/, "ws") + path;
};
