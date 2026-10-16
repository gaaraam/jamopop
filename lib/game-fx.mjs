import * as THREE from 'three';
import {flightPoint} from './motion-events.mjs';

// All coordinates are viewport CSS pixels. Nothing here writes game state.
export function launchGameEffect(event,onDone=()=>{}){
 const cards=[...document.querySelectorAll('[data-fx-member]')];
 const find=id=>cards.find(el=>el.getAttribute('data-fx-member')===id);
 const board=document.querySelector('.main-board');
 const target=find(event.targetId),actor=find(event.actorId);
 const W=innerWidth,H=innerHeight;
 const point=el=>{const r=el?.getBoundingClientRect();return r?{x:Math.max(40,Math.min(W-40,r.left+r.width/2)),y:Math.max(60,Math.min(H-60,r.top+Math.min(50,r.height/2)))}:null};
 const row=board?.querySelector('[data-fx-row="'+event.row+'"]');
 let a=event.kind==='win'?point(row||board):point(actor);
 let b=point(target);
 if(!a||!b){queueMicrotask(onDone);return()=>{}}
 if(event.kind==='win'&&row){const r=board.getBoundingClientRect();a.x=r.left+r.width/2}
 const layer=document.createElement('div');layer.className='game-fx-layer';layer.dataset.effect=event.kind;layer.setAttribute('aria-hidden','true');
 const label=document.createElement('span');label.className='game-fx-label '+event.kind;
 const captions={win:'정답!',attack:'−15초',shield:'방패 장착',blocked:'방어!',reflect:event.negated?'반사 · 방어!':'반사! −15초','reflect-ready':'반사 장착',boost:'+15초'};
 label.textContent=captions[event.kind]||'';label.style.opacity='0';layer.append(label);document.body.append(layer);
 let renderer,frame=0,ended=false;
 const geometries=new Set(),materials=new Set();
 const clean=()=>{if(ended)return;ended=true;cancelAnimationFrame(frame);for(const g of geometries)g.dispose();for(const m of materials)m.dispose();renderer?.dispose();renderer?.forceContextLoss();layer.remove();onDone()};
 const delay=event.kind==='win'?event.width*45+700:0;
 try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setSize(W,H);renderer.setClearColor(0,0);layer.prepend(renderer.domElement)}catch{
  label.style.left=b.x+'px';label.style.top=b.y+'px';label.style.opacity='1';
  const animation=label.animate([{opacity:0,transform:'translate(-50%,0) scale(.8)'},{opacity:1,transform:'translate(-50%,-50%) scale(1.1)',offset:.25},{opacity:0,transform:'translate(-50%,-100%)'}],{duration:1100,delay,fill:'both'});
  animation.finished.then(clean,clean);return()=>{animation.cancel();clean()};
 }
 const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(0,W,0,H,.1,2000);camera.position.z=1000;
 scene.add(new THREE.AmbientLight(0xffffff,2.2));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-200,-300,600);scene.add(light);
 const color=event.kind==='win'?0xffd56a:event.kind.includes('reflect')?0xb89aff:['shield','blocked'].includes(event.kind)?0x72cfff:event.kind==='boost'?0x74f3bc:0xff9679;
 const geo=g=>{geometries.add(g);return g};
 const mat=(c,opacity=1)=>{const m=new THREE.MeshStandardMaterial({color:c,metalness:.35,roughness:.25,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide});materials.add(m);return m};
 const mesh=(g,c,parent=scene,opacity=1)=>{const obj=new THREE.Mesh(g,mat(c,opacity));parent.add(obj);return obj};
 const root=new THREE.Group();scene.add(root);
 const isTravel=['attack','blocked','reflect','win'].includes(event.kind);
 const ringGeo=geo(new THREE.TorusGeometry(32,2.2,8,48));
 const ring=mesh(ringGeo,color,scene,.8);
 const shield= new THREE.Shape();shield.moveTo(-25,-31);shield.lineTo(25,-31);shield.lineTo(22,5);shield.quadraticCurveTo(16,24,0,36);shield.quadraticCurveTo(-16,24,-22,5);shield.closePath();
 const barrier=mesh(geo(new THREE.ExtrudeGeometry(shield,{depth:5,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:2,bevelThickness:2})),color,scene,.65);barrier.visible=false;
 if(['attack','blocked','reflect'].includes(event.kind)){
  // A brass hourglass with two crystalline cones and a luminous sand core.
  for(const y of [-20,20]){const disk=mesh(geo(new THREE.CylinderGeometry(17,17,5,20)),0xffcf80,root);disk.position.y=y}
  for(const y of [-9,9]){const cone=mesh(geo(new THREE.ConeGeometry(12,20,20)),0xb6e9ff,root,.6);cone.position.y=y;cone.rotation.z=y<0?Math.PI:0}
  for(const x of [-14,14]){const post=mesh(geo(new THREE.CylinderGeometry(1.5,1.5,38,6)),0xe9af5c,root);post.position.x=x}
  mesh(geo(new THREE.OctahedronGeometry(6)),0xffedb4,root);
 }else if(event.kind==='win'){
  mesh(geo(new THREE.IcosahedronGeometry(12,0)),color,root);
 }else if(event.kind==='boost'){
  const plus=mesh(geo(new THREE.BoxGeometry(10,36,8)),color,root);
  const cross=mesh(geo(new THREE.BoxGeometry(36,10,8)),color,root);plus.rotation.z=.05;cross.rotation.z=.05;
 }else{
  const face=mesh(barrier.geometry,color,root,.72);face.rotation.y=.3;
  const crest=mesh(geo(new THREE.TorusGeometry(13,2,8,32)),0xffffff,root);crest.position.z=8;
 }
 const particleGeo=geo(new THREE.OctahedronGeometry(1.8));
 const particles=Array.from({length:event.kind==='win'?50:30},(_,i)=>{
  const p=mesh(particleGeo,i%4===0?0xffffff:color,scene);
  return {p,angle:i*2.39996,speed:35+(i%7)*13,spin:i*.61};
 });
 const start=performance.now()+delay;
 const duration=event.kind==='reflect'?1900:1600;
 const ease=t=>1-(1-t)**3;
 const draw=now=>{
  if(ended)return;
  if(document.hidden){clean();return}
  const elapsed=now-start;
  if(elapsed<0){frame=requestAnimationFrame(draw);return}
  const t=elapsed/duration;if(t>=1){clean();return}
  a=event.kind==='win'?point(row||board):point(actor);b=point(target);
  if(!a||!b||!target.isConnected){clean();return}
  if(event.kind==='win'&&board){const box=board.getBoundingClientRect();a.x=box.left+box.width/2}
  const travel=Math.min(1,t/.45);
  let pos=isTravel?flightPoint(a,b,ease(travel),Math.min(110,Math.abs(b.x-a.x)*.2+50)):b;
  if(event.kind==='reflect'&&t>.45)pos=flightPoint(b,a,ease(Math.min(1,(t-.45)/.32)),70);
  // Stolen time returns to the sender as a ribbon of sparks, not as a time reward.
  const impact=event.kind==='reflect'?.77:isTravel?.45:.12;
  const impactPoint=event.kind==='reflect'?a:b;
  root.position.set(pos.x,pos.y,40);root.rotation.y=isTravel?elapsed*.005:Math.sin(elapsed*.004)*.45;root.rotation.z=Math.sin(elapsed*.006)*.2;
  root.scale.setScalar(t<impact?1+Math.sin(Math.min(t/.12,1)*Math.PI)*.25:Math.max(0,1-(t-impact)*4));
  ring.position.set(impactPoint.x,impactPoint.y,15);
  const burst=Math.max(0,(t-impact)/(1-impact));ring.visible=t>=impact;ring.scale.setScalar(.5+ease(burst)*2.8);ring.material.opacity=(1-burst)*.8;
  const showShield=event.kind==='blocked'||event.kind==='reflect';
  barrier.visible=showShield&&t>.3&&t<.76;barrier.position.set(b.x,b.y,70);barrier.rotation.y=Math.sin(elapsed*.004)*.35;barrier.scale.setScalar(1+Math.sin(Math.max(0,t-.3)*Math.PI*2)*.15);
  for(let i=0;i<particles.length;i++){
   const {p,angle,speed,spin}=particles[i];p.visible=t>=impact||isTravel;
   if(t<impact&&isTravel){const trail=Math.max(0,travel-i*.018);const q=flightPoint(a,b,ease(trail),Math.min(110,Math.abs(b.x-a.x)*.2+50));p.position.set(q.x+Math.sin(angle)*5,q.y+Math.cos(angle)*5,20);p.material.opacity=.7*(1-i/particles.length)}
   else if(event.kind==='attack'&&i<12&&burst<.78){const back=Math.max(0,Math.min(1,(burst-i*.012)/.65));const q=flightPoint(b,a,ease(back),45);p.position.set(q.x,q.y+Math.sin(angle)*5,30);p.material.opacity=(1-back)*.9}
   else {const r=ease(burst)*speed;p.position.set(impactPoint.x+Math.cos(angle)*r,impactPoint.y+Math.sin(angle)*r+burst*burst*65,30);p.material.opacity=(1-burst)**1.4}
   p.rotation.set(spin+elapsed*.003,elapsed*.004,angle);p.scale.setScalar(1+(i%3)*.6);
  }
  const labelPoint=impactPoint;
  label.style.left=labelPoint.x+'px';label.style.top=(labelPoint.y-42-burst*24)+'px';label.style.opacity=t>=impact?String(Math.min(1,burst*12)*(1-Math.max(0,(burst-.6)/.4))):'0';
  try{renderer.render(scene,camera)}catch{clean();return}
  frame=requestAnimationFrame(draw);
 };
 frame=requestAnimationFrame(draw);
 return clean;
}
