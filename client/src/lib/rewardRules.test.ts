import { describe, expect, it } from "vitest";
import { calculateRewardProgress, type QualifiedOrder } from "./rewardRules";
const order=(id:string,subtotal_amount:number,extra:Partial<QualifiedOrder>={}):QualifiedOrder=>({id,customer_user_id:"a",payment_status:"PAID",status:"PROCESSING",subtotal_amount,discount_amount:0,created_at:"2026-11-08T10:00:00Z",...extra});
describe("reward progress",()=>{
 it("counts only paid orders belonging to the customer",()=>expect(calculateRewardProgress({mode:"cumulative",threshold_amount:300},[order("1",100),order("2",200),order("3",999,{payment_status:"PENDING"}),order("4",999,{customer_user_id:"b"})],"a")).toBe(300));
 it("requires a single qualifying order",()=>expect(calculateRewardProgress({mode:"single_order",threshold_amount:300},[order("1",150),order("2",200)],"a")).toBe(200));
 it("excludes cancelled and refunded orders",()=>expect(calculateRewardProgress({mode:"cumulative",threshold_amount:300},[order("1",100,{status:"REFUNDED"}),order("2",200,{status:"CANCELLED"}),order("3",120)],"a")).toBe(120));
 it("excludes discounts",()=>expect(calculateRewardProgress({mode:"cumulative",threshold_amount:300},[order("1",300,{discount_amount:40})],"a")).toBe(260));
 it("respects mission dates",()=>expect(calculateRewardProgress({mode:"cumulative",threshold_amount:300,starts_at:"2026-11-09T00:00:00Z"},[order("1",300)],"a")).toBe(0));
});
