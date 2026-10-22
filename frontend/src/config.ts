const defaultHost =
  typeof window !== "undefined" && window.location.hostname && window.location.hostname !== "localhost"
    ? window.location.hostname
    : "localhost";

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  `http://${defaultHost}:4000`;

