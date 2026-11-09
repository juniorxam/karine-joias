import { Gift } from "lucide-react";
import { formatMoney } from "./lib/catalog";

export type RewardMissionView = {
  id: string;
  title: string;
  description?: string | null;
  mode: "cumulative" | "single_order";
  thresholdAmount: number;
  qualifiedAmount: number;
  giftName: string;
  giftImageUrl?: string | null;
  available: boolean;
  claimed: boolean;
};

export default function RewardsProgress({ missions, authenticated, onSignIn }: {
  missions: RewardMissionView[];
  authenticated: boolean;
  onSignIn: () => void;
}) {
  if (!missions.length) return <section className="rewards-club" aria-labelledby="rewards-club-heading"><div className="rewards-club-heading"><Gift aria-hidden="true" size={24}/><div><p>CLUBE DE RECOMPENSAS VIOLETTA</p><h2 id="rewards-club-heading">Minhas missões</h2></div></div><p>Nenhuma missão disponível no momento. Quando novas metas forem ativadas, elas aparecerão aqui.</p></section>;
  return <section className="rewards-club" aria-labelledby="rewards-club-heading">
    <div className="rewards-club-heading"><Gift aria-hidden="true" size={24}/><div><p>CLUBE DE RECOMPENSAS VIOLETTA</p><h2 id="rewards-club-heading">Suas compras valem presentes</h2></div></div>
    {!authenticated && <p className="rewards-club-signin">Entre na sua conta para acompanhar o progresso das suas compras. <button type="button" onClick={onSignIn}>Entrar</button></p>}
    <div className="rewards-club-grid">{missions.map(mission => {
      const earned = authenticated ? Math.max(0, Math.min(mission.qualifiedAmount, mission.thresholdAmount)) : 0;
      const remaining = Math.max(0, mission.thresholdAmount - earned);
      const progress = mission.thresholdAmount > 0 ? earned / mission.thresholdAmount * 100 : 0;
      return <article key={mission.id} className="rewards-club-card">
        {mission.giftImageUrl && <img src={mission.giftImageUrl} alt={mission.giftName} loading="lazy" />}
        <div className="rewards-club-card-copy">
          <span>{mission.mode === "cumulative" ? "Compras acumuladas" : "Uma única compra"}</span>
          <h3>{mission.title}</h3>
          <p>{mission.description || `Presente: ${mission.giftName}`}</p>
          <div role="progressbar" aria-label={`Progresso: ${mission.title}`} aria-valuemin={0} aria-valuemax={mission.thresholdAmount} aria-valuenow={earned} className="rewards-club-track"><div style={{width: `${progress}%`}}/></div>
          <small>{!authenticated ? "Entre para ver seu progresso" : mission.claimed ? "Brinde conquistado" : !mission.available ? "Brinde indisponível no momento" : remaining === 0 ? "Meta atingida! Aguarde a confirmação do brinde." : `Faltam ${formatMoney(remaining)} para sua meta`}</small>
        </div>
      </article>;
    })}</div>
  </section>;
}
