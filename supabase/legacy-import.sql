-- Run AFTER 202610100001_polygon.sql, BEFORE serving the updated frontend.
-- This imports the public-table format used by src/lib/supabaseBackend.js before v2.
-- Take a backup and inspect the live schema first. All changes are one transaction.
-- Originals remain intact; their old client grants are revoked only after import succeeds.
begin;
create function polygon_private.legacy_ms(v text) returns bigint language plpgsql set search_path='' as $$
begin
 if v is null or v='' then return polygon_private.now_ms(); end if;
 if v ~ '^[0-9]+([.][0-9]+)?$' then return v::numeric::bigint; end if;
 return (extract(epoch from v::timestamptz)*1000)::bigint;
end $$;
do $$
declare j jsonb; p jsonb; z uuid; u uuid; a text; h text; image_ text; bucket_ text;
  original_count bigint; imported_count bigint; table_ text;
begin
 if to_regclass('public.zones') is null or to_regclass('public.members') is null or to_regclass('public.content') is null then
   raise exception 'Legacy zones, members and content tables were not found. Do not run this import on a new project.';
 end if;
 for j in execute 'select to_jsonb(t) from public.members t order by t.user_id,t.zone_id' loop
   u:=(j->>'user_id')::uuid;
   if u is null then raise exception 'Legacy member has no user_id'; end if;
   a:=j->>'alias';
   if a is null or a !~ '^[A-Za-z][A-Za-z0-9_]{2,23}$' then a:='Member_'||substr(replace(u::text,'-',''),1,12); end if;
   if exists(select 1 from polygon_private.profiles where lower(alias)=lower(a) and user_id<>u) then a:=left(a,11)||'_'||substr(replace(u::text,'-',''),1,12); end if;
   insert into polygon_private.profiles(user_id,alias,avatar) values(u,a,coalesce(j->>'avatar','🦊')) on conflict(user_id) do nothing;
 end loop;
 for j in execute 'select to_jsonb(t) from public.zones t' loop
   z:=(j->>'id')::uuid; u:=(j->>'owner_uid')::uuid; h:=j->>'token_hash';
   if u is null or h is null or h !~ '^[0-9a-f]{64}$' then raise exception 'Zone % has invalid owner or token hash',z; end if;
   if not exists(select 1 from polygon_private.profiles where user_id=u) then raise exception 'Zone % has no owner membership. Repair it before importing.',z; end if;
   insert into polygon_private.zones(id,name,type,boundary,owner_uid,token_hash,invite_token,domains,created_at)
   values(z,j->>'name',j->>'type',j->'boundary',u,h,null,coalesce(j->'domains','[]'),polygon_private.legacy_ms(j->>'created_at'))
   on conflict(id) do nothing;
 end loop;
 for j in execute 'select to_jsonb(t) from public.members t' loop
   z:=(j->>'zone_id')::uuid; u:=(j->>'user_id')::uuid;
   if j->>'role'='admin' and not exists(select 1 from polygon_private.zones where id=z and owner_uid=u) then
     raise exception 'Review additional legacy administrator % in zone % before import.',u,z;
   end if;
   insert into polygon_private.members values(z,u,j->>'public_id',coalesce(j->>'role','member'),coalesce(j->>'status','pending'))
   on conflict(zone_id,user_id) do nothing;
 end loop;
 if exists(select 1 from polygon_private.zones z where not exists(select 1 from polygon_private.members m where m.zone_id=z.id and m.user_id=z.owner_uid and m.role='admin' and m.status='active')) then
   raise exception 'An imported zone does not have an active owner. No import changes were saved.';
 end if;
 for j in execute 'select to_jsonb(t) from public.content t' loop
   z:=(j->>'zone_id')::uuid;
   select user_id into u from polygon_private.members where zone_id=z and public_id=j->>'author_id';
   if u is null then raise exception 'Content % has no matching zone author. Repair before importing.',j->>'id'; end if;
   image_:=null; bucket_:='polygon-media';
   if coalesce(j->>'image_url','')<>'' then
     if j->>'image_url' not like '%/storage/v1/object/public/post-images/%' then raise exception 'Review external image URL on content % before import.',j->>'id'; end if;
     image_:=split_part(j->>'image_url','/storage/v1/object/public/post-images/',2); bucket_:='post-images';
   end if;
   p:=jsonb_build_object('title',coalesce(j->>'title',''),'text',coalesce(j->>'text',''),'category',j->>'category','place',j->>'place',
     'itemCategory',j->>'item_category','approximateTime',j->>'approximate_time','additionalInfo',j->>'additional_info',
     'itemStatus',j->>'item_status','sponsored',coalesce((j->>'sponsored')::boolean,false),'startsAt',j->'starts_at','registration',j->>'registration',
     'domain',j->>'domain','topic',j->>'topic','replyTo',j->>'reply_to');
   insert into polygon_private.content(id,zone_id,author_uid,kind,status,created_at,expires_at,body,image_path,image_bucket)
   values((j->>'id')::uuid,z,u,j->>'kind',coalesce(j->>'status','active'),polygon_private.legacy_ms(j->>'created_at'),polygon_private.legacy_ms(j->>'expires_at'),p,image_,bucket_)
   on conflict(id) do nothing;
 end loop;
 for j in execute 'select to_jsonb(t) from public.content t' loop
   z:=(j->>'zone_id')::uuid;
   foreach table_ in array array['parent_id','group_id','event_id'] loop
     if nullif(j->>table_,'') is not null then
       if not exists(select 1 from polygon_private.content where id=(j->>table_)::uuid and zone_id=z) then raise exception 'Invalid legacy content relationship for %',j->>'id'; end if;
       execute format('update polygon_private.content set %I=$1 where id=$2',table_) using (j->>table_)::uuid,(j->>'id')::uuid;
     end if;
   end loop;
 end loop;
 if exists(select 1 from polygon_private.content c where
   (c.kind='comment' and not exists(select 1 from polygon_private.content p where p.id=c.parent_id and p.kind='post')) or
   (c.kind='message' and not exists(select 1 from polygon_private.content p where p.id=c.group_id and p.kind='group')) or
   (c.kind in ('post','group') and (c.parent_id is not null or c.group_id is not null)) or
   (c.event_id is not null and not exists(select 1 from polygon_private.content e where e.id=c.event_id and e.kind='post' and e.body->>'category'='event' and e.event_id is null))) then raise exception 'Invalid legacy thread relationships. Repair before import.'; end if;
 if to_regclass('public.group_members') is not null then
   for j in execute 'select to_jsonb(t) from public.group_members t' loop
     if coalesce((j->>'active')::boolean,false) then insert into polygon_private.group_members values((j->>'group_id')::uuid,(j->>'user_id')::uuid) on conflict do nothing; end if;
   end loop;
 end if;
 if to_regclass('public.likes') is not null then
   for j in execute 'select to_jsonb(t) from public.likes t' loop
     select user_id into u from polygon_private.members where zone_id=(j->>'zone_id')::uuid and public_id=j->>'actor';
     if u is not null then insert into polygon_private.likes values((j->>'post_id')::uuid,u) on conflict do nothing; end if;
   end loop;
 end if;
 if to_regclass('public.blocks') is not null then
   for j in execute 'select to_jsonb(t) from public.blocks t' loop
     insert into polygon_private.blocks select (j->>'zone_id')::uuid,a.user_id,b.user_id from polygon_private.members a,polygon_private.members b
     where a.zone_id=(j->>'zone_id')::uuid and b.zone_id=a.zone_id and a.public_id=j->>'owner_id' and b.public_id=j->>'target_id' and a.user_id<>b.user_id on conflict do nothing;
   end loop;
 end if;
 if to_regclass('public.reports') is not null then
   for j in execute 'select to_jsonb(t) from public.reports t' loop
     z:=(j->>'zone_id')::uuid;
     if j->>'target_type'='user' then a:=j->>'target_id'; p:=jsonb_build_object('kind','user','authorId',a);
     else select m.public_id,polygon_private.content_json(c) into a,p from polygon_private.content c join polygon_private.members m on m.zone_id=c.zone_id and m.user_id=c.author_uid where c.id=(j->>'target_id')::uuid and c.zone_id=z; end if;
     if a is null then raise exception 'Report % has no target. Review before import.',j->>'id'; end if;
     insert into polygon_private.reports(id,zone_id,reporter_uid,target_id,target_type,author_id,reason,status,created_at,evidence)
     values((j->>'id')::uuid,z,(j->>'reporter_uid')::uuid,j->>'target_id',j->>'target_type',a,j->>'reason',coalesce(j->>'status','open'),polygon_private.legacy_ms(j->>'created_at'),p) on conflict(id) do nothing;
   end loop;
 end if;
 execute 'select count(*) from public.content' into original_count;
 select count(*) into imported_count from polygon_private.content;
 if imported_count<original_count then raise exception 'Content count mismatch. Import rolled back.'; end if;
 -- Legacy sessions are deliberately NOT copied: get a fresh, short-lived location check.
 update storage.buckets set public=false where id='post-images';
 foreach table_ in array array['zones','members','content','zone_tokens','user_zones','sessions','signals','group_members','likes','blocks','reports','presence','moderation_log','audit_log'] loop
   if to_regclass('public.'||table_) is not null then execute format('revoke all on table public.%I from public,anon,authenticated',table_); end if;
 end loop;
end $$;
drop function polygon_private.legacy_ms(text);
notify pgrst,'reload schema';
commit;
