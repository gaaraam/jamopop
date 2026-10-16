'use client';
import {useEffect,useState} from 'react';
import {CharacterAvatar} from '@/components/game/character-avatar';
import {ALL_SKINS} from '@/lib/skins';
import {CARD_SKINS} from '@/lib/card-skins';
const SKINS=[...ALL_SKINS,...CARD_SKINS.map(s=>({...s,avatar:'🐼',box:'',reward:undefined}))];
import {CHARACTER_ART} from '@/lib/character-art';
import {avatarLevel} from '@/lib/cosmetics';
import './shop.css';
type Wallet={cardEquipped:string|null;balance:number;owned:string[];equipped:string|null;avatar:string;allowed:string[]};
export default function Shop(){
 const [category,setCategory]=useState<'character'|'card'>('character'),[data,setData]=useState<Wallet|null>(null),[error,setError]=useState(''),[signedOut,setSignedOut]=useState(false),[busy,setBusy]=useState(false),[selected,setSelected]=useState(SKINS[0].id),[collection,setCollection]=useState(false),[confirm,setConfirm]=useState(false),[notice,setNotice]=useState('');
 const catalog=SKINS.filter(s=>category==='card'?s.id.startsWith('card-'):!s.id.startsWith('card-'));
 const ownedCount=catalog.filter(s=>data?.owned.includes(s.id)).length;
 const isCard=CARD_SKINS.some(s=>s.id===selected);
 const skin=SKINS.find(s=>s.id===selected)!,owned=!!data?.owned.includes(skin.id),locked=!isCard&&!!data&&!skin.reward&&!data.allowed.includes(skin.avatar),equipped=(isCard?data?.cardEquipped:data?.equipped)===skin.id;
 async function load(){setError('');try{const r=await fetch('/api/shop');const d=await r.json() as Wallet & {error?:string};if(r.status===401)setSignedOut(true);if(!r.ok)throw new Error(d.error);setData(d)}catch(e){setError((e as Error).message)}}
 useEffect(()=>{void load()},[]);
 async function act(action:'buy'|'equip'|'unequip'){
  if(busy)return;setBusy(true);setError('');setNotice('');
  try{const r=await fetch('/api/shop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,skin:skin.id,slot:isCard?'card':'character'})});const d=await r.json() as Wallet & {error?:string};if(!r.ok)throw new Error(d.error);setData(d);setConfirm(false);setNotice(action==='buy'?'내 컬렉션에 추가했어요. 장착해 보세요!':action==='equip'?'모든 방에 적용했어요.':'기본 꾸미기로 돌아왔어요.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 return <main className="skin-shop"><header className="shop-top"><a href="/?lobby=1" aria-label="대기실로 돌아가기">← 대기실</a><h1>콩알 옷장</h1><b className="gold-wallet" aria-label="보유 골드">🪙 {data?data.balance.toLocaleString():'—'} <small>G</small></b></header>
 <nav className="shop-categories" aria-label="꾸미기 종류">{(['character','card'] as const).map(c=><button key={c} aria-pressed={category===c} disabled={busy} onClick={()=>{setCategory(c);setSelected(c==='card'?CARD_SKINS[0].id:ALL_SKINS[0].id);setConfirm(false);setNotice('');setCollection(false)}}>{c==='character'?'캐릭터 스킨':'카드 스킨'}</button>)}</nav><div className="shop-layout"><section className="skin-preview" aria-label="선택한 스킨"><span className="skin-series">{isCard?'카드 컬렉션':'콩알친구들 · 첫 번째 컬렉션'}</span><div className="skin-stage">{isCard?<CardPreview avatar={data?.avatar} skin={data?.equipped}/>:<CharacterAvatar avatar={skin.avatar} skin={skin.id}/>}</div><h2>{skin.name} {!isCard&&CHARACTER_ART[skin.avatar]?.name}</h2><span className="skin-tag">{isCard?'카드 스킨':skin.reward?'개인 도전 전용':'캐릭터 스킨'}{equipped?' · 장착 중':''}</span>
 {confirm?<div className="skin-confirm"><p><b>{skin.price} G</b>로 구매할까요?</p><div><button disabled={busy} onClick={()=>setConfirm(false)}>취소</button><button className="shop-primary" disabled={busy} onClick={()=>void act('buy')}>{busy?'구매 중…':'구매 확정'}</button></div></div>:<button className="shop-primary" disabled={!data||busy||locked||!!(skin.reward&&!owned)||(!owned&&data.balance<skin.price)} onClick={()=>owned?void act(equipped?'unequip':'equip'):setConfirm(true)}>{busy?'적용 중…':skin.reward&&!owned?`${skin.reward} 보상`:locked?`Lv.${avatarLevel(skin.avatar)} 캐릭터 해금 필요`:equipped?'기본 스킨으로 변경':owned?'장착하기':`${skin.price} G · 구매`}</button>}
 {!owned&&data&&data.balance<skin.price&&<small>골드 {skin.price-data.balance} G 더 모으면 만날 수 있어요.</small>}
 <p role="status" className="shop-notice">{notice}</p>{error&&<div role="alert" className="shop-error">{error}{signedOut?<a href="/auth/google/start?return_to=%2Fshop">Google로 로그인</a>:<button onClick={()=>void load()}>다시 불러오기</button>}</div>}
 </section><section className="shop-catalog"><nav aria-label="스킨 목록"><button aria-pressed={!collection} onClick={()=>setCollection(false)}>모든 스킨 <span>{catalog.length}</span></button><button aria-pressed={collection} onClick={()=>setCollection(true)}>보유 스킨 <span>{ownedCount}</span></button></nav><div className="skin-grid">{catalog.filter(s=>!collection||data?.owned.includes(s.id)).map(s=><button className={`skin-product ${selected===s.id?'selected':''}`} aria-pressed={selected===s.id} data-owned={!!data?.owned.includes(s.id)} key={s.id} disabled={busy} onClick={()=>{setSelected(s.id);setConfirm(false);setNotice('')}}>{s.id.startsWith('card-')?<CardPreview small/>:<CharacterAvatar avatar={s.avatar} skin={s.id}/>}<strong>{s.name} {!s.id.startsWith('card-')&&CHARACTER_ART[s.avatar]?.name}</strong><small>{(data?.equipped===s.id||data?.cardEquipped===s.id)?'✓ 장착 중':data?.owned.includes(s.id)?'보유':s.reward||`${s.price} G`}</small></button>)}</div>{collection&&!ownedCount&&<p className="shop-empty">아직 보유한 스킨이 없어요.</p>}
 <details className="gold-guide"><summary>골드 모으는 방법</summary><p>방 문제 성공 <b>+30 G</b> · 시도 후 실패 <b>+10 G</b><br/>한국 시간 기준 매일 첫 성공 <b>+30 G</b></p><p>일반전·아이템전·스피드전에 지급하며, 스피드전은 한 묶음당 한 번 지급됩니다. 연습·개인 도전·기권·강제 중단은 제외됩니다.</p><p>도입 이후 완료한 판부터 쌓입니다. 게스트 골드는 해당 기록을 계정에 연결하면 사용할 수 있어요. 스킨은 영구 소장하며 게임 능력은 바뀌지 않습니다.</p></details></section></div></main>
}

function CardPreview({avatar='🐼',skin,small=false}:{avatar?:string;skin?:string|null;small?:boolean}){
 return <div className={`card-skin-preview card-skin-starlight ${small?'small':''}`}><span className="card-skin-stars" aria-hidden="true">{Array.from({length:8},(_,i)=><i key={i}/>)}</span><CharacterAvatar avatar={avatar} skin={skin}/>{!small&&<div><strong>내 참가자 카드</strong><small>별빛 정원</small></div>}<span className="card-preview-grid" aria-hidden="true">{Array.from({length:25},(_,i)=><i key={i}/>)}</span></div>;
}
