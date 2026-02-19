"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type FraiNavKey = "home" | "inventory" | "recipes" | "shopping" | "settings";

type Props = {
  children: ReactNode;
  navKey?: FraiNavKey;
  showNav?: boolean;
};

const NAV_ITEMS: Array<{ key: FraiNavKey; href: string; label: string }> = [
  { key: "home", href: "/home", label: "홈" },
  { key: "inventory", href: "/inventory", label: "재고" },
  { key: "recipes", href: "/recipes", label: "레시피" },
  { key: "shopping", href: "/shopping", label: "쇼핑" },
  { key: "settings", href: "/settings", label: "설정" }
];

function iconFor(key: FraiNavKey, active: boolean) {
  if (key === "home") {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path
          d="M3 9.5L11 3L19 9.5V19C19 19.55 18.55 20 18 20H14V14H8V20H4C3.45 20 3 19.55 3 19V9.5Z"
          fill={active ? "#2C2C2C" : "none"}
          stroke={active ? "#2C2C2C" : "#888888"}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (key === "inventory") {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect
          x="3"
          y="8"
          width="16"
          height="12"
          rx="2"
          fill={active ? "#2C2C2C" : "none"}
          stroke={active ? "#2C2C2C" : "#888888"}
          strokeWidth="1.8"
        />
        <path
          d="M7 8V7C7 4.79 8.79 3 11 3C13.21 3 15 4.79 15 7V8"
          stroke={active ? "#2C2C2C" : "#888888"}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path d="M8 13H14" stroke={active ? "#FDE74C" : "#BBBBBB"} strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (key === "recipes") {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle
          cx="11"
          cy="8"
          r="4.5"
          fill={active ? "#2C2C2C" : "none"}
          stroke={active ? "#2C2C2C" : "#888888"}
          strokeWidth="1.8"
        />
        <path
          d="M3 19C3 15.69 6.58 13 11 13C15.42 13 19 15.69 19 19"
          stroke={active ? "#2C2C2C" : "#888888"}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path d="M8 8H14" stroke={active ? "#FDE74C" : "#BBBBBB"} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (key === "shopping") {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path
          d="M2 2H4L6.5 14H17L19 7H5.5"
          stroke={active ? "#2C2C2C" : "#888888"}
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="8.5" cy="17.5" r="1.5" fill={active ? "#2C2C2C" : "#888888"} />
        <circle cx="15.5" cy="17.5" r="1.5" fill={active ? "#2C2C2C" : "#888888"} />
      </svg>
    );
  }

  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <circle cx="11" cy="11" r="3" stroke={active ? "#2C2C2C" : "#888888"} strokeWidth="1.8" />
      <path
        d="M11 2.5V4.5M11 17.5V19.5M4.22 4.22L5.64 5.64M16.36 16.36L17.78 17.78M2.5 11H4.5M17.5 11H19.5M4.22 17.78L5.64 16.36M16.36 5.64L17.78 4.22"
        stroke={active ? "#2C2C2C" : "#888888"}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FraiPhoneFrame({ children, navKey, showNav = true }: Props) {
  const pathname = usePathname();
  const activeFromPath = (() => {
    if (pathname.startsWith("/home")) return "home" as const;
    if (pathname.startsWith("/inventory")) return "inventory" as const;
    if (pathname.startsWith("/recipes")) return "recipes" as const;
    if (pathname.startsWith("/shopping")) return "shopping" as const;
    if (pathname.startsWith("/settings") || pathname.startsWith("/notifications") || pathname.startsWith("/alerts")) {
      return "settings" as const;
    }
    return undefined;
  })();
  const activeKey = navKey || activeFromPath;

  return (
    <main className="frai-root">
      <div
        className="frai-phone"
        style={{
          width: "390px",
          height: "844px",
          borderRadius: "48px",
          boxShadow: "0 40px 80px rgba(0,0,0,0.25), 0 0 0 12px #1a1a1a, 0 0 0 13px #333",
          maxWidth: "100vw"
        }}
      >
        <header
          className="frai-statusbar"
          style={{
            background: "#FFFEF7",
            height: "36px",
            padding: "8px 22px 4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "14px",
            fontWeight: 600
          }}
        >
          <span style={{ color: "#2C2C2C" }}>9:41</span>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
              <rect x="0" y="3" width="3" height="9" rx="1" fill="#2C2C2C" />
              <rect x="4.5" y="2" width="3" height="10" rx="1" fill="#2C2C2C" />
              <rect x="9" y="0" width="3" height="12" rx="1" fill="#2C2C2C" />
              <rect x="13.5" y="0" width="2.5" height="12" rx="1" fill="#2C2C2C" opacity="0.3" />
            </svg>
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
              <path d="M8 2.5C10.5 2.5 12.7 3.6 14.2 5.4L15.5 4C13.7 1.9 11 0.5 8 0.5C5 0.5 2.3 1.9 0.5 4L1.8 5.4C3.3 3.6 5.5 2.5 8 2.5Z" fill="#2C2C2C" />
              <path d="M8 5.5C9.7 5.5 11.2 6.2 12.3 7.4L13.6 6C12.2 4.5 10.2 3.5 8 3.5C5.8 3.5 3.8 4.5 2.4 6L3.7 7.4C4.8 6.2 6.3 5.5 8 5.5Z" fill="#2C2C2C" />
              <circle cx="8" cy="10" r="1.5" fill="#2C2C2C" />
            </svg>
            <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
              <rect x="0.5" y="0.5" width="21" height="11" rx="3.5" stroke="#2C2C2C" strokeOpacity="0.35" />
              <rect x="2" y="2" width="16" height="8" rx="2" fill="#2C2C2C" />
              <path d="M23 4.5V7.5C23.8 7.2 24.5 6.7 24.5 6C24.5 5.3 23.8 4.8 23 4.5Z" fill="#2C2C2C" fillOpacity="0.4" />
            </svg>
          </div>
        </header>

        <section className="frai-screen">{children}</section>

        {showNav ? (
          <nav
            className="frai-nav"
            style={{
              background: "#FFFFFF",
              borderTop: "1px solid #F0EFE8",
              paddingBottom: "16px",
              boxShadow: "0 -4px 20px rgba(0,0,0,0.06)",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))"
            }}
          >
            {NAV_ITEMS.map((item) => {
              const active = item.key === activeKey;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={active ? "active" : ""}
                  style={{
                    minHeight: "56px",
                    border: "none",
                    background: "transparent",
                    borderRadius: "12px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "2px",
                    color: active ? "#2C2C2C" : "#888888"
                  }}
                >
                  {iconFor(item.key, active)}
                  <em
                    style={{
                      marginTop: "1px",
                      fontSize: "11px",
                      fontStyle: "normal",
                      fontWeight: active ? 600 : 400,
                      lineHeight: 1.3
                    }}
                  >
                    {item.label}
                  </em>
                  {active ? (
                    <span
                      style={{
                        display: "inline-block",
                        width: "4px",
                        height: "4px",
                        borderRadius: "999px",
                        background: "#FDE74C",
                        marginTop: "1px"
                      }}
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
    </main>
  );
}
