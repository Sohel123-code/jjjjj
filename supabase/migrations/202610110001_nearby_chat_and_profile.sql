-- Migration: Nearby Chat via Supabase Realtime + Profile gender/profession fields.
-- Adds tables for real-time nearby presence & chat without Socket.IO.
begin;

-- 1. Add gender & profession to profiles
alter table polygon_private.profiles
  add column if not exists gender text not null default '',
  add column if not exists profession text not null default '';

-- 2. Nearby presence table — users register their location here
create table if not exists polygon_private.nearby_presence (
  user_id uuid primary key references polygon_private.profiles on delete cascade,
  alias text not null default 'Anonymous',
  avatar text not null default '🦊',
  gender text not null default '',
  profession text not null default '',
  lat double precision,
  lng double precision,
  updated_at bigint not null default 0
);

-- 3. Nearby chat messages — global zone chat
create table if not exists polygon_private.nearby_chat (
  id text primary key,
  user_id uuid not null references polygon_private.profiles on delete cascade,
  alias text not null,
  avatar text not null default '🦊',
  gender text not null default '',
  text text not null check (length(text) between 1 and 1000),
  reply_to text,
  created_at bigint not null,
  edited_at bigint
);
create index if not exists nearby_chat_time on polygon_private.nearby_chat(created_at desc);

-- 4. Nearby DM messages — private messages between two nearby users
create table if not exists polygon_private.nearby_dm (
  id text primary key,
  from_user_id uuid not null references polygon_private.profiles on delete cascade,
  to_user_id uuid not null references polygon_private.profiles on delete cascade,
  from_alias text not null,
  from_avatar text not null default '🦊',
  text text not null check (length(text) between 1 and 1000),
  created_at bigint not null,
  edited_at bigint
);
create index if not exists nearby_dm_pair on polygon_private.nearby_dm(from_user_id, to_user_id, created_at);

-- 5. Public wrapper functions (called by authenticated users via RPC)

-- Register / update presence
create or replace function public.nearby_heartbeat(
  p_lat double precision,
  p_lng double precision
) returns void language plpgsql security definer set search_path='' as $$
declare
  u uuid := auth.uid();
  prof polygon_private.profiles;
begin
  if u is null then raise exception 'Not authenticated'; end if;
  select * into prof from polygon_private.profiles where user_id = u;
  if not found then raise exception 'Profile not found'; end if;
  insert into polygon_private.nearby_presence (user_id, alias, avatar, gender, profession, lat, lng, updated_at)
    values (u, prof.alias, prof.avatar, prof.gender, prof.profession, p_lat, p_lng, extract(epoch from now())::bigint * 1000)
  on conflict (user_id) do update set
    alias = prof.alias, avatar = prof.avatar, gender = prof.gender, profession = prof.profession,
    lat = p_lat, lng = p_lng, updated_at = extract(epoch from now())::bigint * 1000;
end $$;

-- Fetch nearby users within radius
create or replace function public.nearby_fetch(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 2
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u uuid := auth.uid();
  cutoff bigint;
  result jsonb;
begin
  if u is null then raise exception 'Not authenticated'; end if;
  cutoff := (extract(epoch from now())::bigint * 1000) - 300000; -- 5 min stale
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', np.user_id,
    'alias', np.alias,
    'avatar', np.avatar,
    'gender', np.gender,
    'profession', np.profession,
    'lat', np.lat,
    'lng', np.lng,
    'distKm', round((12742.0174 * asin(sqrt(least(1,
      power(sin(radians(np.lat - p_lat)/2), 2) +
      cos(radians(p_lat)) * cos(radians(np.lat)) *
      power(sin(radians(np.lng - p_lng)/2), 2)
    ))))::numeric, 3)
  ) order by (12742.0174 * asin(sqrt(least(1,
      power(sin(radians(np.lat - p_lat)/2), 2) +
      cos(radians(p_lat)) * cos(radians(np.lat)) *
      power(sin(radians(np.lng - p_lng)/2), 2)
    ))))),'[]'::jsonb)
  into result
  from polygon_private.nearby_presence np
  where np.user_id <> u
    and np.lat is not null
    and np.lng is not null
    and np.updated_at > cutoff
    and (12742.0174 * asin(sqrt(least(1,
      power(sin(radians(np.lat - p_lat)/2), 2) +
      cos(radians(p_lat)) * cos(radians(np.lat)) *
      power(sin(radians(np.lng - p_lng)/2), 2)
    )))) <= least(p_radius_km, 2);
  return result;
end $$;

-- Send a global chat message
create or replace function public.nearby_chat_send(
  p_text text,
  p_reply_to text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u uuid := auth.uid();
  prof polygon_private.profiles;
  msg_id text;
  now_ms bigint;
begin
  if u is null then raise exception 'Not authenticated'; end if;
  if p_text is null or length(btrim(p_text)) = 0 then raise exception 'Message cannot be empty'; end if;
  select * into prof from polygon_private.profiles where user_id = u;
  if not found then raise exception 'Profile not found'; end if;
  msg_id := extract(epoch from now())::bigint::text || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,7);
  now_ms := extract(epoch from now())::bigint * 1000;
  insert into polygon_private.nearby_chat (id, user_id, alias, avatar, gender, text, reply_to, created_at)
    values (msg_id, u, prof.alias, prof.avatar, prof.gender, btrim(p_text), p_reply_to, now_ms);
  return jsonb_build_object('id', msg_id, 'userId', u, 'alias', prof.alias, 'avatar', prof.avatar, 'gender', prof.gender,
    'text', btrim(p_text), 'replyTo', p_reply_to, 'createdAt', now_ms);
end $$;

-- Edit a global chat message
create or replace function public.nearby_chat_edit(
  p_message_id text,
  p_text text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u uuid := auth.uid();
  now_ms bigint;
begin
  if u is null then raise exception 'Not authenticated'; end if;
  now_ms := extract(epoch from now())::bigint * 1000;
  update polygon_private.nearby_chat set text = btrim(p_text), edited_at = now_ms
    where id = p_message_id and user_id = u;
  if not found then raise exception 'Message not found or not yours'; end if;
  return jsonb_build_object('messageId', p_message_id, 'text', btrim(p_text), 'editedAt', now_ms);
end $$;

-- Delete a global chat message
create or replace function public.nearby_chat_delete(
  p_message_id text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Not authenticated'; end if;
  delete from polygon_private.nearby_chat where id = p_message_id and user_id = u;
  if not found then raise exception 'Message not found or not yours'; end if;
  return jsonb_build_object('messageId', p_message_id);
end $$;

-- Get chat history (last 60 messages)
create or replace function public.nearby_chat_history()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u uuid := auth.uid();
begin
  if u is null then raise exception 'Not authenticated'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'userId', c.user_id, 'alias', c.alias, 'avatar', c.avatar, 'gender', c.gender,
      'text', c.text, 'replyTo', c.reply_to, 'createdAt', c.created_at, 'editedAt', c.edited_at
    ) order by c.created_at)
    from (select * from polygon_private.nearby_chat order by created_at desc limit 60) c
  ), '[]'::jsonb);
end $$;

-- Send DM
create or replace function public.nearby_dm_send(
  p_to_user_id uuid,
  p_text text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u uuid := auth.uid();
  prof polygon_private.profiles;
  msg_id text;
  now_ms bigint;
begin
  if u is null then raise exception 'Not authenticated'; end if;
  if p_text is null or length(btrim(p_text)) = 0 then raise exception 'Message cannot be empty'; end if;
  select * into prof from polygon_private.profiles where user_id = u;
  if not found then raise exception 'Profile not found'; end if;
  msg_id := extract(epoch from now())::bigint::text || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,7);
  now_ms := extract(epoch from now())::bigint * 1000;
  insert into polygon_private.nearby_dm (id, from_user_id, to_user_id, from_alias, from_avatar, text, created_at)
    values (msg_id, u, p_to_user_id, prof.alias, prof.avatar, btrim(p_text), now_ms);
  return jsonb_build_object('id', msg_id, 'fromUserId', u, 'toUserId', p_to_user_id,
    'fromAlias', prof.alias, 'fromAvatar', prof.avatar,
    'text', btrim(p_text), 'createdAt', now_ms);
end $$;

-- Edit DM
create or replace function public.nearby_dm_edit(
  p_message_id text,
  p_text text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  u uuid := auth.uid();
  now_ms bigint;
begin
  if u is null then raise exception 'Not authenticated'; end if;
  now_ms := extract(epoch from now())::bigint * 1000;
  update polygon_private.nearby_dm set text = btrim(p_text), edited_at = now_ms
    where id = p_message_id and from_user_id = u;
  if not found then raise exception 'Message not found or not yours'; end if;
  return jsonb_build_object('messageId', p_message_id, 'text', btrim(p_text), 'editedAt', now_ms);
end $$;

-- Delete DM
create or replace function public.nearby_dm_delete(
  p_message_id text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Not authenticated'; end if;
  delete from polygon_private.nearby_dm where id = p_message_id and from_user_id = u;
  if not found then raise exception 'Message not found or not yours'; end if;
  return jsonb_build_object('messageId', p_message_id);
end $$;

-- Fetch DM history with a specific user
create or replace function public.nearby_dm_history(
  p_with_user_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Not authenticated'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id, 'fromUserId', d.from_user_id, 'toUserId', d.to_user_id,
      'fromAlias', d.from_alias, 'fromAvatar', d.from_avatar,
      'text', d.text, 'createdAt', d.created_at, 'editedAt', d.edited_at
    ) order by d.created_at)
    from (
      select * from polygon_private.nearby_dm
      where (from_user_id = u and to_user_id = p_with_user_id)
         or (from_user_id = p_with_user_id and to_user_id = u)
      order by created_at desc limit 100
    ) d
  ), '[]'::jsonb);
end $$;

-- Remove stale presence (call periodically or from cleanup cron)
create or replace function public.nearby_cleanup() returns void
language plpgsql security definer set search_path='' as $$
declare cutoff bigint;
begin
  cutoff := (extract(epoch from now())::bigint * 1000) - 1800000; -- 30 min
  delete from polygon_private.nearby_presence where updated_at < cutoff;
  -- Clean up old chat messages (older than 24h)
  delete from polygon_private.nearby_chat where created_at < (extract(epoch from now())::bigint * 1000) - 86400000;
  -- Clean up old DMs (older than 24h)
  delete from polygon_private.nearby_dm where created_at < (extract(epoch from now())::bigint * 1000) - 86400000;
end $$;

-- Update the polygon_api function to handle profile gender/profession
-- We need to alter the 'profile' action branch
create or replace function public.polygon_api(action text, payload jsonb default '{}') returns jsonb
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
   expiry_:=case when state_='inside' then now_+1800000 else 0 end;
   insert into polygon_private.sessions values(z,u,expiry_) on conflict(zone_id,user_id) do update set expires_at=excluded.expires_at;
   return jsonb_build_object('state',state_,'expiresAt',expiry_);
 end if;
 if not polygon_private.has_access(z) then raise exception 'Verify your live location to access this zone.'; end if;
 manage:=coalesce((payload->>'management')::boolean,false);
 if (manage or action in ('manageUser','removeContent','resolveReport','rotateToken','restoreToken','addDomain','removeDomain')) and not admin then raise exception 'Only this zone''s management can do this.'; end if;
 if action='snapshot' then
   gid:=(payload->>'groupId')::uuid;
   select coalesce(jsonb_agg(polygon_private.content_json(c) order by c.created_at desc),'[]') into active from
     (select * from polygon_private.content c where c.zone_id=z and c.status='active' and c.expires_at>now_ and c.kind<>'message'
       and polygon_private.readable(c.id) order by c.created_at desc limit 300) c;
   result:=jsonb_build_object('zone',jsonb_build_object('id',z,'name',zone.name,'type',zone.type,'domains',zone.domains),
     'me',jsonb_build_object('publicId',member.public_id,'alias',profile.alias,'avatar',profile.avatar,'role',member.role,'status',member.status,'gender',profile.gender,'profession',profile.profession),
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
   begin update polygon_private.profiles set
     alias=name_,
     avatar=payload->>'avatar',
     gender=coalesce(left(payload->>'gender',20),''),
     profession=coalesce(left(payload->>'profession',60),'')
   where user_id=u;
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

-- Grant permissions on new functions
revoke all on function public.nearby_heartbeat(double precision, double precision) from public, anon;
grant execute on function public.nearby_heartbeat(double precision, double precision) to authenticated;

revoke all on function public.nearby_fetch(double precision, double precision, double precision) from public, anon;
grant execute on function public.nearby_fetch(double precision, double precision, double precision) to authenticated;

revoke all on function public.nearby_chat_send(text, text) from public, anon;
grant execute on function public.nearby_chat_send(text, text) to authenticated;

revoke all on function public.nearby_chat_edit(text, text) from public, anon;
grant execute on function public.nearby_chat_edit(text, text) to authenticated;

revoke all on function public.nearby_chat_delete(text) from public, anon;
grant execute on function public.nearby_chat_delete(text) to authenticated;

revoke all on function public.nearby_chat_history() from public, anon;
grant execute on function public.nearby_chat_history() to authenticated;

revoke all on function public.nearby_dm_send(uuid, text) from public, anon;
grant execute on function public.nearby_dm_send(uuid, text) to authenticated;

revoke all on function public.nearby_dm_edit(text, text) from public, anon;
grant execute on function public.nearby_dm_edit(text, text) to authenticated;

revoke all on function public.nearby_dm_delete(text) from public, anon;
grant execute on function public.nearby_dm_delete(text) to authenticated;

revoke all on function public.nearby_dm_history(uuid) from public, anon;
grant execute on function public.nearby_dm_history(uuid) to authenticated;

revoke all on function public.nearby_cleanup() from public, anon;
grant execute on function public.nearby_cleanup() to authenticated;

-- Enable RLS on new tables
alter table polygon_private.nearby_presence enable row level security;
alter table polygon_private.nearby_chat enable row level security;
alter table polygon_private.nearby_dm enable row level security;

notify pgrst, 'reload schema';
commit;
