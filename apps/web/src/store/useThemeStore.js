/** Client-side state management for useThemeStore in the Relay web application. */

import { create } from "zustand";
import { THEMES } from "../constants";

const getInitialTheme = () => {
  const savedTheme = localStorage.getItem("chat-theme");
  return THEMES.includes(savedTheme) ? savedTheme : "light";
};

export const useThemeStore = create((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    const nextTheme = THEMES.includes(theme) ? theme : "light";
    localStorage.setItem("chat-theme", nextTheme);
    set({ theme: nextTheme });
  },
}));
