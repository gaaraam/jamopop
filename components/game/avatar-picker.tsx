'use client';
import {CharacterAvatar} from '@/components/game/character-avatar';

import {CHARACTER_ART} from '@/lib/character-art';
import {AVATARS,avatarLevel} from '@/lib/cosmetics';
export function AvatarPicker({value,onChange,allowed}:{value:string;onChange:(avatar:string)=>void;allowed:string[]}){
 return <div className="avatar-picker unlock-avatars">{AVATARS.map(a=>{const locked=!allowed.includes(a),level=avatarLevel(a);return <button key={a} type="button" disabled={locked} className={value===a?'selected':''} aria-label={`${CHARACTER_ART[a]?.name||a} 캐릭터${locked?` · Lv.${level}에 해금`:''}`} aria-pressed={value===a} title={locked?`Lv.${level}에 해금`:`${CHARACTER_ART[a]?.name||a} 선택 가능`} onClick={()=>onChange(a)}><span><CharacterAvatar avatar={a}/></span><b className="avatar-picker-name">{CHARACTER_ART[a]?.name}</b><small>{locked?'🔒 ':''}{level===1?'기본':`Lv.${level}`}</small></button>})}</div>;
}
