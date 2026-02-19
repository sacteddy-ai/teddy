import Link from "next/link";
import { FraiPhoneFrame } from "../components/FraiPhoneFrame";

export default function WelcomePage() {
  return (
    <FraiPhoneFrame showNav={false}>
      <div className="frai-welcome">
        <section className="frai-welcome-hero">
          <div className="frai-egg-logo" aria-hidden>
            <div />
          </div>
          <h1>Frai</h1>
          <p>Frai가 냉장고를 정리해드릴게요.</p>
        </section>

        <p className="frai-welcome-question">냉장고 재료를 어떻게 추가할까요?</p>

        <div className="frai-welcome-actions">
          <Link href="/scan" className="frai-action-card primary">
            <div className="icon">CAM</div>
            <div>
              <strong>냉장고 사진 찍기</strong>
              <span>사진 한 장으로 재료를 바로 인식해요</span>
            </div>
          </Link>

          <Link href="/chat" className="frai-action-card">
            <div className="icon">TALK</div>
            <div>
              <strong>대화로 추가하기</strong>
              <span>말하거나 입력하면 AI가 정리해드려요</span>
            </div>
          </Link>
        </div>

        <div className="frai-divider">
          <div />
          <span>또는</span>
          <div />
        </div>

        <Link href="/home" className="frai-skip-btn">
          일단 둘러볼게요
        </Link>

        <div className="frai-welcome-foot">
          <div>
            <strong>Notifications</strong>
          </div>
          <div>
            <strong>Recipe Recommendations</strong>
          </div>
          <div>
            <strong>Shopping Suggestions</strong>
          </div>
        </div>
      </div>
    </FraiPhoneFrame>
  );
}
