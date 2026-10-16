import {CharacterAvatar} from '@/components/game/character-avatar';
import {CHARACTER_ART} from '@/lib/character-art';

export function EntryCharacter({avatar,name}:{avatar:string;name:string}){
 return <aside className="entry-character-stage" aria-label="선택한 캐릭터 미리보기">
  <div className="entry-stage-grid" aria-hidden="true">{Array.from({length:25},(_,i)=><i key={i}/>)}</div>
  <div className="entry-stage-avatar" key={avatar}><CharacterAvatar avatar={avatar}/></div>
  <div className="entry-stage-plinth" aria-hidden="true"/>
  <div className="entry-stage-name"><strong>{name.trim()||CHARACTER_ART[avatar]?.name||'내 캐릭터'}</strong>{name.trim()&&<span>{CHARACTER_ART[avatar]?.name}</span>}</div>
 </aside>;
}
