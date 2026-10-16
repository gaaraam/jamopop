export type Cheer={id:string;memberId:string;name:string;emoji:string;createdAt:number};
// Stable member IDs prevent two people with the same nickname sharing an effect.
export function unseenCheers(events:Cheer[],memberId:string,seen:ReadonlySet<string>,now:number){
 return events.filter(e=>e.memberId===memberId&&!seen.has(e.id)&&now-e.createdAt<=6500&&e.createdAt<=now+1000).sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
}
