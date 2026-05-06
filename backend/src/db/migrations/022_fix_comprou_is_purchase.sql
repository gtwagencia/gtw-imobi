-- Corrige estágios "Comprou" existentes que foram criados antes da migration 020
-- e ficaram com is_purchase = false (valor padrão).
UPDATE kanban_stages
SET is_purchase = true
WHERE name = 'Comprou'
  AND is_purchase = false;
