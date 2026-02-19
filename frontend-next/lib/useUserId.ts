"use client";

import { useEffect, useState } from "react";

const KEY = "frai_user_id";

export function useUserId(defaultValue = "demo-user") {
  const [userId, setUserId] = useState(defaultValue);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved && saved.trim()) {
        setUserId(saved.trim());
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, userId || defaultValue);
    } catch {}
  }, [userId, defaultValue]);

  return { userId, setUserId };
}
