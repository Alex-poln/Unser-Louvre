import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

function texture(width,height,paint,repeat=[1,1]){
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  paint(canvas.getContext('2d'),width,height);
  const map=new T.CanvasTexture(canvas);
  map.colorSpace=T.SRGBColorSpace;
  map.wrapS=map.wrapT=T.RepeatWrapping;map.repeat.set(...repeat);
  map.anisotropy=2;
  return map;
}
function stone(color,map=null){return new T.MeshLambertMaterial({color,map});}
function flat(color){return new T.MeshBasicMaterial({color});}
function box(root,w,h,d,x,y,z,material){
  const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material);
  mesh.position.set(x,y,z);root.add(mesh);return mesh;
}
function sign(root,x,y,z,w,h,paint,rotation=0){
  const map=texture(768,Math.max(32,Math.round(768*h/w)),paint);
  const mesh=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map}));
  mesh.position.set(x,y,z);mesh.rotation.y=rotation;root.add(mesh);return mesh;
}
function plaque(root,x,y,z,w,h,title,detail='',rotation=0){
  return sign(root,x,y,z,w,h,(ctx,sw,sh)=>{
    ctx.fillStyle='#252e2b';ctx.fillRect(0,0,sw,sh);
    ctx.strokeStyle='#bca275';ctx.lineWidth=3;ctx.strokeRect(10,10,sw-20,sh-20);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#f1e7d3';
    ctx.font='600 66px Georgia';ctx.fillText(title,sw/2,sh*(detail ? .38 : .52),sw-55);
    if(detail){
      ctx.fillStyle='#e0c79a';ctx.font='28px system-ui';
      ctx.fillText(detail,sw/2,sh*.74,sw-55);
    }
  },rotation);
}
function stoneTiles(repeat=[1,1],inscription=false){
  return texture(inscription?2048:512,inscription?2048:512,(ctx,w,h)=>{
    let seed=167;
    const next=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
    const shades=['#cfc2ac','#d2c5b1','#d8cbb7','#cec3af','#d4c8b6'];
    const count=inscription?18:8,size=w/count;
    ctx.fillStyle='#a4937b';ctx.fillRect(0,0,w,h);
    for(let y=0;y<count;y++)for(let x=0;x<count;x++){
      ctx.fillStyle=shades[Math.floor(next()*shades.length)];
      ctx.fillRect(x*size+.6,y*size+.6,size-1.2,size-1.2);
    }
    if(inscription){
      const x=w/2,y=h*(.5+5/36);
      ctx.fillStyle='#624c35';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font='italic 94px Georgia';ctx.fillText('Ein Jahr mit dir',x,y,650);
      ctx.strokeStyle='#9b805d';ctx.lineWidth=2.3;ctx.beginPath();
      ctx.moveTo(x-240,y+53);ctx.lineTo(x-32,y+53);
      ctx.moveTo(x+32,y+53);ctx.lineTo(x+240,y+53);ctx.stroke();
    }
  },repeat);
}
function tube(root,a,b,thickness,material){
  const direction=b.clone().sub(a);
  const tube=new T.Mesh(new T.CylinderGeometry(thickness,thickness,direction.length(),6),material);
  tube.position.copy(a).lerp(b,.5);
  tube.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction.normalize());
  root.add(tube);
}
function batch(root){
  root.updateMatrixWorld(true);
  const groups=new Map(), inverse=root.matrixWorld.clone().invert();
  root.traverse(mesh=>{
    if(!mesh.isMesh||mesh.isInstancedMesh||mesh.material.transparent||Array.isArray(mesh.material))return;
    const attributes=Object.keys(mesh.geometry.attributes).sort().join('/');
    let signatures=groups.get(mesh.material);
    if(!signatures){signatures=new Map();groups.set(mesh.material,signatures);}
    const list=signatures.get(attributes)??[];
    list.push(mesh);signatures.set(attributes,list);
  });
  for(const [material,signatures] of groups)for(const meshes of signatures.values()){
    if(meshes.length<2)continue;
    const parts=meshes.map(mesh=>{
      const geometry=mesh.geometry.index?mesh.geometry.clone():mesh.geometry.clone().setIndex(
        Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>i));
      return geometry.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
    });
    const geometry=mergeGeometries(parts);
    for(const part of parts)part.dispose();
    if(!geometry)continue;
    for(const mesh of meshes){mesh.removeFromParent();mesh.geometry.dispose();}
    root.add(new T.Mesh(geometry,material));
  }
}
export function mountArchitecture(scene,resources,root){
  batch(root);
  const owned=new Set();
  root.traverse(object=>{
    if(object.isInstancedMesh)owned.add(object);
    if(object.geometry)owned.add(object.geometry);
    if(object.material){
      owned.add(object.material);
      if(object.material.map)owned.add(object.material.map);
    }
  });
  resources.push(...owned);
  scene.add(root);
}
function ringSlab(root,inner,outer,bottom,top,start,end,material){
  const positions=[];
  const point=(r,y,a)=>[r*Math.cos(a),y,r*Math.sin(a)];
  const quad=(a,b,c,d)=>positions.push(...a,...b,...c,...a,...c,...d);
  const segments=56;
  for(let i=0;i<segments;i++){
    const a=start+(end-start)*i/segments,b=start+(end-start)*(i+1)/segments;
    const ia=point(inner,top,a),ib=point(inner,top,b),oa=point(outer,top,a),ob=point(outer,top,b);
    const ja=point(inner,bottom,a),jb=point(inner,bottom,b),pa=point(outer,bottom,a),pb=point(outer,bottom,b);
    quad(ia,ib,ob,oa);quad(ja,pa,pb,jb);quad(pa,oa,ob,pb);quad(ja,jb,ib,ia);
    if(i===0)quad(ja,ia,oa,pa);
    if(i===segments-1)quad(jb,pb,ob,ib);
  }
  const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.computeVertexNormals();
  root.add(new T.Mesh(geometry,material));
}
export function makeHall(quarters){
  const root=new T.Group();
  const ivory=stone('#e5d8be'), limestone=stone('#c6b79e'), dark=stone('#27312c');
  const trim=stone('#97805e'), frame=stone('#576870'), warm=flat('#ffe0a4');
  const floor=new T.Mesh(new T.PlaneGeometry(36,36),stone('#fff',stoneTiles([1,1],true)));
  floor.rotation.x=-Math.PI/2;root.add(floor);
  quarters.forEach((q,i)=>{
    const wing=new T.Group();wing.rotation.y=-i*Math.PI/2;root.add(wing);
    for(const side of [-1,1]){
      box(wing,14.6,9,.8,side*10.7,4.5,-18,limestone);
      box(wing,.28,6.1,5.9,side*3.4,3.05,-21.2,ivory);
      box(wing,.12,5.6,.2,side*3.03,3.05,-18.42,warm);
      for(const x of [8.4,13.6])box(wing,.75,8.4,.55,x*side,4.2,-17.55,ivory);
    }
    box(wing,6.9,2.82,.8,0,7.59,-18,limestone);
    box(wing,6.9,6.2,.3,0,3.1,-24.2,dark);
    box(wing,6.9,.14,6.3,0,-.05,-21.15,dark);
    box(wing,36,.45,1.2,0,8.75,-17.82,ivory);
    box(wing,36,.07,.12,0,8.47,-17.20,warm);
    for(let step=0;step<12;step++){
      const h=(step+1)*.24,z=-18.73-step*.43;
      box(wing,3.65,h,.43,0,h/2,z,ivory);
      box(wing,3.52,.018,.045,0,h+.014,z+.19,trim);
    }
    for(const side of [-1,1]){
      const x=side*1.94;
      tube(wing,new T.Vector3(x,1.23,-18.44),new T.Vector3(x,3.88,-23.65),.045,frame);
      for(const step of [0,4,8,11]){
        const h=(step+1)*.24;
        box(wing,.065,1.03,.065,x,h+.515,-18.73-step*.43,frame);
      }
    }
    plaque(wing,0,7.32,-17.54,6.4,1.6,q.months);
  });
  const start=-Math.PI/2+.58,end=start+2*Math.PI-1.16;
  ringSlab(root,2.86,3.54,.018,.11,start,end,trim);
  ringSlab(root,2.83,3.57,.11,1.03,start,end,ivory);
  ringSlab(root,2.77,3.63,1.03,1.11,start,end,stone('#554c3e'));
  const cylinder=new T.Mesh(new T.CylinderGeometry(1.4,1.4,5.2,32,1,true),new T.MeshBasicMaterial({
    color:'#b5d2d8',transparent:true,opacity:.35,side:T.DoubleSide,depthWrite:false,forceSinglePass:true
  }));
  cylinder.position.y=2.6;root.add(cylinder);
  plaque(root,0,1.59,3.56,2.8,.68,'Alex & Jill');
  const apex=new T.Vector3(0,30.6,0),corners=[[-18,9,-18],[18,9,-18],[18,9,18],[-18,9,18]].map(p=>new T.Vector3(...p));
  const glass=new T.MeshBasicMaterial({color:'#e6f1f3',opacity:.12,transparent:true,side:T.DoubleSide,depthWrite:false,forceSinglePass:true});
  const lines=[];
  for(let i=0;i<4;i++){
    const a=corners[i],b=corners[(i+1)%4];
    const geo=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([...a,...b,...apex],3));
    root.add(new T.Mesh(geo,glass));tube(root,a,apex,.13,frame);tube(root,a,b,.15,frame);
    const sample=(x,y)=>a.clone().multiplyScalar(1-x-y).addScaledVector(b,x).addScaledVector(apex,y);
    for(let j=1;j<24;j++){
      const f=j/24;
      lines.push(...sample(f,0),...sample(f,1-f),...sample(1-f,0),...sample(0,1-f));
    }
  }
  root.add(new T.LineSegments(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(lines,3)),new T.LineBasicMaterial({color:'#617680'})));
  return root;
}
export function makeCorridor(width,depth,height,center,color){
  const root=new T.Group();
  root.position.z=center;
  const trim=stone('#dccbb0'),wall=stone('#d0c1a6'),panel=stone(color),ceiling=stone('#bfb5a3');
  const glow=flat('#ffe0a4'),brass=stone('#a28859'),dark=stone('#29342e');
  box(root,width,.18,depth,0,-.09,0,stone('#ded4c3',stoneTiles([1.8,Math.max(1,depth/10)])));
  box(root,width,.20,depth,0,height,0,ceiling);
  for(const side of [-1,1]){
    const x=side*width/2;
    box(root,.35,height,depth,x,height/2,0,wall);
    box(root,.12,3.63,depth,x-side*.18,2.40,0,panel);
    box(root,.12,.26,depth,x-side*.21,.13,0,trim);
    box(root,.14,.14,depth,x-side*.23,4.56,0,trim);
    box(root,.05,.055,depth,x-side*.31,4.45,0,glow);
    box(root,.04,.007,depth,x-side*.72,.004,0,brass);
    box(root,width,height,.35,0,height/2,side*depth/2,wall);
  }
  const beamGeometry=new T.BoxGeometry(width-.4,.17,.23);
  const stripGeometry=new T.BoxGeometry(width*.69,.025,.052);
  const count=Math.ceil(depth/4.6);
  const beams=new T.InstancedMesh(beamGeometry,trim,count);
  const strips=new T.InstancedMesh(stripGeometry,glow,count);
  const offset=new T.Matrix4();
  for(let i=0;i<count;i++){
    const z=-depth/2+(i+.5)*depth/count;
    beams.setMatrixAt(i,offset.makeTranslation(0,height-.19,z));
    strips.setMatrixAt(i,offset.makeTranslation(0,height-.285,z+.10));
  }
  root.add(beams,strips);
  return {root,trim,dark,glow};
}
export function addDoor(parts,x,z,rotation,name,detail){
  const {root,trim,dark,glow}=parts;
  const door=new T.Group();door.position.set(x,0,z);door.rotation.y=rotation;root.add(door);
  box(door,3.18,3.45,.13,0,1.73,0,dark);
  const arch=new T.Mesh(new T.CircleGeometry(1.59,28,0,Math.PI),dark);
  arch.position.set(0,3.42,.075);door.add(arch);
  const lip=new T.Mesh(new T.TorusGeometry(1.67,.115,5,28,Math.PI),trim);
  lip.position.set(0,3.42,.10);door.add(lip);
  for(const side of [-1,1]){
    box(door,.23,3.45,.22,1.67*side,1.73,.10,trim);
    box(door,.058,2.72,.065,1.53*side,1.53,.17,glow);
  }
  plaque(door,0,2.08,.132,2.59,.80,name,detail);
}
export function wingPlan(count){
  const pairs=Math.max(1,Math.ceil(count/2));
  const depth=11+(pairs-1)*6.5;
  return {depth,spawn:depth/2-3.6,exit:depth/2-1.15,last:-depth/2+1.3,
    doors:Array.from({length:count},(_,i)=>({side:i%2===0?-1:1,z:depth/2-7.55-Math.floor(i/2)*6.5}))};
}


export function makeForecourt(){
  const root=new T.Group();
  const stone=new T.MeshLambertMaterial({color:'#d6c3a4'});
  const trim=new T.MeshLambertMaterial({color:'#e6d8bf'});
  const roof=new T.MeshLambertMaterial({color:'#546575'});
  const windowDark=new T.MeshBasicMaterial({color:'#3f4a4f'});
  const bronze=new T.MeshLambertMaterial({color:'#82745c'});
  const pavement=stoneTiles([27,24]);
  const ground=new T.Mesh(new T.PlaneGeometry(220,190),new T.MeshLambertMaterial({color:'#e3e6e5',map:pavement}));
  ground.rotation.x=-Math.PI/2;root.add(ground);
  
  // Palace wings, repeated windows and corner pavilions from the supplied exterior concept.
  function palace(x,z,width,rotation){
    const g=new T.Group();g.position.set(x,0,z);g.rotation.y=rotation;root.add(g);
    box(g,width,21,10,0,10.5,-5,stone);
    box(g,width+.4,.9,1.45,0,9.1,.10,trim);
    box(g,width+.65,.85,1.5,0,20.7,.15,trim);
    box(g,width,5,8.9,0,23.4,-5,roof);
    for(let x=-width/2+2.7;x<width/2-1.7;x+=4.2){
      for(const y of [4.5,12.25,17]){
        box(g,1.85,3.25,.27,x,y,.08,trim);
        box(g,1.41,2.74,.1,x,y,.241,windowDark);
        box(g,.085,2.74,.10,x,y,.31,bronze);
      }
      box(g,.46,11.5,.5,x+2,14.2,.17,trim);
    }
    for(const x of [-width/2+7,width/2-7]){
      box(g,10.8,4.3,9.1,x,23.15,-4.6,stone);
      const pavilion=new T.Mesh(new T.CylinderGeometry(2.35,6.15,7,4),roof);
      pavilion.rotation.y=Math.PI/4;pavilion.position.set(x,28.7,-4.6);g.add(pavilion);
      box(g,3.6,.72,3.6,x,32.45,-4.6,trim);
    }
  }
  palace(0,-44,132,0);
  palace(-58,3,105,Math.PI/2);
  palace(58,3,105,-Math.PI/2);

  const steel=new T.MeshBasicMaterial({color:'#536a78'});
  const frame=new T.MeshLambertMaterial({color:'#485d68'});
  const gray=new T.MeshLambertMaterial({color:'#a1a8a4'});
  const water=new T.MeshBasicMaterial({color:'#789ca9'});
  for(const side of [-1,1]){
    box(root,11,.22,23,side*23,.11,0,trim);
    box(root,10.4,.021,22.4,side*23,.232,0,water);
  }
  box(root,36,.15,36,0,.075,0,gray);
  const half=17.7,height=21.6,doorTop=3.95;
  const corners=[[-half,0,-half],[half,0,-half],[half,0,half],[-half,0,half]].map(p=>new T.Vector3(...p));
  const apex=new T.Vector3(0,height,0),lines=[];
  const front=(x,y)=>new T.Vector3(x,y,half*(1-y/height));
  const halfOpening=y=>4.85-(4.85-3.15)*y/doorTop;
  function emit(a,b){lines.push(...a,...b);}
  function line(a,b,cut){
    if(!cut){emit(a,b);return;}
    const ts=[0,1], dx=b.x-a.x,dy=b.y-a.y,k=(4.85-3.15)/doorTop;
    for(const [p,d] of [[a.y-doorTop,dy],[a.x+k*a.y-4.85,dx+k*dy],[-a.x+k*a.y-4.85,-dx+k*dy]]){
      const t=-p/d;if(Number.isFinite(t)&&t>0&&t<1)ts.push(t);
    }
    ts.sort((a,b)=>a-b);
    for(let j=1;j<ts.length;j++){
      const lo=ts[j-1],hi=ts[j],mid=a.clone().lerp(b,(lo+hi)/2);
      if(mid.y>=doorTop||Math.abs(mid.x)>=halfOpening(mid.y))emit(a.clone().lerp(b,lo),a.clone().lerp(b,hi));
    }
  }
  function tube(a,b,width){
    const delta=b.clone().sub(a);
    const mesh=new T.Mesh(new T.CylinderGeometry(width,width,delta.length(),6),frame);
    mesh.position.copy(a).lerp(b,.5);
    mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());root.add(mesh);
  }
  const paneColors=['#8badbf','#a5c6d4','#bfd7e1','#9fbac8'];
  for(let i=0;i<4;i++){
    const a=corners[i],b=corners[(i+1)%4],isFront=i===2;
    const points=[];
    const tri=(a,b,c)=>points.push(...a,...b,...c);
    const quad=(a,b,c,d)=>{tri(a,b,c);tri(a,c,d);};
    if(isFront){
      const sillLeft=front(-4.85,0),sillRight=front(4.85,0);
      const headLeft=front(-3.15,doorTop),headRight=front(3.15,doorTop);
      const edge=half*(1-doorTop/height);
      const topLeft=front(-edge,doorTop),topRight=front(edge,doorTop);
      quad(b,sillLeft,headLeft,topLeft);quad(sillRight,a,topRight,headRight);
      tri(topLeft,topRight,apex);
      tube(sillLeft,headLeft,.13);tube(headLeft,headRight,.13);tube(headRight,sillRight,.13);
    }else tri(a,b,apex);
    const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(points,3));
    const glass=new T.MeshBasicMaterial({color:paneColors[i],side:T.DoubleSide,opacity:isFront?.42:.31,transparent:true,depthWrite:false,forceSinglePass:true});
    root.add(new T.Mesh(g,glass));
    tube(a,apex,.11);
    const sample=(x,y)=>a.clone().multiplyScalar(1-x-y).addScaledVector(b,x).addScaledVector(apex,y);
    for(let j=1;j<18;j++){
      const f=j/18;
      line(sample(f,0),sample(f,1-f),isFront);
      line(sample(1-f,0),sample(0,1-f),isFront);
    }
    emit(a,b);
  }
  root.add(new T.LineSegments(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(lines,3)),new T.LineBasicMaterial({color:'#546e7b'})));
  // Recessed glazed entrance, visible through the trapezoidal opening.
  box(root,9.4,.16,5,0,.08,16.7,trim);
  box(root,8,3.5,.24,0,1.9,14.48,windowDark);
  const doorGlass=new T.MeshBasicMaterial({color:'#91b3bd'});
  for(const x of [-3.15,-1.6,0,1.6,3.15]){
    box(root,.11,3.38,.25,x,1.84,14.79,steel);
    if(x<3)box(root,1.42,2.94,.07,x+.78,1.68,14.66,doorGlass);
  }
  box(root,6.7,.2,.64,0,3.57,14.76,steel);
  const entrySign=sign(root,0,3.7,16.45,6.15,.5,(ctx,w,h)=>{
    ctx.fillStyle='#374954';ctx.fillRect(0,0,w,h);
    ctx.fillStyle='#efe6d3';ctx.font='600 49px Georgia';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('UNSER LOUVRE',w/2,h/2);
  });
  entrySign.material.transparent=false;entrySign.material.depthWrite=true;
  return root;
}
export const makeOutdoorSky=()=>texture(512,512,(ctx,w,h)=>{
  const sky=ctx.createLinearGradient(0,0,0,h);
  sky.addColorStop(0,'#5898ce');sky.addColorStop(.65,'#9dc9e5');sky.addColorStop(1,'#dce9ec');
  ctx.fillStyle=sky;ctx.fillRect(0,0,w,h);
  for(const [x,y,r] of [[60,125,65],[107,109,56],[168,141,62],[400,69,57],[446,84,52],[284,228,47]]){
    const cloud=ctx.createRadialGradient(x,y,0,x,y,r);
    cloud.addColorStop(0,'rgba(255,252,244,.84)');cloud.addColorStop(1,'rgba(255,252,244,0)');
    ctx.fillStyle=cloud;ctx.fillRect(x-r,y-r,r*2,r*2);
  }
});
