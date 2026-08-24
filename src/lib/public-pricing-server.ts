import "server-only";
import { PUBLIC_PAPERS, PUBLIC_PRODUCTS, PUBLIC_TURNAROUNDS, type PublicEstimate, type PublicPaper, type PublicProduct, type PublicQuoteSpec } from "@/lib/public-quote-types";

type BcRow = { quantity: number; one: number; two: number };
const BUSINESS_CARD_COLOR: BcRow[] = [
  { quantity: 100, one: 50, two: 64 }, { quantity: 250, one: 64, two: 93 }, { quantity: 500, one: 100, two: 137 }, { quantity: 1000, one: 121, two: 178 }, { quantity: 1500, one: 150, two: 235 }, { quantity: 2000, one: 178, two: 284 }, { quantity: 2500, one: 206, two: 299 }, { quantity: 5000, one: 303, two: 449 }, { quantity: 10000, one: 498, two: 629 }
];
function interpolateFixed(rows: BcRow[], qty: number, side: "one" | "two") { if (qty <= rows[0].quantity) return rows[0][side]; for (let i=0;i<rows.length-1;i+=1){const a=rows[i],b=rows[i+1]; if(qty>=a.quantity&&qty<=b.quantity){const t=(qty-a.quantity)/(b.quantity-a.quantity); return a[side]+t*(b[side]-a[side]);}} const last=rows[rows.length-1],prev=rows[rows.length-2]; return last[side]+Math.max(0,((qty-last.quantity)/(last.quantity-prev.quantity))*(last[side]-prev[side])); }
function flyerRate(qty:number){ if(qty<50)return .55;if(qty<100)return .42;if(qty<250)return .32;if(qty<500)return .24;if(qty<1000)return .18;if(qty<2500)return .14;if(qty<5000)return .11;return .09; }
function paperMultiplier(paper:PublicPaper, product:PublicProduct){ if(product==="Signs / Banners"||product==="Plans / Blueprints")return 1; switch(paper){case"16pt Cardstock":return 1.18;case"14pt Cardstock":return 1.08;case"100lb Gloss Text":return 1.12;case"100lb Matte Text":return 1.1;case"80lb Cover":return 1.15;default:return 1;} }
function finishingAdd(finishing:string,qty:number){const f=finishing.toLowerCase();let add=0;if(f.includes("soft"))add+=Math.max(18,qty*.02);if(f.includes("uv")||f.includes("spot"))add+=Math.max(15,qty*.015);if(f.includes("round")||f.includes("corner"))add+=Math.max(12,qty*.01);if(f.includes("foil"))add+=Math.max(40,qty*.04);if(f.includes("laminat"))add+=Math.max(20,qty*.025);if(f.includes("fold")||f.includes("score"))add+=Math.max(10,qty*.008);return add;}
function parseWideSize(size:string){const normalized=size.replace(/[”″]/g,'"').replace(/[’′]/g,"'");const match=normalized.match(/(\d+(?:\.\d+)?)\s*(?:in|inch|inches|\"|')?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:in|inch|inches|\"|')?/i);if(!match)return{widthIn:36,heightIn:24};const feet=normalized.includes("'")&&!normalized.includes('"');return{widthIn:Number(match[1])*(feet?12:1),heightIn:Number(match[2])*(feet?12:1)};}
function isIn<const T extends readonly string[]>(values:T,value:string):value is T[number]{return(values as readonly string[]).includes(value);}
function cleanString(value:unknown,max:number){return typeof value==="string"?value.trim().slice(0,max):"";}

export function parsePublicQuoteSpec(value:unknown):{spec?:PublicQuoteSpec;error?:string}{
  if(!value||typeof value!=="object"||Array.isArray(value))return{error:"Invalid quote specifications."};
  const body=value as Record<string,unknown>;const productRaw=cleanString(body.product,80);const paperRaw=cleanString(body.paper,80)||"Not sure – recommend";const turnaroundRaw=cleanString(body.turnaround,80)||"Standard";
  if(!isIn(PUBLIC_PRODUCTS,productRaw))return{error:"Please select a valid product."};if(!isIn(PUBLIC_PAPERS,paperRaw))return{error:"Please select a valid paper or stock."};if(!isIn(PUBLIC_TURNAROUNDS,turnaroundRaw))return{error:"Please select a valid turnaround option."};
  const quantityValue=typeof body.quantity==="number"?body.quantity:Number(String(body.quantity??"").replace(/[^0-9]/g,""));const quantity=Math.round(quantityValue);if(!Number.isFinite(quantity)||quantity<1||quantity>1_000_000)return{error:"Please enter a valid quantity."};
  return{spec:{product:productRaw,quantity,size:cleanString(body.size,80),sides:String(body.sides??"2")==="1"?1:2,colorSpec:cleanString(body.colorSpec,80)||"Not sure",paper:paperRaw,paperWeight:cleanString(body.paperWeight,60),coating:cleanString(body.coating,80),bleed:body.bleed===true||String(body.bleed).toLowerCase()==="true",deliveryMethod:cleanString(body.deliveryMethod,40)||"Pickup",finishing:cleanString(body.finishing,120),turnaround:turnaroundRaw}};
}

export function calculatePublicEstimate(spec:PublicQuoteSpec):PublicEstimate{
  const qty=Math.max(1,Math.round(spec.quantity));const breakdown:string[]=[];let base=0;let confidence:PublicEstimate["confidence"]="request";
  const color=spec.colorSpec.toLowerCase();
  if(color.includes("spot")||color.includes("custom ink")||color.includes("not sure")){return{total:0,perUnit:0,breakdown:["Print-color setup requires staff review"],confidence:"request",note:"No automatic internal price is generated for spot/custom/unspecified printing. Staff review is required."};}
  if(spec.product==="Business Cards"){base=interpolateFixed(BUSINESS_CARD_COLOR,qty,spec.sides===2?"two":"one");confidence="table";breakdown.push(`Business cards table (${spec.sides}-sided)`);} 
  else if(spec.product==="Flyers / Brochures"){base=flyerRate(qty)*qty*spec.sides;confidence="estimate";breakdown.push("Flyer / brochure internal estimate");}
  else if(spec.product==="Booklets / Books"){base=16*.22*qty+35;confidence="estimate";breakdown.push("Short-run booklet internal estimate");}
  else if(spec.product==="Posters"){base=4.5*qty;confidence="estimate";breakdown.push("Poster internal estimate");}
  else if(spec.product==="Signs / Banners"){const{widthIn,heightIn}=parseWideSize(spec.size);const sqFt=(widthIn*heightIn)/144;base=Math.max(45,sqFt*8.5*qty);confidence="estimate";breakdown.push(`${sqFt.toFixed(1)} sq ft internal estimate`);}
  else if(spec.product==="Labels / Stickers"){base=Math.max(35,.18*qty);confidence="estimate";breakdown.push("Label internal estimate");}
  else return{total:0,perUnit:0,breakdown:["Staff pricing required"],confidence:"request",note:"No automatic public price is generated for this product. Staff review is required."};
  const paperMult=paperMultiplier(spec.paper,spec.product);if(paperMult!==1){base*=paperMult;breakdown.push(`Paper: ${spec.paper}`);}const finish=finishingAdd(spec.finishing,qty);if(finish>0){base+=finish;breakdown.push("Finishing options");}if(spec.turnaround==="Rush"){base*=1.25;breakdown.push("Rush request");}
  const total=Math.round(Math.max(20,base)*100)/100;return{total,perUnit:Math.round((total/qty)*1000)/1000,breakdown,confidence,note:"Internal pricing aid only. Gross Printing staff must confirm the customer quote."};
}
export function formatMoney(value:number){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(value);}
