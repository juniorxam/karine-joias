export type QualifiedOrder = { id:string; customer_user_id:string|null; payment_status:string; status:string; subtotal_amount:number; discount_amount:number; created_at:string };
export type RewardRule = { mode:"cumulative"|"single_order"; threshold_amount:number; starts_at?:string|null; ends_at?:string|null };
/** Display estimate only; actual eligibility and inventory must be enforced server-side. */
export function calculateRewardProgress(rule:RewardRule, orders:QualifiedOrder[], userId:string):number {
 if(!userId || !Number.isFinite(rule.threshold_amount) || rule.threshold_amount<=0)return 0;
 const amounts=orders.filter(o=>o.customer_user_id===userId&&["PAID","APPROVED"].includes(o.payment_status)&&!["CANCELLED","REFUNDED"].includes(o.status)&&(!rule.starts_at||o.created_at>=rule.starts_at)&&(!rule.ends_at||o.created_at<rule.ends_at)).map(o=>Math.max(0,Number(o.subtotal_amount||0)-Number(o.discount_amount||0)));
 return rule.mode==="single_order"?Math.max(0,...amounts):amounts.reduce((a,b)=>a+b,0);
}
