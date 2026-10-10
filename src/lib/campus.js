import * as THREE from 'three';

export function createCampus(stage) {
  const host = stage.querySelector('#campus-canvas');
  const events = new AbortController();
  const listen = (element, event, handler, options = {}) => element.addEventListener(event, handler, { ...options, signal: events.signal });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); }
  catch { stage.classList.add('fallback-mode'); stage.querySelector('.scene-fallback').hidden = false; return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0xf8f9f5, 0);
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-13, 13, 10, -10, .1, 150);
  const target = new THREE.Vector3(0, 0, 0);
  const campus = new THREE.Group(); scene.add(campus);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x819b6e, 2.7));
  const sunlight = new THREE.DirectionalLight(0xfff7e5, 3.5);
  sunlight.position.set(-10, 22, 10); sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunlight.shadow.camera, { left: -17, right: 17, top: 17, bottom: -17, near: 1, far: 60 });
  sunlight.shadow.normalBias = .035; sunlight.shadow.bias = -.0001;
  scene.add(sunlight);
  const colors = { cream:0xf2eddb, roof:0xb4c0ab, darkRoof:0x71856e, window:0x829e92, windowLit:0xe7d6a3, trunk:0x9b8970, stone:0xd7ddcc };
  const materials = new Map();
  function mat(color, options={}) {
    const key = color + JSON.stringify(options);
    if(!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({color, roughness:.85, ...options}));
    return materials.get(key);
  }
  function box(x,y,z,w,h,d,color,parent=campus) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat(color));
    mesh.position.set(x,y,z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function cylinder(x,y,z,r,h,color,parent=campus,segments=16) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,segments),mat(color));
    mesh.position.set(x,y,z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function line(points,color,r=.022,parent=campus) {
    const curve = new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)),false,'centripetal',0);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(2,points.length*6),r,6,false),mat(color)); parent.add(mesh);return mesh;
  }
  // An original, procedural campus model: no external 3D asset requests.
  const shape = new THREE.Shape();
  const outline = [[-9,-6.7],[-5.4,-8.3],[7.3,-8.3],[9.3,-5.2],[9.3,6.3],[5.9,8.1],[-7.1,8.1],[-9,5]];
  outline.forEach(([x,z],i)=> i ? shape.lineTo(x,z):shape.moveTo(x,z)); shape.closePath();
  const island = new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.55,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.16,bevelThickness:.12}),mat(0xd4dfbe));
  island.rotation.x = -Math.PI/2; island.position.y = -.65; island.receiveShadow=true; island.castShadow=true;campus.add(island);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.11}));ground.rotation.x=-Math.PI/2;ground.position.y=-.83;scene.add(ground);
  box(0,-.06,0,2,.12,15.9,0xf0eedf);box(0,-.05,0,16.8,.13,1.4,0xf1efe3);
  box(-4.8,-.035,-4.6,6.7,.12,5.4,0xe6e7da);box(4.8,-.035,-4.6,6.7,.12,5.4,0xe6e7da);
  box(-4.9,-.035,4.7,6.4,.12,5.6,0xe6e7da);box(4.9,-.035,4.7,6.4,.12,5.6,0xe6e7da);
  // Lawns around the central promenade.
  for(const [x,z,w,d] of [[-2.8,-1.9,2.4,1.8],[2.8,-1.9,2.4,1.8],[-2.8,1.9,2.4,1.7],[2.8,1.9,2.4,1.7]]) box(x,.015,z,w,.06,d,0xadbd87);
  function building(x,z,w,d,h,color=colors.cream) {
    const group = new THREE.Group(); group.position.set(x,0,z); campus.add(group);
    box(0,.14,0,w+.3,.28,d+.3,0xb9c0ad,group);
    box(0,h/2+.25,0,w,h,d,color,group);
    box(0,h+.27,0,w+.16,.18,d+.16,colors.roof,group);
    box(0,h+.39,0,w-.25,.08,d-.25,0x98a794,group);
    for(const zz of [-d/2,d/2]) box(0,h+.4,zz,w+.17,.3,.10,0xd7ddcc,group);
    for(const xx of [-w/2,w/2]) box(xx,h+.4,0,.10,.3,d+.18,0xd7ddcc,group);
    box(-w*.15,h+.54,-d*.16,w*.29,.24,d*.27,0xc3cbbc,group);
    const floors = Math.floor(h/.7), cols = Math.floor(w/.6);
    for(let floor=0;floor<floors;floor++) {
      for(let col=0;col<cols;col++) {
        const xx = -w/2+.4+col*(w-.8)/Math.max(cols-1,1), yy=.67+floor*.69;
        box(xx,yy,d/2+.025,.26,.36,.055,(floor+col)%5===0?colors.windowLit:colors.window,group);
        box(xx,yy,-d/2-.025,.26,.36,.055,colors.window,group);
      }
      for(let col=0;col<Math.floor(d/.65);col++) {
        const zz=-d/2+.4+col*.65;
        box(w/2+.025,.67+floor*.69,zz,.055,.36,.26,colors.window,group);
        box(-w/2-.025,.67+floor*.69,zz,.055,.36,.26,colors.window,group);
      }
    }
    box(0,.67,d/2+.04,.55,.85,.08,0x557264,group);
    box(0,1.18,d/2+.26,1.1,.12,.65,colors.cream,group);
    box(0,.17,d/2+.4,1.3,.12,.75,0xcdd2c2,group);
    return group;
  }
  building(-4.9,-4.4,4.3,2.8,3.3);
  building(4.65,-4.65,4.4,2.8,2.6,0xe1dfc9);
  building(-5.1,4.5,4.3,2.6,2.2,0xd7ddc8);
  building(5.6,3.2,2.6,2.3,1.5,0xe1cdb0);
  // A pavilion and clock tower give the miniature a recognisable campus silhouette.
  box(-.1,1.8,-6.2,1.5,3.6,1.4,0xe5e2ca);box(-.1,3.68,-6.2,1.7,.2,1.6,0x879980);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.35,.85,4),mat(0x66846f));roof.rotation.y=Math.PI/4;roof.position.set(-.1,4.18,-6.2);roof.castShadow=true;campus.add(roof);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(.33,24),mat(0xf8f4df));clock.position.set(-.1,2.94,-5.489);campus.add(clock);
  box(-.1,3.015,-5.478,.035,.16,.015,0x4f6b53);box(-.035,2.94,-5.475,.16,.035,.016,0x4f6b53);
  // Central fountain with a quietly animated water surface.
  cylinder(0,.06,0,1.05,.2,0xe8e7d8);const water=cylinder(0,.18,0,.86,.045,0x8bbcb2);
  cylinder(0,.29,0,.18,.3,0xdde3cf);cylinder(0,.48,0,.43,.12,0xe9ecdb);
  // Tennis court with painted lines and a net.
  box(5.15,.08,6.1,4.1,.08,2.15,0x839e8b);
  for(const z of [5.19,7.0])box(5.15,.128,z,3.72,.014,.027,0xebefdd);
  for(const x of [3.3,7.0])box(x,.128,6.1,.027,.014,1.84,0xebefdd);
  box(5.15,.128,6.1,.027,.014,1.84,0xebefdd);
  for(const z of [5.4,6.8])box(5.15,.128,z,3.72,.014,.023,0xebefdd);
  box(5.15,.38,6.1,.02,.5,2.18,0xa9b6a3);for(const z of [5,7.2])cylinder(5.15,.42,z,.035,.75,0x526d5d);
  // Repeatable low-poly trees, with a deterministic palette and scale.
  let seed=42;function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
  const treeGeometry = new THREE.IcosahedronGeometry(1,1);
  function tree(x,z,s=1) {
    cylinder(x,.45*s,z,.095*s,.9*s,colors.trunk,campus,7);
    const crown = new THREE.Mesh(treeGeometry,mat([0x658657,0x7b985e,0x89a36a,0x55794f][Math.floor(random()*4)]));
    crown.position.set(x,1.13*s,z);crown.scale.set(.49*s,.65*s,.48*s);crown.rotation.y=random()*5;crown.castShadow=true;crown.receiveShadow=true;campus.add(crown);
    const crown2=new THREE.Mesh(treeGeometry,mat(0x83a06c));crown2.position.set(x+.24*s,.96*s,z+.11*s);crown2.scale.setScalar(.32*s);crown2.castShadow=true;campus.add(crown2);
  }
  for(let z=-6.9;z<7.5;z+=1.55){tree(-8,z,.8+random()*.25);tree(8.2,z,.8+random()*.25);}
  for(let x=-6.7;x<8;x+=1.5){tree(x,-7.4,.8+random()*.25);if(x<2)tree(x,7.2,.8+random()*.25);}
  for(const [x,z] of [[-2.6,-2.0],[-3.7,-1.8],[2.5,-1.7],[3.6,-1.6],[-2.5,2],[-3.5,1.9],[2.5,1.8],[-1.4,4],[-1.4,5.4],[1.5,4.4],[1.5,-4.5],[-1.5,-4.3]])tree(x,z,.68+random()*.2);
  // Benches, hedges, lampposts and people make the scene feel lived in.
  for(const [x,z] of [[-2.3,.9],[2.3,-.9],[-2.3,-.9],[2.3,.9]]) {
    box(x,.33,z,.7,.09,.23,0x9a8767);box(x,.54,z+.09,.7,.3,.065,0xaa9271);
    for(const xx of [x-.25,x+.25])box(xx,.17,z,.05,.27,.15,0x667760);
  }
  for(const x of [-1.12,1.12])for(const z of [-3.3,3.3,6.4]){
    cylinder(x,.67,z,.026,1.34,0x7b8974,campus,7);box(x,1.34,z,.16,.19,.16,0xf1edd4);
  }
  for(const [x,z] of [[.8,2.3],[-.7,3.1],[.4,-3],[-2.4,.2],[3.7,.1],[-.3,5.5],[-6,1.1]]) {
    const c=[0xb68158,0x637c93,0x7f7f68][Math.floor(random()*3)];
    cylinder(x,.24,z,.075,.31,c,campus,8);const head=new THREE.Mesh(new THREE.SphereGeometry(.065,8,8),mat(0xc6aa87));head.position.set(x,.455,z);campus.add(head);
  }
  // Explicit polygon boundary, with vertex markers and softly rising corner beacons.
  const boundary=[[-8.8,-6.3],[-5.5,-8],[7,-8],[9,-5],[9,6],[5.7,7.8],[-6.9,7.8],[-8.8,4.8]];
  for(let i=0;i<boundary.length;i++){
    const [x,z]=boundary[i], [nx,nz]=boundary[(i+1)%boundary.length];line([[x,.12,z],[nx,.12,nz]],0x74a561,.045);
    cylinder(x,.13,z,.11,.075,0xc5ed9e);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.45,1.48,64),new THREE.MeshBasicMaterial({color:0xa6c380,transparent:true,opacity:.45,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.position.y=.03;campus.add(ring);
  let angle=.68, desiredAngle=.68, scrollProgress=0, pointer=null, active=true, inView=true, frame=0;
  const pins=[{el:stage.querySelector('.pin-library'),point:new THREE.Vector3(-4.9,4.1,-4.4)},{el:stage.querySelector('.pin-cafe'),point:new THREE.Vector3(5.6,2.2,3.2)}];
  function resize(){const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);const span=w<450?12.9:12.5;camera.left=-span;camera.right=span;camera.top=span*h/w;camera.bottom=-span*h/w;camera.updateProjectionMatrix();render(performance.now());}
  function render(time){
    angle+=(desiredAngle-angle)*.06;
    const drift=reduced.matches?0:Math.sin(time*.00016)*.025;
    camera.position.set(Math.sin(angle+drift)*26,22-scrollProgress*1.8,Math.cos(angle+drift)*26);
    target.set(0,.7+scrollProgress*.6,0);camera.lookAt(target);
    campus.position.y=reduced.matches?0:Math.sin(time*.00065)*.035;
    water.material.color.setHSL(.46,.21,.63+(reduced.matches?0:Math.sin(time*.001)*.025));
    renderer.render(scene,camera);
    for(const pin of pins){const p=pin.point.clone().applyMatrix4(campus.matrixWorld).project(camera);pin.el.style.left=`${(p.x*.5+.5)*host.clientWidth-pin.el.offsetWidth/2}px`;pin.el.style.top=`${(-p.y*.5+.5)*host.clientHeight-pin.el.offsetHeight}px`;}
  }
  function tick(time){frame=0;if(!active||!inView)return;render(time);if(!reduced.matches || Math.abs(angle-desiredAngle)>.001)frame=requestAnimationFrame(tick);}
  function wake(){if(!frame&&active&&inView)frame=requestAnimationFrame(tick);}
  listen(host,'pointerdown',e=>{if(e.pointerType==='touch')return;pointer=e.clientX;host.setPointerCapture(e.pointerId);});
  listen(host,'pointermove',e=>{if(pointer===null)return;desiredAngle+=(e.clientX-pointer)*.008;pointer=e.clientX;wake();});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])listen(host,event,()=>pointer=null);
  listen(stage.querySelector('#rotate-campus'),'click',()=>{desiredAngle+=.5;wake();});
  listen(stage.querySelector('#reset-campus'),'click',()=>{desiredAngle=.68;wake();});
  listen(window,'scroll',()=>{scrollProgress=Math.min(window.scrollY/800,1);if(!reduced.matches)wake();},{passive:true});
  listen(document,'visibilitychange',()=>{active=!document.hidden;wake();});
  listen(reduced,'change',wake);
  const visibilityObserver = new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;wake();},{rootMargin:'100px'});
  visibilityObserver.observe(stage);
  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(host);
  listen(renderer.domElement,'webglcontextlost',e=>{e.preventDefault();active=false;stage.classList.add('fallback-mode');stage.querySelector('.scene-fallback').hidden=false;});
  resize();wake();
  return () => {
    active = false;
    cancelAnimationFrame(frame);
    events.abort(); visibilityObserver.disconnect(); sizeObserver.disconnect();
    const geometries = new Set(), sceneMaterials = new Set();
    scene.traverse(object => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) for (const material of [object.material].flat()) sceneMaterials.add(material);
    });
    geometries.forEach(geometry => geometry.dispose());
    sceneMaterials.forEach(material => material.dispose());
    sunlight.shadow.dispose(); renderer.dispose(); renderer.domElement.remove();
  };
}
