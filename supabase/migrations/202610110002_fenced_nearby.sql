-- Secure zone chat, exact opt-in presence, and LAN-attested network subzones.
begin;
alter table polygon_private.profiles add column if not exists gender text not null default '', add column if not exists profession text not null default '', add column if not exists share_profile boolean not null default false;
create or replace function polygon_private.core_api(action text,payload jsonb default '{}') returns jsonb
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
   if payload->>'zoneId' is not null and payload->>'zoneId' <> '' then
     select * into zone from polygon_private.zones where id = (payload->>'zoneId')::uuid;
   elsif payload->>'token' is not null and payload->>'token' <> '' then
     token:=upper(btrim(payload->>'token'));
     select * into zone from polygon_private.zones where token_hash=encode(sha256(convert_to(token,'UTF8')),'hex') or invite_token=token;
   else
     raise exception 'Provide a zone token or select a zone.';
   end if;
   if zone.id is null then raise exception 'Zone token is invalid or has been rotated.'; end if;
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


-- Applied by the ordered migration assembled below. Contains no client-writable public chat.
create table polygon_private.live_people (
 zone_id uuid not null, user_id uuid not null, latitude float8, longitude float8,
 expires_at bigint not null, typing_until bigint not null default 0, typing_scope text not null default 'zone',
 primary key(zone_id,user_id), foreign key(zone_id,user_id) references polygon_private.members on delete cascade
);
create table polygon_private.network_zones (
 id uuid primary key default gen_random_uuid(),zone_id uuid references polygon_private.zones,
 name text not null,secret_hash text not null,enabled boolean not null default true
);
create table polygon_private.network_sessions (
 network_id uuid references polygon_private.network_zones, user_id uuid references polygon_private.profiles,
 expires_at bigint not null,primary key(network_id,user_id)
);
create table polygon_private.live_messages (
 id uuid primary key default gen_random_uuid(), zone_id uuid not null references polygon_private.zones,
 author_uid uuid not null references polygon_private.profiles, peer_uid uuid references polygon_private.profiles,
 network_id uuid references polygon_private.network_zones, text text not null check(length(text) between 1 and 2000),
 created_at bigint not null,expires_at bigint not null,edited_at bigint,status text not null default 'active',
 client_id uuid not null, unique(author_uid,client_id),check(peer_uid is null or peer_uid<>author_uid)
);
create index live_message_scope on polygon_private.live_messages(zone_id,network_id,created_at desc);
create index live_message_peer on polygon_private.live_messages(peer_uid,created_at desc);
create table public.polygon_events(zone_id uuid primary key references polygon_private.zones,revision bigint not null default 1);
alter table public.polygon_events enable row level security;
revoke all on public.polygon_events from public,anon,authenticated;
grant select on public.polygon_events to authenticated;
grant execute on function polygon_private.has_access(uuid) to authenticated;
create policy polygon_events_member on public.polygon_events for select to authenticated using(polygon_private.has_access(zone_id));
create function polygon_private.bump_zone() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.polygon_events(zone_id) values(new.zone_id) on conflict(zone_id) do update set revision=public.polygon_events.revision+1;
 return new;
end $$;
create trigger content_updates after insert or update on polygon_private.content for each row execute function polygon_private.bump_zone();
create trigger live_chat_updates after insert or update on polygon_private.live_messages for each row execute function polygon_private.bump_zone();
create trigger membership_updates after insert or update on polygon_private.members for each row execute function polygon_private.bump_zone();
create trigger report_updates after insert or update on polygon_private.reports for each row execute function polygon_private.bump_zone();
create function polygon_private.live_access(z uuid,u uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from polygon_private.members m join polygon_private.sessions s using(zone_id,user_id)
 where m.zone_id=z and m.user_id=u and m.status='active' and s.expires_at>extract(epoch from statement_timestamp())*1000)
$$;
create function polygon_private.live_json(c polygon_private.live_messages) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'kind','nearby','authorId',m.public_id,'alias',p.alias,'avatar',p.avatar,
 'gender',case when p.share_profile then p.gender else '' end,'profession',case when p.share_profile then p.profession else '' end,
 'text',c.text,'createdAt',c.created_at,'expiresAt',c.expires_at,'editedAt',c.edited_at,'status',c.status,
 'networkId',c.network_id,'private',c.peer_uid is not null)
 from polygon_private.members m join polygon_private.profiles p on p.user_id=m.user_id
 where m.zone_id=c.zone_id and m.user_id=c.author_uid
$$;
create or replace function public.polygon_nearby(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid();z uuid:=(payload->>'zoneId')::uuid;n bigint:=polygon_private.now_ms();
 m polygon_private.members;p polygon_private.profiles;c polygon_private.live_messages;peer polygon_private.members;
 gateway_ polygon_private.network_zones;net uuid:=(nullif(payload->>'networkId',''))::uuid;
 result jsonb; rows_ jsonb; messages_ jsonb; networks_ jsonb; fix jsonb;state_ text;exp bigint;secret_ text;
 scope_ text;peer_id text:=nullif(payload->>'peerId','');cid uuid;text_ text;
begin
 if u is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'Sign in first.' using errcode='42501'; end if;
 if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>16000 then raise exception 'Invalid request.'; end if;
 select * into m from polygon_private.members where zone_id=z and user_id=u and status='active';
 if not found then raise exception 'This zone has not approved your access.' using errcode='42501'; end if;
 select * into p from polygon_private.profiles where user_id=u;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 delete from polygon_private.live_people where expires_at<=n;
 delete from polygon_private.network_sessions where expires_at<=n;
 if action='hide' then delete from polygon_private.live_people where zone_id=z and user_id=u;return '{"ok":true}'; end if;
 if action='networkCreate' then
   if not polygon_private.is_admin(z) then raise exception 'Only this zone manager can register a LAN gateway.';end if;
   perform polygon_private.throttle('networkCreate',5,86400000);
   if length(btrim(coalesce(payload->>'name',''))) not between 2 and 60 then raise exception 'Enter a network name (2–60 characters).';end if;
   secret_:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
   insert into polygon_private.network_zones(zone_id,name,secret_hash) values(z,btrim(payload->>'name'),encode(sha256(convert_to(secret_,'UTF8')),'hex')) returning * into gateway_;
   return jsonb_build_object('id',gateway_.id,'name',gateway_.name,'secret',secret_);
 end if;
 if action='networkDisable' then
   if not polygon_private.is_admin(z) then raise exception 'Only this zone manager can disable a LAN gateway.';end if;
   update polygon_private.network_zones set enabled=false where id=net and zone_id=z;
   delete from polygon_private.network_sessions where network_id=net;
   return '{"ok":true}';
 end if;
 -- Manager moderation is permitted off-site; normal Nearby chat is not, even for admins.
 if action='delete' and polygon_private.is_admin(z) then
   update polygon_private.live_messages set status='removed' where id=(payload->>'target')::uuid and zone_id=z;
   if not found then raise exception 'Message not found in this zone.';end if;
   insert into polygon_private.audit(zone_id,user_id,action,target,created_at) values(z,u,'remove_nearby',payload->>'target',n);
   return '{"ok":true}';
 end if;
 if action='presence' then
   perform polygon_private.throttle('nearby:presence',30);
   fix:=payload->'fix';
   select polygon_private.locate(fix,boundary) into state_ from polygon_private.zones where id=z;
   exp:=case when state_='inside' then n+45000 else 0 end;
   insert into polygon_private.sessions values(z,u,exp) on conflict(zone_id,user_id) do update set expires_at=excluded.expires_at;
   if state_<>'inside' then
     delete from polygon_private.live_people where zone_id=z and user_id=u;
     return jsonb_build_object('state',state_,'expiresAt',0);
   end if;
   insert into polygon_private.live_people(zone_id,user_id,latitude,longitude,expires_at)
   values(z,u,case when payload->>'share'='true' then (fix->>'latitude')::float8 end,
     case when payload->>'share'='true' then (fix->>'longitude')::float8 end,exp)
   on conflict(zone_id,user_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,expires_at=excluded.expires_at;
   return jsonb_build_object('state',state_,'expiresAt',exp);
 end if;
 if not polygon_private.live_access(z,u) then raise exception 'A fresh location inside this fence is required.' using errcode='42501';end if;
 if action='networkAttest' then
   perform polygon_private.throttle('networkAttest',6);
   select * into gateway_ from polygon_private.network_zones where id=net and zone_id=z and enabled;
   if gateway_.id is null or gateway_.secret_hash is distinct from encode(sha256(convert_to(coalesce(payload->>'secret',''),'UTF8')),'hex') then raise exception 'LAN gateway verification failed.' using errcode='42501';end if;
   insert into polygon_private.network_sessions values(net,u,n+45000) on conflict(network_id,user_id) do update set expires_at=excluded.expires_at;
   return jsonb_build_object('networkId',net,'name',gateway_.name,'expiresAt',n+45000);
 end if;
 if net is not null and not exists(select 1 from polygon_private.network_sessions s join polygon_private.network_zones nw on nw.id=s.network_id
   where nw.id=net and nw.zone_id=z and nw.enabled and s.user_id=u and s.expires_at>n) then raise exception 'Reconnect to this campus network to enter its subzone.' using errcode='42501';end if;
 if peer_id is not null then
   select * into peer from polygon_private.members where zone_id=z and public_id=peer_id and status='active';
   if peer.user_id is null or peer.user_id=u or polygon_private.blocked(z,peer.user_id) or not polygon_private.live_access(z,peer.user_id)
     or not exists(select 1 from polygon_private.live_people where zone_id=z and user_id=peer.user_id and expires_at>n)
     then raise exception 'This person is unavailable inside your fence.' using errcode='42501';end if;
   if net is not null and not exists(select 1 from polygon_private.network_sessions where network_id=net and user_id=peer.user_id and expires_at>n) then raise exception 'This person has left the network subzone.' using errcode='42501';end if;
 end if;
 scope_:=coalesce(net::text,'zone')||':'||case when peer_id is null then 'all' else least(m.public_id,peer_id)||':'||greatest(m.public_id,peer_id) end;
 if action='snapshot' then
   select coalesce(jsonb_agg(jsonb_build_object('id',lm.public_id,'alias',lp.alias,'avatar',lp.avatar,
     'gender',case when lp.share_profile then lp.gender else '' end,'profession',case when lp.share_profile then lp.profession else '' end,
     'latitude',pr.latitude,'longitude',pr.longitude,'expiresAt',pr.expires_at,
     'typing',pr.typing_until>n and pr.typing_scope=scope_) order by lp.alias),'[]') into rows_
   from polygon_private.live_people pr join polygon_private.members lm using(zone_id,user_id) join polygon_private.profiles lp using(user_id)
   where pr.zone_id=z and pr.expires_at>n and lm.status='active' and polygon_private.live_access(z,pr.user_id) and not polygon_private.blocked(z,pr.user_id)
     and (net is null or exists(select 1 from polygon_private.network_sessions ns where ns.network_id=net and ns.user_id=pr.user_id and ns.expires_at>n));
   select coalesce(jsonb_agg(polygon_private.live_json(q) order by q.created_at,q.id),'[]') into messages_
   from (select * from polygon_private.live_messages q where q.zone_id=z and q.network_id is not distinct from net and q.status='active' and q.expires_at>n
     and not polygon_private.blocked(z,q.author_uid)
     and ((peer_id is null and q.peer_uid is null) or (peer_id is not null and ((q.author_uid=u and q.peer_uid=peer.user_id) or (q.author_uid=peer.user_id and q.peer_uid=u))))
     order by q.created_at desc,q.id desc limit 100) q;
   select coalesce(jsonb_agg(jsonb_build_object('id',nw.id,'name',nw.name,'connected',exists(select 1 from polygon_private.network_sessions ns where ns.network_id=nw.id and ns.user_id=u and ns.expires_at>n))),'[]') into networks_
   from polygon_private.network_zones nw where nw.zone_id=z and nw.enabled;
   return jsonb_build_object('people',rows_,'messages',messages_,'networks',networks_);
 end if;
 perform polygon_private.throttle('nearby:'||action,case when action='typing' then 30 when action='send' then 20 else 10 end);
 if action='typing' then
   update polygon_private.live_people set typing_until=case when payload->>'typing'='true' then n+5000 else 0 end,typing_scope=scope_ where zone_id=z and user_id=u;
   return '{"ok":true}';
 end if;
 text_:=btrim(coalesce(payload->>'text',''));
 if action in ('send','edit') then
   if length(text_) not between 1 and 2000 then raise exception 'Write between 1 and 2000 characters.';end if;
   if text_ ~* '([A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}|[0-9][0-9 .()+-]{8,}[0-9])' then raise exception 'Keep phone numbers and email addresses out of chat.';end if;
 end if;
 if action='send' then
   cid:=(payload->>'clientId')::uuid;if cid is null then raise exception 'Missing message identifier.';end if;
   select * into c from polygon_private.live_messages where author_uid=u and client_id=cid;
   if found then
     if c.zone_id<>z or c.network_id is distinct from net or c.peer_uid is distinct from peer.user_id then raise exception 'Message identifier belongs to another conversation.';end if;
     return polygon_private.live_json(c);
   end if;
   insert into polygon_private.live_messages(zone_id,author_uid,peer_uid,network_id,text,created_at,expires_at,client_id)
   values(z,u,peer.user_id,net,text_,n,n+86400000,cid) returning * into c;
 elsif action in ('edit','delete','report') then
   select * into c from polygon_private.live_messages where id=(payload->>'target')::uuid and zone_id=z and status='active' and expires_at>n;
   if c.id is null or c.network_id is distinct from net or polygon_private.blocked(z,c.author_uid)
     or (c.peer_uid is not null and u not in (c.author_uid,c.peer_uid)) then raise exception 'Message is unavailable in this conversation.';end if;
   if action='report' then
     if payload->>'reason' not in ('spam','harassment','hate_speech','scam','privacy_violation','other') then raise exception 'Select a report reason.';end if;
     if not exists(select 1 from polygon_private.reports where zone_id=z and reporter_uid=u and target_id=c.id::text and status='open') then
       insert into polygon_private.reports(zone_id,reporter_uid,target_id,target_type,author_id,reason,created_at,evidence)
       select z,u,c.id::text,'nearby',lm.public_id,payload->>'reason',n,polygon_private.live_json(c) from polygon_private.members lm where lm.zone_id=z and lm.user_id=c.author_uid;
     end if;return '{"ok":true}';
   end if;
   if c.author_uid<>u then raise exception 'You can only change your own messages.';end if;
   if action='delete' then update polygon_private.live_messages set status='removed' where id=c.id;return '{"ok":true}';end if;
   update polygon_private.live_messages set text=text_,edited_at=n where id=c.id returning * into c;
 else raise exception 'Unknown Nearby action.';end if;
 return polygon_private.live_json(c);
end $$;

create or replace function public.polygon_api(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; p polygon_private.profiles; z uuid; b jsonb;
begin
 if action in ('removeContent','deleteContent') and exists(select 1 from polygon_private.live_messages where id::text=payload->>'target' and zone_id=(payload->>'zoneId')::uuid) then
   return public.polygon_nearby('delete',payload);
 end if;
 r:=polygon_private.core_api(action,payload);
 if action='profile' then
   if length(coalesce(payload->>'gender',''))>30 or length(coalesce(payload->>'profession',''))>80 then raise exception 'Keep gender under 30 and occupation under 80 characters.';end if;
   update polygon_private.profiles set gender=btrim(coalesce(payload->>'gender','')),profession=btrim(coalesce(payload->>'profession','')),
     share_profile=coalesce((payload->>'shareProfile')::boolean,false) where user_id=auth.uid();
 elsif action='snapshot' then
   select * into p from polygon_private.profiles where user_id=auth.uid();
   z:=(payload->>'zoneId')::uuid;
   select boundary into b from polygon_private.zones where id=z;
   r:=jsonb_set(r,'{zone,boundary}',b);
   r:=jsonb_set(r,'{me}',r->'me'||jsonb_build_object('gender',p.gender,'profession',p.profession,'shareProfile',p.share_profile));
 elsif action in ('stopLocation','leaveZone') then
   delete from polygon_private.live_people where zone_id=(payload->>'zoneId')::uuid and user_id=auth.uid();
   delete from polygon_private.network_sessions where user_id=auth.uid() and network_id in(select id from polygon_private.network_zones where zone_id=(payload->>'zoneId')::uuid);
 end if;
 return r;
end $$;

-- Retire the unscoped RPCs. Old clients must not continue reading global chat/locations.
do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname like 'nearby_%' loop
   execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 end loop;
end $$;
revoke all on all tables in schema polygon_private from public,anon,authenticated;
revoke all on function polygon_private.core_api(text,jsonb),polygon_private.live_access(uuid,uuid),polygon_private.live_json(polygon_private.live_messages),polygon_private.bump_zone() from public,anon,authenticated;
revoke all on function public.polygon_nearby(text,jsonb),public.polygon_api(text,jsonb) from public,anon;
grant execute on function public.polygon_nearby(text,jsonb),public.polygon_api(text,jsonb) to authenticated;
alter table polygon_private.live_people enable row level security;
alter table polygon_private.network_zones enable row level security;
alter table polygon_private.network_sessions enable row level security;
alter table polygon_private.live_messages enable row level security;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
   alter publication supabase_realtime add table public.polygon_events;
 end if;
end $$;
create function polygon_private.expire_locations() returns void language sql security definer set search_path='' as $$
 delete from polygon_private.live_people where expires_at<=polygon_private.now_ms();
 delete from polygon_private.network_sessions where expires_at<=polygon_private.now_ms();
$$;
revoke all on function polygon_private.expire_locations() from public,anon,authenticated;
do $$ begin
 if exists(select 1 from pg_namespace where nspname='cron') then
   perform cron.schedule('polygon-expire-locations','* * * * *','select polygon_private.expire_locations()');
 end if;
end $$;
notify pgrst,'reload schema';

commit;
