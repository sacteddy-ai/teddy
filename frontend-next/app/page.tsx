import Link from "next/link";
import { FraiPhoneFrame } from "../components/FraiPhoneFrame";

export default function WelcomePage() {
  return (
    <FraiPhoneFrame showNav={false}>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#FFFEF7" }}>
        <div
          style={{
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "40px 24px 24px",
            background: "#FDE74C",
            borderRadius: "0 0 32px 32px"
          }}
        >
          <div
            style={{
              width: "72px",
              height: "72px",
              background: "#FFFFFF",
              borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
              marginBottom: "12px"
            }}
          >
            <div style={{ width: "30px", height: "30px", background: "#FF8C42", borderRadius: "50%" }} />
          </div>
          <h1 style={{ margin: 0, fontSize: "46px", fontWeight: 800, color: "#2C2C2C", letterSpacing: "-0.5px" }}>Frai</h1>
          <p style={{ margin: "8px 0 0", fontSize: "18px", color: "#555", textAlign: "center" }}>
            Frai가 냉장고를 정리해줄게요 ❤️
          </p>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px 16px", gap: "14px" }}>
          <p style={{ fontSize: "18px", color: "#888", textAlign: "center", margin: 0 }}>냉장고 재료를 어떻게 추가할까요?</p>

          <Link
            href="/scan"
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: "14px",
              padding: "18px",
              borderRadius: "20px",
              textAlign: "left",
              background: "#FDE74C",
              boxShadow: "0 4px 16px rgba(253,231,76,0.4)",
              border: "2px solid #F2DC4B"
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                background: "#FFFFFF",
                borderRadius: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "27px",
                flexShrink: 0,
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)"
              }}
            >
              📷
            </div>
            <div>
              <div style={{ fontSize: "30px", fontWeight: 800, color: "#2C2C2C", lineHeight: 1.15 }}>냉장고 사진 찍기</div>
              <div style={{ fontSize: "23px", color: "#555", marginTop: "4px", lineHeight: 1.2 }}>사진 한 장으로 재료를 바로 인식해요</div>
            </div>
            <div style={{ marginLeft: "auto", color: "#2C2C2C", opacity: 0.5, fontSize: "20px" }}>›</div>
          </Link>

          <Link
            href="/chat"
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: "14px",
              padding: "18px",
              borderRadius: "20px",
              textAlign: "left",
              background: "#FFFFFF",
              border: "2px solid #F0EFE8",
              boxShadow: "0 2px 12px rgba(0,0,0,0.04)"
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                background: "#FDE74C",
                borderRadius: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "27px",
                flexShrink: 0
              }}
            >
              💬
            </div>
            <div>
              <div style={{ fontSize: "30px", fontWeight: 800, color: "#2C2C2C", lineHeight: 1.15 }}>대화로 추가하기</div>
              <div style={{ fontSize: "23px", color: "#888", marginTop: "4px", lineHeight: 1.2 }}>말하듯 입력하면 AI가 정리해드려요</div>
            </div>
            <div style={{ marginLeft: "auto", color: "#888", fontSize: "20px" }}>›</div>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "2px 0" }}>
            <div style={{ flex: 1, height: "1px", background: "#F0EFE8" }} />
            <span style={{ fontSize: "14px", color: "#BBBBBB" }}>또는</span>
            <div style={{ flex: 1, height: "1px", background: "#F0EFE8" }} />
          </div>

          <Link
            href="/home"
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: "16px",
              textAlign: "center",
              background: "#F5F4EE",
              fontSize: "24px",
              fontWeight: 700,
              color: "#888"
            }}
          >
            일단 둘러볼게요
          </Link>

          <div style={{ display: "flex", justifyContent: "center", gap: "24px", marginTop: "auto", paddingTop: "10px" }}>
            {[
              { icon: "⏰", text: "유통기한 알림", href: "/notifications" },
              { icon: "🍳", text: "레시피 추천", href: "/recipes" },
              { icon: "🛒", text: "쇼핑 연결", href: "/shopping" }
            ].map((f) => (
              <Link key={f.text} href={f.href} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                <span style={{ fontSize: "22px" }}>{f.icon}</span>
                <span style={{ fontSize: "12px", color: "#888", fontWeight: 600 }}>{f.text}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </FraiPhoneFrame>
  );
}
