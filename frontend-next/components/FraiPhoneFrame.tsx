import Link from "next/link";
import type { ReactNode } from "react";

export type FraiNavKey = "home" | "inventory" | "recipes" | "shopping" | "notifications";

type Props = {
  children: ReactNode;
  navKey?: FraiNavKey;
  showNav?: boolean;
};

const NAV_ITEMS: Array<{ key: FraiNavKey; href: string; label: string; icon: string }> = [
  { key: "home", href: "/home", label: "홈", icon: "홈" },
  { key: "inventory", href: "/inventory", label: "인벤토리", icon: "재" },
  { key: "recipes", href: "/recipes", label: "레시피", icon: "레" },
  { key: "shopping", href: "/shopping", label: "쇼핑", icon: "쇼" },
  { key: "notifications", href: "/notifications", label: "알림", icon: "알" }
];

export function FraiPhoneFrame({ children, navKey, showNav = true }: Props) {
  return (
    <main className="frai-root">
      <div className="frai-phone">
        <header className="frai-statusbar">
          <span>9:41</span>
          <span className="frai-status-icons">LTE 100%</span>
        </header>

        <section className="frai-screen">{children}</section>

        {showNav ? (
          <nav className="frai-nav">
            {NAV_ITEMS.map((item) => {
              const active = item.key === navKey;
              return (
                <Link key={item.key} href={item.href} className={active ? "active" : ""}>
                  <span>{item.icon}</span>
                  <em>{item.label}</em>
                </Link>
              );
            })}
          </nav>
        ) : null}
      </div>
    </main>
  );
}
