export const FURNITURE=[
 {id:'home-rug',name:'복숭아 구름 러그',price:0,kind:'rug',color:'#f6b4b2',width:32},
 {id:'home-sofa',name:'버터 식빵 소파',price:450,kind:'sofa',color:'#f4ce83',width:29},
 {id:'home-plant',name:'쑥쑥 몬스테라',price:250,kind:'plant',color:'#74af83',width:17},
 {id:'home-lamp',name:'달 한 조각 조명',price:650,kind:'lamp',color:'#f9dc85',width:18},
 {id:'home-books',name:'이야기 수집 책장',price:500,kind:'books',color:'#c99470',width:25},
 {id:'home-cushion',name:'딸기우유 쿠션',price:200,kind:'cushion',color:'#f0a7be',width:18},
 {id:'home-aquarium',name:'별빛 해파리 수조',price:1200,kind:'aquarium',color:'#91cbdf',width:24},
 {id:'home-tea',name:'오후 세 시 티테이블',price:400,kind:'tea',color:'#cc9c77',width:24},
] as const;
export type Placement={id:string;x:number;y:number;flipped:boolean};
export const DEFAULT_HOME:Placement[]=[{id:'home-rug',x:50,y:72,flipped:false}];
export function validLayout(value:unknown,owned:string[]):value is Placement[]{
 if(!Array.isArray(value)||value.length>12)return false;
 const ids=new Set<string>();
 return value.every(p=>{if(!p||typeof p!=='object'||!FURNITURE.some(f=>f.id===p.id)||!owned.includes(p.id)||ids.has(p.id)||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<18||p.x>82||p.y<48||p.y>86||typeof p.flipped!=='boolean')return false;ids.add(p.id);return true});
}
