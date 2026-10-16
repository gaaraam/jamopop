'use client';
import {useEffect,useRef} from 'react';
import type {GameState} from '@/lib/game';
import {motionEvents} from '@/lib/motion-events.mjs';

export function GameEffects({data}:{data:GameState}){
 const previous=useRef(data);
 const seen=useRef(new Set((data.party?.events||[]).map(e=>e.id)));
 const active=useRef(new Set<()=>void>());
 const generation=useRef(0);
 useEffect(()=>{
  const cancel=()=>{generation.current++;for(const stop of active.current)stop();active.current.clear()};
  const hide=()=>{if(document.hidden)cancel()};
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  document.addEventListener('visibilitychange',hide);window.addEventListener('resize',cancel);motion.addEventListener('change',cancel);
  return()=>{cancel();document.removeEventListener('visibilitychange',hide);window.removeEventListener('resize',cancel);motion.removeEventListener('change',cancel)};
 },[]);
 useEffect(()=>{
  const old=previous.current;previous.current=data;
  if(old.round.id!==data.round.id||old.room.id!==data.room.id){generation.current++;for(const stop of active.current)stop();active.current.clear();seen.current=new Set((data.party?.events||[]).map(e=>e.id));return}
  const events=motionEvents(old,data).filter(e=>!seen.current.has(e.id));
  for(const e of events)seen.current.add(e.id);
  if(seen.current.size>512)seen.current=new Set([...seen.current].slice(-256));
  if(!events.length||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const version=generation.current;
  void import('@/lib/game-fx.mjs').then(({launchGameEffect})=>{
   if(version!==generation.current||document.hidden)return;
   for(const event of events){
    // Bound simultaneous GPU effects. Completion removes its cleanup closure.
    if(active.current.size>=4){const first=active.current.values().next().value;first?.();if(first)active.current.delete(first)}
    let stop:()=>void=()=>{};
    stop=launchGameEffect(event,()=>active.current.delete(stop));active.current.add(stop);
   }
  }).catch(()=>{/* Optional visual engine must never interrupt gameplay. */});
 },[data]);
 return null;
}
