import Link from "next/link";
import { FraiPhoneFrame } from "../../components/FraiPhoneFrame";

export default function PermissionPage() {
  return (
    <FraiPhoneFrame showNav={false}>
      <div className="frai-page">
        <section className="frai-header-hero compact">
          <div>
            <p>권한 설정</p>
            <h2>카메라/마이크 허용</h2>
          </div>
        </section>

        <section className="frai-block">
          <p className="muted">사진 인식과 대화형 입력을 위해 카메라/마이크 권한이 필요합니다.</p>
          <div className="row two">
            <Link href="/scan" className="frai-inline-link">Take photo</Link>
            <Link href="/chat" className="frai-inline-link">Talk</Link>
          </div>
          <div className="row">
            <Link href="/home" className="frai-inline-link">나중에 설정하고 홈으로 이동</Link>
          </div>
        </section>
      </div>
    </FraiPhoneFrame>
  );
}
