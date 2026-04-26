DROP POLICY IF EXISTS "entity anon insert" ON public.entity;

CREATE POLICY "entity anon insert"
ON public.entity
FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(trim(entitydocument)) > 0
  AND length(trim(fullname)) > 0
);