"use client";

import { useEffect, useState } from "react";
import { FraiPhoneFrame } from "../../components/FraiPhoneFrame";
import { listRecipeRecommendations } from "../../lib/api";
import type { RecipeRecommendationItem } from "../../lib/types";
import { useUserId } from "../../lib/useUserId";

export default function RecipesPage() {
  const { userId } = useUserId();
  const [items, setItems] = useState<RecipeRecommendationItem[]>([]);
  const [provider, setProvider] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const data = await listRecipeRecommendations({
        user_id: userId,
        top_n: 12,
        ui_lang: "ko",
        include_live: true
      });
      setItems(data.items || []);
      setProvider(String(data?.live?.provider || "-"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "레시피를 불러오지 못했습니다.");
    }
  };

  useEffect(() => {
    void load();
  }, [userId]);

  return (
    <FraiPhoneFrame navKey="recipes">
      <div className="frai-page">
        <section className="frai-header-hero compact">
          <h2>Recipe Recommendations</h2>
        </section>

        <section className="frai-block">
          <div className="frai-block-title">
            <h3>추천 목록</h3>
            <button onClick={() => void load()}>새로고침</button>
          </div>
          <p className="muted">provider: {provider}</p>

          {items.length === 0 ? <p className="muted">추천 결과가 없습니다.</p> : null}
          <div className="frai-list">
            {items.map((r) => (
              <article key={r.recipe_id} className="frai-list-item">
                <div>
                  <strong>{r.recipe_name}</strong>
                  <span>
                    점수 {Math.round(Number(r.score || 0))} | 매칭 {Math.round(Number(r.match_ratio || 0) * 100)}%
                  </span>
                </div>
                {r.source_url ? (
                  <a href={r.source_url} target="_blank" rel="noreferrer" className="frai-mini-link">
                    링크
                  </a>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        {error ? <div className="frai-error">{error}</div> : null}
      </div>
    </FraiPhoneFrame>
  );
}
