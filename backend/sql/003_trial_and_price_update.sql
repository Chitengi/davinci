-- Align pricing with product request and keep legacy plan codes in sync.
update public.subscription_plans
set
  name = 'Monthly Access',
  description = 'Full access for 30 days at K2',
  amount_zmw = 2.00,
  billing_cycle = 'monthly',
  is_active = true
where code in ('monthly_2', 'monthly_5');

update public.subscription_plans
set
  name = 'Annual Access',
  description = 'Full access for 365 days at K20',
  amount_zmw = 20.00,
  billing_cycle = 'yearly',
  is_active = true
where code in ('yearly_20', 'yearly_50');

insert into public.subscription_plans (code, name, description, amount_zmw, currency, billing_cycle, is_active)
values
  ('monthly_2', 'Monthly Access', 'Full access for 30 days at K2', 2.00, 'ZMW', 'monthly', true),
  ('yearly_20', 'Annual Access', 'Full access for 365 days at K20', 20.00, 'ZMW', 'yearly', true)
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  amount_zmw = excluded.amount_zmw,
  currency = excluded.currency,
  billing_cycle = excluded.billing_cycle,
  is_active = excluded.is_active;
