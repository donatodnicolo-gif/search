-- Assegnazione dei task: chi crea può assegnare a un altro; l'admin vede tutto.
-- `owner` = a chi è assegnato · `creato_da` = chi l'ha creato.
alter table tasks add column if not exists creato_da uuid references auth.users(id) default auth.uid();
update tasks set creato_da = owner where creato_da is null;

drop policy if exists tasks_owner on tasks;
drop policy if exists tasks_select on tasks;
drop policy if exists tasks_insert on tasks;
drop policy if exists tasks_update on tasks;
drop policy if exists tasks_delete on tasks;

-- Vedo: i task assegnati a me, quelli che ho creato (per altri), e — se admin — tutti.
create policy tasks_select on tasks for select to authenticated
  using (
    owner = auth.uid()
    or creato_da = auth.uid()
    or (auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it'
  );

-- Creo: devo esserne io il creatore; l'assegnatario (owner) può essere chiunque.
create policy tasks_insert on tasks for insert to authenticated
  with check (creato_da = auth.uid());

-- Modifico: i miei (assegnati o creati) o — se admin — qualunque.
create policy tasks_update on tasks for update to authenticated
  using (
    owner = auth.uid()
    or creato_da = auth.uid()
    or (auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it'
  )
  with check (
    creato_da = auth.uid()
    or (auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it'
  );

create policy tasks_delete on tasks for delete to authenticated
  using (
    owner = auth.uid()
    or creato_da = auth.uid()
    or (auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it'
  );
