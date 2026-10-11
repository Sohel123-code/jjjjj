-- Polygon v2: private application tables, authorized RPC, private attachments.
-- Run in a transaction. Existing public tables are preserved; see legacy import.
begin;
create schema if not exists polygon_private;
revoke all on schema polygon_private from public, anon, authenticated;

create table polygon_private.profiles (
  user_id uuid primary key, alias text not null check (alias ~ '^[A-Za-z][A-Za-z0-9_]{2,23}$'),
  avatar text not null default '🦊'
);
create unique index profiles_unique_alias on polygon_private.profiles(lower(alias));
create table polygon_private.zones (
  id uuid primary key default gen_random_uuid(), name text not null, type text not null,
  boundary jsonb not null, owner_uid uuid not null, token_hash text unique not null,
  invite_token text, domains jsonb not null, created_at bigint not null
);
create table polygon_private.members (
  zone_id uuid references polygon_private.zones on delete cascade,
  user_id uuid references polygon_private.profiles, public_id text not null,
  role text not null check(role in ('admin','member')),
  status text not null check(status in ('active','pending','rejected','blocked','left')),
  primary key(zone_id,user_id), unique(zone_id,public_id)
);
create table polygon_private.sessions (
  zone_id uuid, user_id uuid, expires_at bigint not null,
  primary key(zone_id,user_id), foreign key(zone_id,user_id) references polygon_private.members on delete cascade
);
create table polygon_private.content (
  id uuid primary key default gen_random_uuid(), zone_id uuid references polygon_private.zones,
  author_uid uuid references polygon_private.profiles, kind text not null check(kind in ('post','group','comment','message')),
  parent_id uuid references polygon_private.content, group_id uuid references polygon_private.content,
  event_id uuid references polygon_private.content, status text not null default 'active',
  created_at bigint not null, expires_at bigint not null, body jsonb not null,
  image_path text, image_bucket text not null default 'polygon-media'
);
create index content_zone_date on polygon_private.content(zone_id,created_at desc);
create index content_parent on polygon_private.content(parent_id);
create index content_group on polygon_private.content(group_id,created_at);
create table polygon_private.group_members (
  group_id uuid references polygon_private.content, user_id uuid references polygon_private.profiles,
  primary key(group_id,user_id)
);
create table polygon_private.likes (
  content_id uuid references polygon_private.content, user_id uuid references polygon_private.profiles,
  primary key(content_id,user_id)
);
create table polygon_private.blocks (
  zone_id uuid references polygon_private.zones, owner_uid uuid references polygon_private.profiles,
  target_uid uuid references polygon_private.profiles, primary key(zone_id,owner_uid,target_uid),
  check(owner_uid<>target_uid)
);
create table polygon_private.reports (
  id uuid primary key default gen_random_uuid(), zone_id uuid references polygon_private.zones,
  reporter_uid uuid references polygon_private.profiles, target_id text not null, target_type text not null,
  author_id text not null, reason text not null, status text not null default 'open',
  created_at bigint not null, evidence jsonb
);
create index reports_zone on polygon_private.reports(zone_id,created_at desc);
create table polygon_private.audit (
  id uuid primary key default gen_random_uuid(), zone_id uuid references polygon_private.zones,
  user_id uuid not null, action text not null, target text, created_at bigint not null
);
create table polygon_private.presence (
  group_id uuid references polygon_private.content, user_id uuid references polygon_private.profiles,
  until_at bigint not null, typing_until bigint not null, primary key(group_id,user_id)
);
create table polygon_private.uploads (
  path text primary key, zone_id uuid references polygon_private.zones, user_id uuid not null,
  scope jsonb not null, mime text not null, expires_at bigint not null
);
create table polygon_private.rates (
  user_id uuid, action text, window_start bigint not null, used integer not null,
  primary key(user_id,action)
);

create function polygon_private.now_ms() returns bigint language sql volatile set search_path='' as $$
  select floor(extract(epoch from clock_timestamp())*1000)::bigint
$$;
create function polygon_private.is_admin(z uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from polygon_private.members where zone_id=z and user_id=auth.uid() and role='admin' and status='active')
$$;
create function polygon_private.has_access(z uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from polygon_private.members m where m.zone_id=z and m.user_id=auth.uid() and m.status='active'
    and (m.role='admin' or exists(select 1 from polygon_private.sessions s where s.zone_id=z and s.user_id=m.user_id and s.expires_at>extract(epoch from statement_timestamp())*1000)))
$$;
create function polygon_private.blocked(z uuid,u uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from polygon_private.blocks b where b.zone_id=z and
    ((b.owner_uid=auth.uid() and b.target_uid=u) or (b.target_uid=auth.uid() and b.owner_uid=u)))
$$;
create function polygon_private.readable(cid uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare c polygon_private.content;
begin
  select * into c from polygon_private.content where id=cid;
  if not found or not polygon_private.has_access(c.zone_id) then return false; end if;
  if polygon_private.is_admin(c.zone_id) then return true; end if;
  if c.status<>'active' or c.expires_at<=extract(epoch from statement_timestamp())*1000 or polygon_private.blocked(c.zone_id,c.author_uid) then return false; end if;
  if c.parent_id is not null and not polygon_private.readable(c.parent_id) then return false; end if;
  if c.event_id is not null and not polygon_private.readable(c.event_id) then return false; end if;
  if c.group_id is not null and (not polygon_private.readable(c.group_id) or not exists(select 1 from polygon_private.group_members where group_id=c.group_id and user_id=auth.uid())) then return false; end if;
  return true;
end $$;
create function polygon_private.content_json(c polygon_private.content) returns jsonb language sql stable set search_path='' as $$
 select c.body || jsonb_build_object('id',c.id,'kind',c.kind,'status',c.status,'createdAt',c.created_at,'expiresAt',c.expires_at,
   'parentId',c.parent_id,'groupId',c.group_id,'eventId',c.event_id,'imagePath',c.image_path,'imageBucket',c.image_bucket,
   'authorId',m.public_id,'alias',p.alias,'avatar',p.avatar,'official',m.role='admin',
   'likes',(select count(*) from polygon_private.likes where content_id=c.id),
   'memberCount',(select count(*) from polygon_private.group_members where group_id=c.id),
   'joined',exists(select 1 from polygon_private.group_members where group_id=c.id and user_id=auth.uid()))
 from polygon_private.profiles p join polygon_private.members m on m.user_id=p.user_id and m.zone_id=c.zone_id where p.user_id=c.author_uid
$$;
create function polygon_private.throttle(k text,lim integer,span_ms bigint default 60000) returns void language plpgsql set search_path='' as $$
declare t bigint:=polygon_private.now_ms(); r polygon_private.rates;
begin
  insert into polygon_private.rates values(auth.uid(),k,t,0) on conflict do nothing;
  select * into r from polygon_private.rates where user_id=auth.uid() and action=k for update;
  if r.window_start+span_ms<=t then r.used:=0; r.window_start:=t; end if;
  if r.used>=lim then raise exception 'Too many actions. Please try again later.'; end if;
  update polygon_private.rates set used=r.used+1,window_start=r.window_start where user_id=auth.uid() and action=k;
end $$;

-- Uses a campus-scale tangent plane for polygons and great-circle distance for radius zones.
-- Receives a fix transiently; no coordinates are inserted into any table.
create function polygon_private.locate(f jsonb,b jsonb,registration boolean default false) returns text language plpgsql set search_path='' as $$
declare lat float8; lng float8; acc float8; stamp float8; clat float8; clng float8;
  distance float8; radius float8; pts jsonb; n int; i int; j int;
  x float8; y float8; ax float8; ay float8; bx float8; by_ float8; dx float8; dy float8; t float8;
  edge float8:=1e30; inside boolean:=false; area float8:=0;
  cpoint point; dpoint point;
begin
  clat:=(b#>>'{centre,latitude}')::float8; clng:=(b#>>'{centre,longitude}')::float8;
  if clat is null or clng is null or abs(clat)>85 or abs(clng)>180 then raise exception 'Invalid zone centre.'; end if;
  if registration then lat:=clat; lng:=clng; acc:=0; stamp:=polygon_private.now_ms();
  else lat:=(f->>'latitude')::float8; lng:=(f->>'longitude')::float8; acc:=(f->>'accuracy')::float8; stamp:=(f->>'timestamp')::float8; end if;
  if lat is null or lng is null or acc is null or stamp is null or abs(lat)>90 or abs(lng)>180 or acc<0 or acc>100 or stamp<polygon_private.now_ms()-30000 or stamp>polygon_private.now_ms()+5000 then return 'uncertain'; end if;
  distance:=12742017.6*asin(sqrt(least(1,power(sin(radians(lat-clat)/2),2)+cos(radians(lat))*cos(radians(clat))*power(sin(radians(lng-clng)/2),2))));
  if b->>'type'='radius' then
    radius:=(b->>'radiusM')::float8;
    if radius is null or radius<50 or radius>10000 then raise exception 'Radius must be between 50 and 10000 metres.'; end if;
    return case when distance+acc+2<radius then 'inside' when distance-acc-2>radius then 'outside' else 'uncertain' end;
  end if;
  pts:=b->'vertices'; n:=jsonb_array_length(pts);
  if b->>'type' is distinct from 'polygon' or n is null or n<4 or n>101 or pts->0<>pts->(n-1) then raise exception 'Invalid closed polygon.'; end if;
  x:=radians(lng-clng)*6371008.8*cos(radians(clat)); y:=radians(lat-clat)*6371008.8;
  for i in 0..n-2 loop
    if jsonb_array_length(pts->i)<>2 or abs((pts->i->>0)::float8)>180 or abs((pts->i->>1)::float8)>90 then raise exception 'Invalid polygon vertex.'; end if;
    ax:=radians((pts->i->>0)::float8-clng)*6371008.8*cos(radians(clat)); ay:=radians((pts->i->>1)::float8-clat)*6371008.8;
    bx:=radians((pts->(i+1)->>0)::float8-clng)*6371008.8*cos(radians(clat)); by_:=radians((pts->(i+1)->>1)::float8-clat)*6371008.8;
    if sqrt(ax*ax+ay*ay)>10000 then raise exception 'Keep polygon vertices within 10 km of the centre.'; end if;
    if (ay>y)<>(by_>y) then if x<(bx-ax)*(y-ay)/(by_-ay)+ax then inside:=not inside; end if; end if;
    dx:=bx-ax; dy:=by_-ay;
    if dx*dx+dy*dy=0 then raise exception 'Polygon vertices must be distinct.'; end if;
    t:=greatest(0,least(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));
    edge:=least(edge,sqrt(power(x-ax-t*dx,2)+power(y-ay-t*dy,2))); area:=area+ax*by_-bx*ay;
  end loop;
  if registration then
    for i in 0..n-2 loop
      for j in i+2..n-2 loop
        if i=0 and j=n-2 then continue; end if;
        cpoint:=point((pts->j->>0)::float8,(pts->j->>1)::float8);
        dpoint:=point((pts->(j+1)->>0)::float8,(pts->(j+1)->>1)::float8);
        if lseg(point((pts->i->>0)::float8,(pts->i->>1)::float8),point((pts->(i+1)->>0)::float8,(pts->(i+1)->>1)::float8)) ?# lseg(cpoint,dpoint) then
          raise exception 'Polygon edges must not cross or overlap.';
        end if;
      end loop;
    end loop;
  end if;
  if abs(area)<1 then raise exception 'Polygon must enclose an area.'; end if;
  if registration and not inside and edge>1 then raise exception 'Zone centre must be inside the polygon.'; end if;
  return case when edge<=acc+5 then 'uncertain' when inside then 'inside' else 'outside' end;
end $$;

create function public.polygon_api(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); z uuid; now_ bigint:=polygon_private.now_ms(); zid uuid; cid uuid; gid uuid; pid uuid; eid uuid;
 zone polygon_private.zones; member polygon_private.members; profile polygon_private.profiles; target polygon_private.content; parent polygon_private.content;
 person polygon_private.members; upload polygon_private.uploads; body jsonb; result jsonb; active jsonb; rows_ jsonb; report_rows jsonb;
 token text; name_ text; state_ text; text_ text; title_ text; kind_ text; category_ text; image_ text; expiry_ bigint;
 admin boolean; manage boolean; scope_ jsonb; source_action text; aliases int:=0; hours_ numeric;
begin
 if u is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in with your Google account first.'; end if;
 if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>30000 then raise exception 'Invalid request.'; end if;
 -- Serialize each user's mutations, including aliases, rate limits and retries.
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if not exists(select 1 from polygon_private.profiles where user_id=u) then
   loop
     begin
       insert into polygon_private.profiles(user_id,alias) values(u,'Member_'||substr(replace(gen_random_uuid()::text,'-',''),1,12));
       exit;
     exception when unique_violation then aliases:=aliases+1; if aliases>5 then raise; end if;
     end;
   end loop;
 end if;
 select * into profile from polygon_private.profiles where user_id=u;
 if action='bootstrap' then
   select coalesce(jsonb_agg(jsonb_build_object('zoneId',a.id,'name',a.name,'role',m.role,'status',m.status,'alias',profile.alias,'avatar',profile.avatar)),'[]') into rows_
   from polygon_private.members m join polygon_private.zones a on a.id=m.zone_id where m.user_id=u and m.status<>'left';
   return jsonb_build_object('memberships',rows_);
 end if;
 if action='registerZone' then
   perform polygon_private.throttle('registerZone',5,86400000);
   name_:=btrim(payload->>'name');
   if name_ is null or length(name_) not between 2 and 80 or length(coalesce(payload->>'type','')) not between 2 and 40 then raise exception 'Enter a zone name and type.'; end if;
   perform polygon_private.locate(null,payload->'boundary',true);
   token:='PZ-'||upper(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''));
   zid:=gen_random_uuid();
   insert into polygon_private.zones values(zid,name_,payload->>'type',payload->'boundary',u,encode(sha256(convert_to(token,'UTF8')),'hex'),token,
     '[{"id":"general","name":"Community","icon":"✦","topics":["General","Questions"]},{"id":"study","name":"Study & Tech","icon":"⌘","topics":["DSA","WebDev","AI/ML"]},{"id":"interests","name":"Shared interests","icon":"✳","topics":["Music","Sports","Books"]}]',now_);
   insert into polygon_private.members values(zid,u,gen_random_uuid()::text,'admin','active');
   return jsonb_build_object('zoneId',zid,'name',name_,'token',token);
 end if;
 if action='joinZone' then
   perform polygon_private.throttle('joinZone',8);
   token:=upper(btrim(payload->>'token'));
   select * into zone from polygon_private.zones where token_hash=encode(sha256(convert_to(token,'UTF8')),'hex');
   if not found then raise exception 'Zone token is invalid or has been rotated.'; end if;
   select * into member from polygon_private.members where zone_id=zone.id and user_id=u;
   if member.status in ('blocked','rejected') then raise exception 'This zone has not approved your access.'; end if;
   insert into polygon_private.members values(zone.id,u,gen_random_uuid()::text,'member','pending')
   on conflict(zone_id,user_id) do update set status=case when polygon_private.members.status='left' then 'pending' else polygon_private.members.status end;
   return jsonb_build_object('zoneId',zone.id,'name',zone.name);
 end if;
 z:=(payload->>'zoneId')::uuid;
 select * into zone from polygon_private.zones where id=z;
 select * into member from polygon_private.members where zone_id=z and user_id=u;
 if zone.id is null or member.user_id is null then raise exception 'Zone membership not found.'; end if;
 admin:=member.role='admin' and member.status='active';
 if action in ('stopLocation','leaveZone') then
   if action='leaveZone' and member.role='admin' then raise exception 'Zone owners cannot leave their managed zone.'; end if;
   delete from polygon_private.sessions where zone_id=z and user_id=u;
   if action='leaveZone' then
     update polygon_private.members set status='left' where zone_id=z and user_id=u;
     delete from polygon_private.group_members where user_id=u and group_id in(select id from polygon_private.content where zone_id=z);
     delete from polygon_private.presence where user_id=u and group_id in(select id from polygon_private.content where zone_id=z);
   end if;
   return '{"ok":true}';
 end if;
 if member.status<>'active' then raise exception 'Management approval is required to access this zone.'; end if;
 if action='verifyLocation' then
   state_:=polygon_private.locate(payload->'fix',zone.boundary);
   expiry_:=case when state_='inside' then now_+45000 else 0 end;
   insert into polygon_private.sessions values(z,u,expiry_) on conflict(zone_id,user_id) do update set expires_at=excluded.expires_at;
   return jsonb_build_object('state',state_,'expiresAt',expiry_);
 end if;
 if not polygon_private.has_access(z) then raise exception 'Verify your live location to access this zone.'; end if;
 manage:=coalesce((payload->>'management')::boolean,false);
 if (manage or action in ('manageUser','removeContent','resolveReport','rotateToken','restoreToken','addDomain','removeDomain')) and not admin then raise exception 'Only this zone’s management can do this.'; end if;
 if action='snapshot' then
   gid:=(payload->>'groupId')::uuid;
   select coalesce(jsonb_agg(polygon_private.content_json(c) order by c.created_at desc),'[]') into active from
     (select * from polygon_private.content c where c.zone_id=z and c.status='active' and c.expires_at>now_ and c.kind<>'message'
       and polygon_private.readable(c.id) order by c.created_at desc limit 300) c;
   result:=jsonb_build_object('zone',jsonb_build_object('id',z,'name',zone.name,'type',zone.type,'domains',zone.domains),
     'me',jsonb_build_object('publicId',member.public_id,'alias',profile.alias,'avatar',profile.avatar,'role',member.role,'status',member.status),
     'posts',coalesce((select jsonb_agg(v) from jsonb_array_elements(active) v where v->>'kind'='post'),'[]'::jsonb),
     'comments',coalesce((select jsonb_agg(v) from jsonb_array_elements(active) v where v->>'kind'='comment'),'[]'::jsonb),
     'groups',coalesce((select jsonb_agg(v) from jsonb_array_elements(active) v where v->>'kind'='group'),'[]'::jsonb),
     'messages','[]'::jsonb,'presence','[]'::jsonb,'truncated',jsonb_array_length(active)=300,
     'myLikes',coalesce((select jsonb_agg(l.content_id) from polygon_private.likes l join polygon_private.content c on c.id=l.content_id where l.user_id=u and c.zone_id=z),'[]'::jsonb),
     'blocked',coalesce((select jsonb_agg(m.public_id) from polygon_private.members m where m.zone_id=z and polygon_private.blocked(z,m.user_id)),'[]'::jsonb));
   if gid is not null then
     select * into target from polygon_private.content where id=gid and zone_id=z and kind='group' and status='active' and expires_at>now_;
     if target.id is null or not polygon_private.readable(gid) or (not admin and not exists(select 1 from polygon_private.group_members where group_id=gid and user_id=u)) then raise exception 'This group is no longer available.'; end if;
     select coalesce(jsonb_agg(polygon_private.content_json(c) order by c.created_at),'[]') into rows_ from
       (select * from polygon_private.content c where c.group_id=gid and c.status='active' and c.expires_at>now_ and polygon_private.readable(c.id) order by c.created_at desc limit 300) c;
     result:=result||jsonb_build_object('messages',rows_,'presence',coalesce((select jsonb_agg(jsonb_build_object('authorId',m.public_id,'alias',p.alias,'avatar',p.avatar,'until',pr.until_at,'typingUntil',pr.typing_until))
       from polygon_private.presence pr join polygon_private.profiles p on p.user_id=pr.user_id join polygon_private.members m on m.zone_id=z and m.user_id=pr.user_id
       where pr.group_id=gid and pr.until_at>now_ and m.status='active' and not polygon_private.blocked(z,pr.user_id)),'[]'::jsonb));
   end if;
   if manage then
     result:=jsonb_set(result,'{zone,boundary}',zone.boundary);
     select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'targetId',r.target_id,'targetType',r.target_type,'reporterUid',r.reporter_uid,'authorId',r.author_id,'reason',r.reason,'status',r.status,'createdAt',r.created_at,'evidence',r.evidence) order by r.created_at desc),'[]')
       into report_rows from (select * from polygon_private.reports where zone_id=z order by created_at desc limit 300) r;
     result:=result||jsonb_build_object('inviteToken',zone.invite_token,'reports',report_rows,'moderation','[]'::jsonb,
       'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'publicId',m.public_id,'alias',p.alias,'avatar',p.avatar,'role',m.role,'status',m.status,'violations',0))
         from polygon_private.members m join polygon_private.profiles p on p.user_id=m.user_id where m.zone_id=z),'[]'::jsonb),
       'allContent',coalesce((select jsonb_agg(polygon_private.content_json(c)) from (select * from polygon_private.content where zone_id=z order by created_at desc limit 600) c),'[]'::jsonb),
       'audit',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'uid',a.user_id,'action',a.action,'target',a.target,'createdAt',a.created_at) order by a.created_at desc) from (select * from polygon_private.audit where zone_id=z order by created_at desc limit 300) a),'[]'::jsonb));
   end if;
   return result;
 end if;
 perform polygon_private.throttle(action,case when action in ('message','presence','like') then 30 when action in ('createPost','createGroup') then 5 else 12 end);
 if action in ('createPost','createGroup','comment','message','prepareImage') then
   source_action:=case when action='prepareImage' then payload->>'contentAction' else action end;
   if source_action not in ('createPost','createGroup','comment','message') then raise exception 'Invalid content action.'; end if;
   pid:=null; gid:=null; eid:=null;
   hours_:=coalesce((payload->>'hours')::numeric,24);
   if hours_<0 or hours_>168 then raise exception 'Expiry must be between one minute and seven days.'; end if;
   expiry_:=now_+(hours_*3600000)::bigint;
   if expiry_-now_<60000 then raise exception 'Expiry must be at least one minute.'; end if;
   category_:=coalesce(payload->>'category','post');
   if source_action='createPost' and category_ not in ('post','lost','found','event','announcement','offer','question') then raise exception 'Invalid post category.'; end if;
   if source_action='createPost' and category_ in ('event','announcement') and not admin then raise exception 'Only management can publish official content.'; end if;
   if source_action='comment' then
     pid:=(payload->>'parentId')::uuid;
     select * into parent from polygon_private.content where id=pid and zone_id=z and kind='post' and status='active' and expires_at>now_;
     if parent.id is null or not polygon_private.readable(pid) then raise exception 'This post is no longer available.'; end if;
     expiry_:=parent.expires_at;
     if payload->>'replyTo' is not null and not exists(select 1 from polygon_private.content c where c.id=(payload->>'replyTo')::uuid and c.parent_id=pid and c.kind='comment' and c.status='active' and polygon_private.readable(c.id)) then raise exception 'Reply is not part of this conversation.'; end if;
   elsif source_action='message' then
     gid:=(payload->>'groupId')::uuid;
     select * into parent from polygon_private.content where id=gid and zone_id=z and kind='group' and status='active' and expires_at>now_;
     if parent.id is null or not polygon_private.readable(gid) or not exists(select 1 from polygon_private.group_members where group_id=gid and user_id=u) then raise exception 'Join this group before sending a message.'; end if;
     expiry_:=parent.expires_at;
   elsif source_action='createGroup' then
     if not exists(select 1 from jsonb_array_elements(zone.domains) d where d->>'id'=payload->>'domain' and d->'topics' ? (payload->>'topic')) then raise exception 'Choose a valid group topic.'; end if;
   elsif category_='question' then
     eid:=(payload->>'eventId')::uuid;
     select * into parent from polygon_private.content c where c.id=eid and c.zone_id=z and c.body->>'category'='event' and c.status='active' and c.expires_at>now_;
     if parent.id is null or not polygon_private.readable(eid) then raise exception 'Select an active event.'; end if;
     expiry_:=least(expiry_,parent.expires_at);
   end if;
   scope_:=jsonb_build_object('action',source_action,'parentId',pid,'groupId',gid);
   if action='prepareImage' then
     if payload->>'mime' not in ('image/jpeg','image/png','image/webp') then raise exception 'Unsupported photo format.'; end if;
     image_:=z::text||'/'||u::text||'/'||gen_random_uuid()::text;
     insert into polygon_private.uploads values(image_,z,u,scope_,payload->>'mime',now_+600000);
     return jsonb_build_object('path',image_);
   end if;
   text_:=btrim(coalesce(payload->>'text','')); title_:=btrim(coalesce(payload->>'title',''));
   image_:=nullif(payload->>'imagePath','');
   if length(text_)>2000 or length(title_)>120 or (text_='' and image_ is null) or (source_action in ('createPost','createGroup') and title_='') then raise exception 'Add a title and some text or a photo (text up to 2000 characters).'; end if;
   if (title_||' '||text_||' '||coalesce(payload->>'place','')||' '||coalesce(payload->>'additionalInfo','')||' '||coalesce(payload->>'registration','')) ~* '([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|[0-9][0-9 .()+-]{8,}[0-9])' then raise exception 'Remove phone numbers and email addresses before sharing.'; end if;
   if image_ is not null then
     select * into upload from polygon_private.uploads where path=image_ and zone_id=z and user_id=u and expires_at>now_ and scope=scope_;
     if upload.path is null or not exists(select 1 from storage.objects o where o.bucket_id='polygon-media' and o.name=image_ and (o.metadata->>'size')::bigint between 1 and 1048576 and o.metadata->>'mimetype'=upload.mime) then raise exception 'Photo upload is incomplete or expired. Please attach it again.'; end if;
   end if;
   if source_action='createPost' and category_='event' and ((payload->>'startsAt')::bigint is null or (payload->>'startsAt')::bigint<=now_ or (payload->>'startsAt')::bigint>=expiry_) then raise exception 'Event must start before its expiry and in the future.'; end if;
   if source_action='createPost' and category_='offer' then perform polygon_private.throttle('offers',2,3600000); end if;
   kind_:=case source_action when 'createGroup' then 'group' when 'comment' then 'comment' when 'message' then 'message' else 'post' end;
   -- Explicit allow-list: callers cannot forge author, role, status, times or membership.
   body:=jsonb_build_object('title',title_,'text',text_,'category',category_,'place',left(coalesce(payload->>'place',''),100),
     'itemCategory',left(coalesce(payload->>'itemCategory',''),60),'approximateTime',left(coalesce(payload->>'approximateTime',''),60),
     'additionalInfo',left(coalesce(payload->>'additionalInfo',''),500),'itemStatus',category_,'sponsored',category_='offer',
     'startsAt',payload->'startsAt','registration',left(coalesce(payload->>'registration',''),300),'domain',payload->>'domain','topic',payload->>'topic','replyTo',payload->>'replyTo');
   cid:=gen_random_uuid();
   insert into polygon_private.content(id,zone_id,author_uid,kind,parent_id,group_id,event_id,created_at,expires_at,body,image_path)
     values(cid,z,u,kind_,pid,gid,eid,now_,expiry_,body,image_);
   if image_ is not null then delete from polygon_private.uploads where path=image_; end if;
   if kind_='group' then insert into polygon_private.group_members values(cid,u); end if;
   return jsonb_build_object('id',cid,'matches','[]'::jsonb,'matchStatus','unavailable');
 elsif action in ('deleteContent','removeContent','resolveItem','like','findMatches') then
   select * into target from polygon_private.content where id=(payload->>'target')::uuid and zone_id=z for update;
   if target.id is null or not polygon_private.readable(target.id) then raise exception 'Content is unavailable in this zone.'; end if;
   if action in ('deleteContent','removeContent') then
     if not admin and target.author_uid<>u then raise exception 'You can only delete your own content.'; end if;
     update polygon_private.content set status=case when coalesce((payload->>'disable')::boolean,false) and admin then 'disabled' else 'removed' end where id=target.id or parent_id=target.id or group_id=target.id or event_id=target.id
       or parent_id in(select id from polygon_private.content where event_id=target.id);
   elsif action='resolveItem' then
     if (not admin and target.author_uid<>u) or target.kind<>'post' or target.body->>'category' not in ('lost','found') then raise exception 'Only the author or management can resolve this item.'; end if;
     update polygon_private.content c set body=c.body||'{"itemStatus":"resolved"}' where c.id=target.id;
   elsif action='findMatches' then return '{"matches":[],"matchStatus":"unavailable"}';
   else
     if target.kind<>'post' or target.status<>'active' or target.expires_at<=now_ then raise exception 'This post is no longer active.'; end if;
     delete from polygon_private.likes where content_id=target.id and user_id=u;
     if not found then insert into polygon_private.likes values(target.id,u); end if;
   end if;
 elsif action in ('joinGroup','leaveGroup','presence') then
   gid:=(payload->>'groupId')::uuid;
   select * into target from polygon_private.content where id=gid and zone_id=z and kind='group' and status='active' and expires_at>now_;
   if target.id is null or not polygon_private.readable(gid) then raise exception 'Group is unavailable.'; end if;
   if action='joinGroup' then insert into polygon_private.group_members values(gid,u) on conflict do nothing;
   elsif action='leaveGroup' then delete from polygon_private.group_members where group_id=gid and user_id=u; delete from polygon_private.presence where group_id=gid and user_id=u;
   else
     if not exists(select 1 from polygon_private.group_members where group_id=gid and user_id=u) then raise exception 'Join this group first.'; end if;
     insert into polygon_private.presence values(gid,u,now_+45000,case when coalesce((payload->>'typing')::boolean,false) then now_+4000 else 0 end)
       on conflict(group_id,user_id) do update set until_at=excluded.until_at,typing_until=excluded.typing_until;
   end if;
 elsif action='profile' then
   name_:=btrim(payload->>'alias');
   if name_ is null or name_ !~ '^[A-Za-z][A-Za-z0-9_]{2,23}$' then raise exception 'Use 3–24 letters, numbers or underscores, starting with a letter.'; end if;
   if coalesce(payload->>'avatar','') not in ('🦊','🐼','🦉','🐨','🐸','🐯','🤖','🐱') then raise exception 'Choose an available avatar.'; end if;
   begin update polygon_private.profiles set alias=name_,avatar=payload->>'avatar' where user_id=u;
   exception when unique_violation then raise exception 'That username is already taken. Choose another.'; end;
 elsif action='block' then
   select * into person from polygon_private.members where zone_id=z and public_id=payload->>'target';
   if person.user_id is null or person.user_id=u then raise exception 'Choose another member in this zone.'; end if;
   if coalesce((payload->>'unblock')::boolean,false) then delete from polygon_private.blocks where zone_id=z and owner_uid=u and target_uid=person.user_id;
   else insert into polygon_private.blocks values(z,u,person.user_id) on conflict do nothing; end if;
 elsif action='report' then
   if payload->>'reason' not in ('spam','harassment','hate_speech','scam','privacy_violation','other') then raise exception 'Choose a report reason.'; end if;
   if payload->>'targetType'='user' then
     select * into person from polygon_private.members where zone_id=z and public_id=payload->>'target';
     if person.user_id is null then raise exception 'Member not found in this zone.'; end if;
     body:=jsonb_build_object('kind','user','authorId',person.public_id);
   else
     select * into target from polygon_private.content where id=(payload->>'target')::uuid and zone_id=z;
     if target.id is null or target.kind<>payload->>'targetType' or not polygon_private.readable(target.id) then raise exception 'Reported content is unavailable.'; end if;
     select * into person from polygon_private.members where zone_id=z and user_id=target.author_uid;
     body:=polygon_private.content_json(target);
   end if;
   if exists(select 1 from polygon_private.reports where zone_id=z and reporter_uid=u and target_id=payload->>'target' and status='open') then return '{"ok":true}'; end if;
   insert into polygon_private.reports(zone_id,reporter_uid,target_id,target_type,author_id,reason,created_at,evidence)
     values(z,u,payload->>'target',payload->>'targetType',person.public_id,payload->>'reason',now_,body);
 elsif action='manageUser' then
   select * into person from polygon_private.members where zone_id=z and public_id=payload->>'target';
   if person.user_id is null or person.role='admin' then raise exception 'Cannot change this member.'; end if;
   if payload->>'status' not in ('active','rejected','blocked','left') then raise exception 'Invalid membership status.'; end if;
   update polygon_private.members set status=payload->>'status' where zone_id=z and user_id=person.user_id;
   delete from polygon_private.sessions where zone_id=z and user_id=person.user_id;
   if payload->>'status'<>'active' then
     delete from polygon_private.group_members where user_id=person.user_id and group_id in(select id from polygon_private.content where zone_id=z);
     delete from polygon_private.presence where user_id=person.user_id and group_id in(select id from polygon_private.content where zone_id=z);
   end if;
 elsif action='resolveReport' then
   update polygon_private.reports set status='resolved' where id=(payload->>'target')::uuid and zone_id=z;
   if not found then raise exception 'Report not found in this zone.'; end if;
 elsif action in ('rotateToken','restoreToken') then
   if action='restoreToken' then
     token:=upper(btrim(payload->>'token'));
     if token is null or encode(sha256(convert_to(token,'UTF8')),'hex')<>zone.token_hash then raise exception 'Enter the original token for this zone.'; end if;
   else token:='PZ-'||upper(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')); end if;
   update polygon_private.zones set invite_token=token,token_hash=encode(sha256(convert_to(token,'UTF8')),'hex') where id=z;
   result:=jsonb_build_object('token',token);
 elsif action='addDomain' then
   name_:=btrim(payload->>'name');
   if coalesce(length(name_),0) not between 1 and 60 or coalesce(length(payload->>'topics'),0) not between 1 and 240 or jsonb_array_length(zone.domains)>=20 then raise exception 'Use a short domain name and topic list (maximum 20 domains).'; end if;
   select jsonb_agg(btrim(v)) into rows_ from unnest(string_to_array(payload->>'topics',',')) v where btrim(v)<>'';
   if rows_ is null then raise exception 'Add at least one topic.'; end if;
   update polygon_private.zones set domains=domains||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'name',name_,'icon','✦','topics',rows_)) where id=z;
 elsif action='removeDomain' then
   update polygon_private.zones set domains=coalesce((select jsonb_agg(v) from jsonb_array_elements(domains) v where v->>'id'<>payload->>'target'),'[]') where id=z;
 else raise exception 'Unknown Polygon action: %',action;
 end if;
 if admin and action in ('deleteContent','removeContent','manageUser','resolveReport','rotateToken','restoreToken','addDomain','removeDomain') then
   insert into polygon_private.audit(zone_id,user_id,action,target,created_at) values(z,u,action,coalesce(payload->>'target',z::text),now_);
 end if;
 return coalesce(result,'{"ok":true}'::jsonb);
end $$;

create function polygon_private.media_access(path_ text,bucket_ text,operation_ text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare upload polygon_private.uploads;
begin
 if auth.uid() is null then return false; end if;
 if operation_='read' and exists(select 1 from polygon_private.content c where c.image_path=path_ and c.image_bucket=bucket_ and polygon_private.readable(c.id)) then return true; end if;
 if bucket_<>'polygon-media' then return false; end if;
 select * into upload from polygon_private.uploads where path=path_ and user_id=auth.uid();
 if upload.path is null then return false; end if;
 if operation_='delete' then return not exists(select 1 from polygon_private.content where image_path=path_ and image_bucket=bucket_); end if;
 if upload.expires_at<=extract(epoch from statement_timestamp())*1000 or not polygon_private.has_access(upload.zone_id) then return false; end if;
 if upload.scope->>'parentId' is not null and not polygon_private.readable((upload.scope->>'parentId')::uuid) then return false; end if;
 if upload.scope->>'groupId' is not null and (not polygon_private.readable((upload.scope->>'groupId')::uuid) or not exists(select 1 from polygon_private.group_members where group_id=(upload.scope->>'groupId')::uuid and user_id=auth.uid())) then return false; end if;
 return operation_ in ('insert','read');
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('polygon-media','polygon-media',false,1048576,array['image/jpeg','image/png','image/webp'])
 on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy polygon_media_insert on storage.objects for insert to authenticated with check(bucket_id='polygon-media' and polygon_private.media_access(name,bucket_id,'insert'));
create policy polygon_media_read on storage.objects for select to authenticated using(bucket_id in ('polygon-media','post-images') and polygon_private.media_access(name,bucket_id,'read'));
create policy polygon_media_delete on storage.objects for delete to authenticated using(bucket_id='polygon-media' and polygon_private.media_access(name,bucket_id,'delete'));
-- Restrictive policies prevent any older permissive bucket policy bypassing these checks.
create policy polygon_media_read_guard on storage.objects as restrictive for select to public using(bucket_id not in ('polygon-media','post-images') or polygon_private.media_access(name,bucket_id,'read'));
create policy polygon_media_insert_guard on storage.objects as restrictive for insert to public with check(bucket_id not in ('polygon-media','post-images') or polygon_private.media_access(name,bucket_id,'insert'));
create policy polygon_media_update_guard on storage.objects as restrictive for update to public using(bucket_id not in ('polygon-media','post-images')) with check(bucket_id not in ('polygon-media','post-images'));
create policy polygon_media_delete_guard on storage.objects as restrictive for delete to public using(bucket_id not in ('polygon-media','post-images') or polygon_private.media_access(name,bucket_id,'delete'));
revoke all on all tables in schema polygon_private from public,anon,authenticated;
revoke all on all functions in schema polygon_private from public,anon,authenticated;
grant usage on schema polygon_private to authenticated;
grant execute on function polygon_private.media_access(text,text,text) to authenticated;
revoke all on function public.polygon_api(text,jsonb) from public,anon;
grant execute on function public.polygon_api(text,jsonb) to authenticated;
do $$ declare t text; begin
 for t in select tablename from pg_tables where schemaname='polygon_private' loop
   execute format('alter table polygon_private.%I enable row level security',t);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
