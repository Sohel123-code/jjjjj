import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

export function CampusMap({boundary,fix,people,me,onPerson,peerId,network}) {
  const container=useRef(),map=useRef(),layer=useRef(),fence=useRef(),drawFn=useRef();
  const latest=useRef({people,fix,me,onPerson,peerId,network});
  latest.current={people,fix,me,onPerson,peerId,network};

  useEffect(()=>{
    let disposed=false,resize;
    if(!boundary?.centre||!container.current)return;

    import('leaflet').then(({default:L})=>{
      if(disposed||!container.current)return;

      // If map already exists, smoothly update the boundary circle and redraw
      if(map.current){
        if(fence.current&&boundary.type==='radius'){
          fence.current.setLatLng([boundary.centre.latitude,boundary.centre.longitude]);
          fence.current.setRadius(boundary.radiusM||1000);
          const lat=boundary.centre.latitude, lng=boundary.centre.longitude, r=boundary.radiusM||1000;
          const dLat=r/111320, dLng=r/(111320*Math.cos((lat*Math.PI)/180)||1);
          map.current.fitBounds([[lat-dLat,lng-dLng],[lat+dLat,lng+dLng]],{padding:[35,35]});
        }
        draw(L);
        return;
      }

      const view=L.map(container.current,{zoomControl:true});
      map.current=view;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
        attribution:'© OpenStreetMap contributors',
        maxZoom:19
      }).addTo(view);

      const circleOrPoly=boundary.type==='radius'
        ? L.circle([boundary.centre.latitude,boundary.centre.longitude],{
            radius:boundary.radiusM||1000,
            color:'#15803d',
            weight:2,
            fillColor:'#22c55e',
            fillOpacity:0.12,
            dashArray:'6, 6'
          })
        : L.polygon((boundary.vertices||[]).map(([lng,lat])=>[lat,lng]),{
            color:'#15803d',
            weight:2,
            fillColor:'#22c55e',
            fillOpacity:0.12
          });

      circleOrPoly.addTo(view);
      fence.current=circleOrPoly;

      let bounds;
      if(boundary.type==='radius'){
        const lat=boundary.centre.latitude, lng=boundary.centre.longitude, r=boundary.radiusM||1000;
        const dLat=r/111320, dLng=r/(111320*Math.cos((lat*Math.PI)/180)||1);
        bounds=L.latLngBounds([lat-dLat,lng-dLng],[lat+dLat,lng+dLng]);
      }else{
        bounds=circleOrPoly.getBounds();
      }
      if(bounds?.isValid()) view.fitBounds(bounds,{padding:[35,35]});

      layer.current=L.layerGroup().addTo(view);
      draw(L);

      if(container.current){
        resize=new ResizeObserver(()=>view.invalidateSize());
        resize.observe(container.current);
      }
    });

    function draw(L){
      if(!layer.current)return;
      layer.current.clearLayers();
      const state=latest.current;

      const pins=(state.people||[]).filter(p=>
        Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&
        (state.me?.publicId?p.id!==state.me.publicId:true)
      );

      if(state.fix){
        pins.push({
          id:state.me?.publicId||state.me?.id||'me',
          alias:state.me?.alias||'You',
          avatar:state.me?.avatar||'🦊',
          latitude:state.fix.latitude,
          longitude:state.fix.longitude
        });
      }

      for(const p of pins){
        const isMe=state.me?.publicId?p.id===state.me.publicId:p.id==='me';
        const isSelectedPeer=!isMe&&state.peerId===p.id;

        const el=document.createElement('button');
        el.className='campus-avatar-pin'+(isMe?' is-me':' is-peer')+(isSelectedPeer?' is-active-peer':'');
        el.textContent=p.avatar;
        el.setAttribute('aria-label',isMe?'You (@'+p.alias+')':'Chat live with @'+p.alias);
        el.title=isMe?'You (@'+p.alias+')':'Click to chat live with @'+p.alias;

        const triggerChat=(e)=>{
          e?.stopPropagation?.();
          if(!isMe)state.onPerson?.(p);
        };

        el.addEventListener('click',triggerChat);

        const marker=L.marker([p.latitude,p.longitude],{
          icon:L.divIcon({html:el,className:'campus-marker',iconSize:[44,44],iconAnchor:[22,22]}),
          zIndexOffset:isMe?1000:isSelectedPeer?900:100
        }).addTo(layer.current);

        marker.on('click',(e)=>{
          if(L?.DomEvent) L.DomEvent.stopPropagation(e);
          triggerChat(e);
        });

        marker.bindTooltip(
          isMe
            ? `<div style="text-align:center;padding:2px 4px"><b>You</b> (@${p.alias})<br/><small style="color:#d97706;font-weight:600">● Your live location</small></div>`
            : `<div style="text-align:center;padding:2px 4px"><b>@${p.alias}</b>${p.distance!=null?`<br/><small style="color:#4b5563">${p.distance}m away</small>`:''}<br/><span style="color:#15803d;font-size:11px;font-weight:700">● Click to chat live</span></div>`,
          {direction:'top',offset:[0,-22],opacity:0.95}
        );
      }

      if(state.network&&pins.length>1){
        for(const p of pins.slice(1)){
          L.polyline([[pins[0].latitude,pins[0].longitude],[p.latitude,p.longitude]],{
            color:'#7d9d71',
            weight:1,
            dashArray:'4 8',
            interactive:false
          }).addTo(layer.current);
        }
      }
    }

    drawFn.current=draw;

    return()=>{
      disposed=true;
      resize?.disconnect();
    };
  },[boundary?.type,boundary?.centre?.latitude,boundary?.centre?.longitude,boundary?.radiusM,JSON.stringify(boundary?.vertices)]);

  useEffect(()=>{
    if(map.current&&drawFn.current){
      import('leaflet').then(({default:L})=>drawFn.current?.(L));
    }
  },[people,fix,me?.avatar,me?.alias,peerId,network]);

  return <div className="campus-map" ref={container} aria-label="Campus fence and people sharing live positions"/>;
}
