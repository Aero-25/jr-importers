-- The handset parser, corrected against the real supplier file.
--
-- Two bugs, both found by running 20261020010000's parser over all 59 lines of
-- an actual Active Cellular list:
--
--   1. Every pattern used \b for a word boundary. Postgres advanced regular
--      expressions read \b as a BACKSPACE character — the word boundary is \y
--      (or \m and \M for the two ends). So `\bSAMSUNG\b` matched nothing,
--      is_samsung_phone() answered false for every line including the phones,
--      and no model or 5G flag was ever read. It failed silently and
--      completely, which is the only way a regex typo gets this far.
--
--   2. A04S and A05S could not be parsed. The model pattern allowed an
--      optional trailing word like FE or ULTRA but not a bare trailing letter,
--      and the word boundary after the digits then refused to match the S.
--
-- The model is now read by three patterns tried in order, most specific first,
-- because "S25FE", "A04S" and "A07" need different shapes and a single pattern
-- that tried to cover all three got one of them wrong.

create or replace function private.parse_handset(p_name text)
returns table (model text, storage_gb integer, five_g boolean)
language plpgsql
immutable
as $$
declare
  v text := upper(coalesce(p_name, ''));
  v_storage integer;
  v_model text;
  m text[];
begin
  -- Strip the supplier's trade wording first. These say which market a handset
  -- was built for, not which handset it is.
  v := regexp_replace(v, '\((\s*(LOCAL|EXPORT|IMPORT)\s*/?\s*)+\)?', ' ', 'g');
  v := regexp_replace(v, '\y(DUAL|LTE|SIM|NEW|GUARANTEE)\y', ' ', 'g');
  v := regexp_replace(v, '\s+', ' ', 'g');

  -- Storage. The RAM/storage pair is tried first so "4/128GIG" reads as 128
  -- rather than 4, and every pattern insists on GB or GIG so that "5G" is
  -- never mistaken for a 5GB handset.
  m := regexp_match(v, '(\d+)\s*/\s*(\d+)\s*(GIG|GB)');
  if m is not null then
    v_storage := m[2]::integer;
  else
    m := regexp_match(v, '(\d+)\s*(GIG|GB)');
    if m is not null then
      v_storage := m[1]::integer;
    end if;
  end if;

  five_g := v ~ '\y5G\y';

  -- Model, most specific shape first.
  --
  -- Foldables carry a word instead of a family letter.
  m := regexp_match(v, '\yZ\s*-?\s*(FOLD|FLIP)\s*(\d+)\y');
  if m is not null then
    v_model := 'Z-' || upper(m[1]) || ' ' || m[2];
  else
    -- "S25FE", "S25 FE", "S26 ULTRA", "S26 PLUS": a family letter, a number,
    -- and a suffix word that is part of the handset's name.
    m := regexp_match(v, '\y([ASMF])\s*(\d{2,3})\s*(FE|PLUS|ULTRA|LITE)\y');
    if m is not null then
      v_model := m[1] || m[2] || ' ' || m[3];
    else
      -- "A04S", "A05S": a bare trailing letter that belongs to the model.
      m := regexp_match(v, '\y([ASMF])\s*(\d{2,3})([A-Z])\y');
      if m is not null then
        v_model := m[1] || m[2] || m[3];
      else
        -- "A07", "A16", "S26".
        m := regexp_match(v, '\y([ASMF])\s*(\d{2,3})\y');
        if m is not null then
          v_model := m[1] || m[2];
        end if;
      end if;
    end if;
  end if;

  model := nullif(trim(coalesce(v_model, '')), '');
  storage_gb := v_storage;
  return next;
end;
$$;

create or replace function private.is_samsung_phone(p_name text)
returns boolean
language sql
immutable
as $$
  select upper(coalesce(p_name, '')) ~ '\ySAMSUNG\y'
     -- Tablets are the thing most easily mistaken for a phone here: same
     -- brand, same column, same kind of price. They are excluded by the word
     -- and by the X-series codes they are listed under.
     and upper(coalesce(p_name, '')) !~ '\yTAB\y|TAB-|\yTABLET\y|\yMEDIAPAD\y'
     and upper(coalesce(p_name, '')) !~ '\yX\d{3}[A-Z]?\y'
     -- Watches, buds and the rest of the accessory wall.
     and upper(coalesce(p_name, ''))
           !~ '\yWATCH\y|\yBUDS\y|\yFIT\y|\yCHARGER\y|\yCOVER\y|\yCASE\y|\yEARBUD';
$$;

revoke all on function private.parse_handset(text) from public, anon, authenticated;
revoke all on function private.is_samsung_phone(text) from public, anon, authenticated;
