/** Regra única da Violetta para entregas locais, no fuso de Palmas (UTC-3). */
export const DELIVERY_TIME_ZONE = "America/Araguaina";
export const DELIVERY_CUTOFF_HOUR = 11;
export const DELIVERY_POLICY_TEXT = "Para entregas locais em Palmas, previsão de até 1 dia útil após a confirmação do pagamento. Pedidos feitos até as 11h (horário de Palmas), em dias úteis, têm previsão para o mesmo dia; após as 11h, no próximo dia útil. Sujeito à confirmação do pagamento e à área atendida.";

type DeliveryAddress = { city?: string; state?: string; shipping_option?: { service?: string } } | null | undefined;
function localParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: DELIVERY_TIME_ZONE, year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23" }).formatToParts(value);
  const get = (type:string) => Number(parts.find(part=>part.type===type)?.value||0);
  return { year:get("year"),month:get("month"),day:get("day"),hour:get("hour"),minute:get("minute") };
}
function isWeekday(day:Date){const n=day.getUTCDay();return n!==0&&n!==6;}
function localDate(value:Date) {
  const p=localParts(value);
  const day=new Date(Date.UTC(p.year,p.month-1,p.day));
  const sameDay=isWeekday(day)&&(p.hour<DELIVERY_CUTOFF_HOUR||(p.hour===DELIVERY_CUTOFF_HOUR&&p.minute===0));
  if(!sameDay)do{day.setUTCDate(day.getUTCDate()+1)}while(!isWeekday(day));
  return {date:day,sameDay};
}
export function deliveryEstimate(value:Date|string|number=new Date()){
  const input=value instanceof Date?value:new Date(value);
  if(Number.isNaN(input.getTime()))return null;
  const {date,sameDay}=localDate(input);
  const dateLabel=new Intl.DateTimeFormat("pt-BR",{day:"2-digit",month:"long",year:"numeric",timeZone:"UTC"}).format(date);
  return {date:date.toISOString().slice(0,10),dateLabel,sameDay,label:"Previsão de entrega: "+dateLabel};
}
export function isLocalDelivery(address:DeliveryAddress){
  if(!address)return false;
  const service=String(address.shipping_option?.service||"").toLocaleLowerCase("pt-BR");
  return String(address.city||"").trim().toLocaleLowerCase("pt-BR")==="palmas"&&String(address.state||"").trim().toUpperCase()==="TO"&&!service.includes("retirada")&&!service.includes("combinar");
}
export function deliveryMessage(address:DeliveryAddress,createdAt:Date|string|number=new Date()){
  if(!isLocalDelivery(address))return null;
  const estimate=deliveryEstimate(createdAt);
  return estimate?estimate.label+". Prazo sujeito à confirmação do pagamento e ao funcionamento da loja (horário de Palmas).":null;
}
