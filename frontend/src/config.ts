const host =
  typeof window !== "undefined" && window.location.hostname
    ? window.location.hostname
    : "192.168.29.188";

export const API_BASE_URL =
  typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
    ? "http://localhost:4000"
    : (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || `http://${host}:4000`);



