-- One-off: set genders for specific players (run in Supabase SQL editor as admin).
-- Adjust emails if yours differ slightly.

update public.profiles
set gender = 'male'
where lower(email) = lower('summar.adm@mietjammu.in');

update public.profiles
set gender = 'female'
where lower(email) = lower('2022a6r048@mietjammu.in');

update public.profiles
set gender = 'female'
where lower(email) = lower('sukritichadha07@gmail.com');
