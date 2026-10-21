/** Client-side state management for useThemeStore in the Relay web application. */

import { create } from "zustand";

const getInitialTheme = () => {
  const savedTheme = localStorage.getItem("chat-theme");

  if (!savedTheme || savedTheme === "coffee") {
    return "relay";
  }

  return savedTheme;
};

export const useThemeStore = create((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    localStorage.setItem("chat-theme", theme);
    set({ theme });
  },
}));
